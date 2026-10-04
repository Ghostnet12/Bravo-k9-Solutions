import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LiveSession, User, Booking, AuditEvent, Notification } from './models.js';
import { transaction, connectDb } from './db.js';
import { lockStaffAuthorization } from './staff-authorization.js';
import { requireUser, requireStaff, rateLimit } from './auth.js';
import { assignedTrainerIds } from '../shared/trainers.js';
import { liveConfigured, liveToken, liveRoomService, cameraIsPublishing, deleteLiveRoom, receiveLiveEvent } from './live-media.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = z.string().uuid();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const cutoff = () => new Date(Date.now() - 75000);
const manages = (user, session) => user?.role === 'owner' || String(user?._id) === String(session.trainerId);
const visibility = user => ({ $or: [{ audience: 'public' }, ...(user ? [{ clientId: user._id }, { trainerId: user._id }, ...(user.role === 'owner' ? [{ audience: 'client' }] : [])] : [])] });
export const liveSummary = session => ({ id: session._id, trainerName: session.trainerName, dogName: session.dogName,
  audience: session.audience, status: session.status, startedAt: session.startedAt || null, lastSeenAt: session.lastSeenAt });

async function activeTrainer(session) {
  return User.exists({ _id: session.trainerId, role: { $in: ['staff', 'owner'] }, blocked: false, removedAt: null,
    credentialVersion: session.credentialVersion || { $in: [0, null] } });
}
async function closeSession(session) {
  // Hide first; on transport failure keep the lock and allow Stop to retry.
  await LiveSession.updateOne({ _id: session._id, open: true }, { $set: { status: 'ending' } });
  await deleteLiveRoom(session);
  await LiveSession.updateOne({ _id: session._id, open: true }, { $set: { open: false, status: 'ended', endedAt: new Date() } });
}
async function accessible(req, { publishing = false, allowEnded = false } = {}) {
  const session = await LiveSession.findOne({ _id: id.parse(req.params.id), ...(publishing ? {} : visibility(req.user)) });
  if (!session || (publishing && !manages(req.user, session))) throw fail('Live session not found.', 404);
  if (!allowEnded && (!session.open || session.status === 'ending' || session.lastSeenAt < cutoff())) throw fail('This live session has ended.', 410);
  return session;
}
const ready = (_req, res, next) => liveConfigured() ? next() : res.status(503).json({ error: 'Bravo Live is awaiting its media-server connection.', code: 'LIVE_NOT_CONFIGURED' });

export async function liveWebhook(req, res) {
  let event;
  try { event = await receiveLiveEvent(req.body.toString('utf8'), req.get('Authorization')); }
  catch { return res.status(401).json({ error: 'Invalid media event.' }); }
  await connectDb();
  const session = event.room?.name && await LiveSession.findOne({ roomName: event.room.name, open: true });
  if (session && (event.event === 'room_finished' || (event.event === 'participant_left' && event.participant?.identity === session.publisherIdentity))) {
    // A delayed participant-left event must not end a publisher that reconnected.
    if (event.event === 'room_finished' || !await cameraIsPublishing(session)) await closeSession(session);
  }
  res.json({ ok: true });
}

