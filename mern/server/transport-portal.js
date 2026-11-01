import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { sessionMiddleware } from './session-middleware.js';
import { requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { connectDb, transaction } from './db.js';
import { User, AuditEvent } from './models.js';
import { TransportBreeder, TransportTrip } from './transport-models.js';
import { clientError } from './errors.js';
import { TRANSPORT_STATUSES, TRACKABLE_STATUSES, FINAL_TRANSPORT_STATUSES, transportLocationState } from '../shared/transport.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const email = z.union([z.literal(''), z.string().trim().email().max(254).transform(value => value.toLowerCase())]);
const date = z.union([z.literal(''), z.string().datetime({ offset: true })]);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const owner = user => user?.role === 'owner';
const activeAccount = { blocked: { $ne: true }, removedAt: null };
const fields = {
  dogName: z.string().trim().min(1).max(80), breederId: id.nullable(), clientEmail: email,
  pickup: z.string().trim().min(2).max(120), destination: z.string().trim().min(2).max(120),
  pickupAt: date, etaAt: date, deviceId: z.string().trim().max(120),
};
const createInput = z.object(fields).strict();
const editInput = z.object({ ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.optional()])),
  revision: z.number().int().min(0), status: z.enum(Object.keys(TRANSPORT_STATUSES)).optional(),
  sharingEnabled: z.boolean().optional(), note: z.string().trim().max(1000).optional(),
}).strict();
const breederInput = z.object({ name: z.string().trim().min(2).max(100), accountEmail: email.refine(Boolean) }).strict();
export const gpsInput = z.object({
  deviceId: z.string().trim().min(1).max(120), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000).optional(), observedAt: z.string().datetime({ offset: true }),
}).strict();

async function accountFor(address, session) {
  if (!address) return null;
  const account = await User.findOne({ email: address, ...activeAccount }).select('_id').session(session || null).lean();
  if (!account) throw fail('That person needs an active Bravo account first. Confirm their sign-in email with them.');
  return account._id;
}
async function assignedFields(input, session, previous = null) {
  const result = { ...input };
  if ('clientEmail' in input) {
    // Blocking an assignee revokes their reads, but must not prevent Bravo from
    // updating or closing the trip. Only new assignments require an active user.
    const assigned = previous?.clientId && input.clientEmail ? await User.findById(previous.clientId).select('email').session(session || null).lean() : null;
    result.clientId = assigned?.email === input.clientEmail ? previous.clientId : await accountFor(input.clientEmail, session);
    delete result.clientEmail;
  }
  if (input.breederId && String(input.breederId) !== String(previous?.breederId) && !await TransportBreeder.exists({ _id: input.breederId, enabled: true }).session(session || null)) throw fail('Choose an enabled breeder.');
  for (const field of ['pickupAt', 'etaAt']) if (field in input) result[field] = input[field] ? new Date(input[field]) : null;
  return result;
}
async function audience(user) {
  if (owner(user)) return {};
  const breeders = await TransportBreeder.find({ accountId: user._id, enabled: true }).select('_id').lean();
  return { $or: [{ clientId: user._id }, { breederId: { $in: breeders.map(breeder => breeder._id) } }] };
}
async function present(trip, user, detail = false) {
  const breeder = trip.breederId ? await TransportBreeder.findById(trip.breederId).select('name').lean() : null;
  const data = {
    id: String(trip._id), dogName: trip.dogName, breederName: breeder?.name || '',
    pickup: trip.pickup, destination: trip.destination, pickupAt: trip.pickupAt, etaAt: trip.etaAt,
    status: trip.status, sharingEnabled: !!trip.sharingEnabled, revision: trip.revision,
  };
  if (detail) {
    const state = transportLocationState(trip);
    Object.assign(data, { locationState: state, location: ['live', 'stale'].includes(state) ? trip.location : null, events: trip.events || [] });
    if (owner(user)) {
      const client = trip.clientId ? await User.findById(trip.clientId).select('name email').lean() : null;
      Object.assign(data, { breederId: trip.breederId ? String(trip.breederId) : null, clientName: client?.name || '', clientEmail: client?.email || '', deviceId: trip.deviceId || '' });
    }
  }
  return data;
}
async function audit(req, action, target, session) {
  await AuditEvent.create([{ actorId: req.user._id, action, targetType: 'transport', targetId: String(target) }], { session });
}