export function liveRoutes(app) {
  app.get('/api/live', async (req, res) => {
    if (!liveConfigured()) return res.json({ sessions: [], serverTime: new Date() });
    const sessions = await LiveSession.find({ open: true, status: 'live', lastSeenAt: { $gt: cutoff() }, ...visibility(req.user) }).sort({ startedAt: -1 }).limit(20).lean();
    const allowed = await Promise.all(sessions.map(async session => await activeTrainer(session) ? liveSummary(session) : null));
    res.json({ sessions: allowed.filter(Boolean), serverTime: new Date() });
  });
  app.get('/api/live/studio', requireUser, requireStaff, async (req, res) => {
    const bookings = await Booking.find({ status: { $in: ['requested', 'confirmed'] },
      ...(req.user.role === 'owner' ? {} : { $or: [{ staffId: req.user._id }, { staffIds: req.user._id }] }),
    }).select('dogName userId visits staffId staffIds').populate({ path: 'userId', model: User, select: 'name blocked removedAt' }).sort({ updatedAt: -1 }).limit(150).lean();
    const sessions = await LiveSession.find({ open: true, ...(req.user.role === 'owner' ? {} : { trainerId: req.user._id }) }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({ configured: liveConfigured(), serverTime: new Date(),
      bookings: bookings.filter(b => b.userId && !b.userId.blocked && !b.userId.removedAt).map(b => ({ id: String(b._id), dogName: b.dogName,
        clientName: b.userId.name, visits: b.visits })), sessions: sessions.map(s => ({ ...liveSummary(s), mine: String(s.trainerId) === String(req.user._id) })) });
  });
  app.post('/api/live', requireUser, requireStaff, ready, rateLimit('live-create', 12, 3600000), async (req, res) => {
    const data = z.object({ audience: z.enum(['public', 'client']), dogName: z.string().trim().min(1).max(80),
      bookingId: objectId.optional(), publicConsent: z.boolean().default(false) }).strict().parse(req.body);
    if (data.audience === 'public' && !data.publicConsent) throw fail('Confirm permission to show this session publicly.');
    if (data.audience === 'client' && !data.bookingId) throw fail('Choose the client’s saved training request for a private session.');
    const previous = await LiveSession.findOne({ trainerId: req.user._id, open: true });
    if (previous) {
      if (previous.lastSeenAt >= cutoff() && previous.status !== 'ending') throw fail('You already have a session. End it before starting another.', 409);
      await closeSession(previous);
    }
    let session;
    await transaction(async dbSession => {
      await lockStaffAuthorization(req.user, dbSession);
      let booking;
      if (data.bookingId) {
        booking = await Booking.findOne({ _id: data.bookingId, status: { $in: ['requested', 'confirmed'] } }).session(dbSession);
        if (!booking || (req.user.role !== 'owner' && !assignedTrainerIds(booking).includes(String(req.user._id)))) throw fail('Choose one of your assigned training requests.', 404);
        if (!await User.exists({ _id: booking.userId, blocked: false, removedAt: null }).session(dbSession)) throw fail('This client account is not available.', 404);
      }
      const sessionId = randomUUID();
      [session] = await LiveSession.create([{ _id: sessionId, trainerId: req.user._id,
        trainerName: req.user.publicName || req.user.name, credentialVersion: req.user.credentialVersion || 0,
        dogName: booking?.dogName || data.dogName, bookingId: booking?._id, clientId: booking?.userId,
        audience: data.audience, publicConsentAt: data.publicConsent ? new Date() : undefined,
        roomName: `bravo-${sessionId}`, publisherIdentity: `trainer-${randomUUID()}`, open: true, status: 'starting', lastSeenAt: new Date(),
      }], { session: dbSession });
      await AuditEvent.create([{ actorId: req.user._id, action: 'live.created', targetType: 'live', targetId: sessionId, details: { audience: data.audience } }], { session: dbSession });
    });
    try {
      await liveRoomService().createRoom({ name: session.roomName, emptyTimeout: 90, departureTimeout: 20, maxParticipants: 100 });
      res.status(201).json({ session: liveSummary(session), ...await liveToken(session, true) });
    } catch {
      await closeSession(session).catch(() => {});
      res.status(503).json({ error: 'The camera server could not connect. Refresh the studio and try again.' });
    }
  });
  app.post('/api/live/:id/heartbeat', requireUser, requireStaff, ready, rateLimit('live-heartbeat', 12, 60000), async (req, res) => {
    const session = await accessible(req, { publishing: true });
    if (String(session.trainerId) !== String(req.user._id)) throw fail('Only the broadcasting trainer can keep this session live.', 403);
    if (!await activeTrainer(session)) { await closeSession(session); throw fail('Your account changed. Start a new session after signing in.', 403); }
    if (!await cameraIsPublishing(session)) {
      await LiveSession.updateOne({ _id: session._id, open: true, status: { $in: ['starting', 'live'] } }, { $set: { status: 'starting' } });
      throw fail('Camera interrupted. Reconnect or end this session.', 409);
    }
    const updated = await LiveSession.findOneAndUpdate({ _id: session._id, open: true, status: { $in: ['starting', 'live'] } },
      { $set: { status: 'live', lastSeenAt: new Date(), startedAt: session.startedAt || new Date() } }, { returnDocument: 'after' });
    if (!updated) throw fail('This session has ended.', 410);
    if (!session.startedAt && session.audience === 'client') await Notification.updateOne({ _id: `live:${session._id}` }, { $setOnInsert: {
      userId: session.clientId, staff: false, body: `${session.trainerName} is live with ${session.dogName}.`, href: `/live?session=${session._id}`, createdAt: new Date(),
    } }, { upsert: true });
    res.json({ session: liveSummary(updated), serverTime: new Date() });
  });
  app.post('/api/live/:id/watch', ready, rateLimit('live-watch', 20, 60000), async (req, res) => {
    const session = await accessible(req);
    if (session.status !== 'live' || !await activeTrainer(session) || !await cameraIsPublishing(session)) throw fail('This session is not broadcasting right now.', 410);
    res.json({ session: liveSummary(session), ...await liveToken(session) });
  });
  app.post('/api/live/:id/end', requireUser, requireStaff, ready, rateLimit('live-end', 20, 60000), async (req, res) => {
    const session = await accessible(req, { publishing: true, allowEnded: true });
    if (session.open) await closeSession(session);
    res.json({ ok: true });
  });
}