// Provider adapters sign this bounded, normalized payload. No public device URL,
// client-supplied callback, browser position, or vendor credential is accepted.
export function verifyGpsSignature(body, timestamp, signature, secret, now = Date.now()) {
  if (!Buffer.isBuffer(body) || typeof secret !== 'string' || secret.length < 32 || !/^\d{10}$/.test(timestamp || '') || !/^[a-f\d]{64}$/i.test(signature || '')) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const expected = createHmac('sha256', secret).update(timestamp).update('.').update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function transportPortalRoutes(app) {
  const gps = express.Router();
  gps.post('/', express.raw({ type: 'application/json', limit: '2kb' }), async (req, res) => {
    const secret = process.env.TRANSPORT_GPS_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) return res.status(503).json({ error: 'Tracker connection is not configured.' });
    if (!verifyGpsSignature(req.body, req.get('X-Bravo-Timestamp'), req.get('X-Bravo-Signature'), secret)) return res.status(401).json({ error: 'Invalid tracker signature.' });
    let json; try { json = JSON.parse(req.body.toString('utf8')); } catch { throw fail('Invalid tracker payload.'); }
    const input = gpsInput.parse(json), observedAt = new Date(input.observedAt), now = new Date();
    if (observedAt > now || now - observedAt > 86400000) throw fail('Invalid tracker observation time.');
    await connectDb(); await TransportTrip.init();
    await new Promise((resolve, reject) => rateLimit('transport-gps', 120, 60000, () => input.deviceId)(req, res, resolve).catch(reject));
    await TransportTrip.updateMany({ deviceId: input.deviceId, sharingEnabled: true, status: { $in: TRACKABLE_STATUSES }, sharingSince: { $lte: observedAt },
      $or: [{ 'location.observedAt': { $lt: observedAt } }, { location: { $exists: false } }],
    }, { $set: { location: { latitude: input.latitude, longitude: input.longitude, accuracy: input.accuracy, observedAt, receivedAt: now } } });
    // Uniform response does not disclose device/trip assignments. Monotonic
    // observations make duplicate delivery and replay harmless.
    res.status(202).json({ ok: true });
  });
  gps.use((error, _req, res, _next) => { const result = clientError(error); res.status(result.status).json({ error: result.message }); });
  app.use('/api/transport/gps', gps);

  const router = express.Router();
  router.use(...sessionMiddleware(), requireUser);
  router.use(async (_req, _res, next) => { await Promise.all([TransportBreeder.init(), TransportTrip.init()]); next(); });
  const write = [requireOwner, sameOrigin, express.json({ limit: '8kb' }), rateLimit('transport-write', 100, 3600000)];
  router.get('/', async (req, res) => {
    const before = req.query.before === undefined ? null : id.parse(req.query.before);
    const scope = await audience(req.user);
    const trips = await TransportTrip.find({ ...scope, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(51).lean();
    const breeders = await TransportBreeder.find(owner(req.user) ? {} : { accountId: req.user._id, enabled: true }).select('name enabled revision').sort({ name: 1 }).limit(200).lean();
    res.json({ trips: await Promise.all(trips.slice(0, 50).map(trip => present(trip, req.user))), breeders,
      next: trips.length > 50 ? String(trips[49]._id) : null, canManage: owner(req.user),
      ...(owner(req.user) ? { gpsConfigured: (process.env.TRANSPORT_GPS_WEBHOOK_SECRET?.length || 0) >= 32 } : {}),
    });
  });
  router.post('/breeders', ...write, async (req, res) => {
    const input = breederInput.parse(req.body);
    let breeder;
    await transaction(async session => {
      breeder = (await TransportBreeder.create([{ name: input.name, accountId: await accountFor(input.accountEmail, session), createdBy: req.user._id }], { session }))[0];
      await audit(req, 'transport.breeder.create', breeder._id, session);
    });
    res.status(201).json({ id: String(breeder._id) });
  });
  router.patch('/breeders/:id', ...write, async (req, res) => {
    const input = z.object({ revision: z.number().int().min(0), enabled: z.boolean(), name: z.string().trim().min(2).max(100).optional(), accountEmail: email.refine(Boolean).optional() }).strict().parse(req.body);
    await transaction(async session => {
      const { revision, accountEmail, ...changes } = input;
      if (accountEmail !== undefined) changes.accountId = await accountFor(accountEmail, session);
      const result = await TransportBreeder.updateOne({ _id: id.parse(req.params.id), revision }, { $set: changes, $inc: { revision: 1 } }, { session });
      if (!result.matchedCount) throw fail('This breeder changed. Refresh and try again.', 409);
      await audit(req, 'transport.breeder.update', req.params.id, session);
    });
    res.json({ ok: true });
  });
  router.post('/trips', ...write, async (req, res) => {
    const input = createInput.parse(req.body); let trip;
    await transaction(async session => {
      const assigned = await assignedFields(input, session);
      if (!assigned.clientId && !assigned.breederId) throw fail('Assign a client or breeder to this trip.');
      trip = (await TransportTrip.create([{ ...assigned, createdBy: req.user._id, events: [{ status: 'scheduled', note: 'Transport scheduled by Bravo.', at: new Date() }] }], { session }))[0];
      await audit(req, 'transport.trip.create', trip._id, session);
    });
    res.status(201).json({ id: String(trip._id) });
  });
  router.get('/trips/:id', async (req, res) => {
    if (!id.safeParse(req.params.id).success) throw fail('Trip not found.', 404);
    const trip = await TransportTrip.findOne({ _id: req.params.id, ...await audience(req.user) }).select(owner(req.user) ? '+deviceId' : '').lean();
    if (!trip) throw fail('Trip not found.', 404);
    res.json({ trip: await present(trip, req.user, true), serverTime: new Date().toISOString() });
  });
  router.patch('/trips/:id', ...write, async (req, res) => {
    const input = editInput.parse(req.body);
    await transaction(async session => {
      const trip = await TransportTrip.findOne({ _id: id.parse(req.params.id), revision: input.revision }).select('+deviceId').session(session);
      if (!trip) throw fail('This trip changed. Refresh it before saving again.', 409);
      const previousStatus = trip.status, previousDevice = trip.deviceId, previousSharing = trip.sharingEnabled;
      const { revision, note, ...changes } = input;
      if (FINAL_TRANSPORT_STATUSES.includes(previousStatus) && changes.status && changes.status !== previousStatus) throw fail('Completed trips stay closed. Create a new trip for another journey.');
      Object.assign(trip, await assignedFields(changes, session, trip));
      if (!TRACKABLE_STATUSES.includes(trip.status)) trip.sharingEnabled = false;
      if (trip.sharingEnabled && !trip.deviceId) throw fail('Assign the vehicle tracker before sharing location.');
      if (trip.sharingEnabled && (process.env.TRANSPORT_GPS_WEBHOOK_SECRET?.length || 0) < 32) throw fail('Connect the vehicle tracker before sharing location.');
      if (!trip.sharingEnabled || previousDevice !== trip.deviceId || !previousSharing) {
        trip.location = undefined; trip.sharingSince = trip.sharingEnabled ? new Date() : undefined;
      }
      if (note || trip.status !== previousStatus) trip.events = [...trip.events, { status: trip.status, note: note || '', at: new Date() }].slice(-100);
      trip.revision = revision + 1;
      await trip.save({ session }); await audit(req, 'transport.trip.update', trip._id, session);
    });
    res.json({ ok: true });
  });
  router.use((error, _req, res, _next) => { const result = clientError(error); res.status(result.status).json({ error: result.message }); });
  app.use('/api/transport', router);
}
