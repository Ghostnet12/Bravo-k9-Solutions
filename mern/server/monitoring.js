import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { CHANNELS, CLIENT_ERRORS, AREAS, routeArea } from '../shared/telemetry.js';
import { FunnelVisit, SiteError, Booking } from './models.js';

const retention = 30 * 86400000;
const tokenInput = z.string().uuid();
const staff = user => ['staff', 'owner'].includes(user?.role);
const optedOut = req => req.get('DNT') === '1' || req.get('Sec-GPC') === '1';
const hash = value => createHash('sha256').update(value).digest('hex');
export const monitoringEnabled = () => !['preview', 'development'].includes(process.env.VERCEL_ENV);
export async function pingDatabase() {
  await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 5000 });
}
export async function recordError({ source, area, kind, status = 0, requestId = null }) {
  const now = new Date(), day = now.toISOString().slice(0, 10);
  const safe = { source: source === 'server' ? 'server' : 'browser', area: AREAS.includes(area) ? area : 'other', kind: CLIENT_ERRORS.includes(kind) ? kind : 'server_error', status: Number.isInteger(status) && status >= 500 && status <= 599 ? status : 0 };
  console.error(JSON.stringify({ level: 'error', event: 'bravo.site_error', ...safe, ...(requestId ? { requestId } : {}) }));
  if (!monitoringEnabled() || mongoose.connection.readyState !== 1) return;
  try {
    const key = [day, safe.source, safe.area, safe.kind, safe.status].join(':');
    await SiteError.updateOne({ _id: key }, { $inc: { count: 1 }, $set: { lastSeen: now, ...(requestId ? { requestId } : {}) }, $setOnInsert: { ...safe, firstSeen: now, expiresAt: new Date(now.getTime() + retention) } }, { upsert: true, maxTimeMS: 1000 });
  } catch { console.error(JSON.stringify({ level: 'error', event: 'bravo.monitoring_storage_unavailable' })); }
}
export function monitorRequests(req, res, next) {
  const start = Date.now(), requestId = randomUUID();
  res.setHeader('X-Bravo-Request-Id', requestId);
  res.once('finish', () => {
    if (res.statusCode < 500) return;
    const area = routeArea(req.originalUrl);
    console.error(JSON.stringify({ level: 'error', event: 'bravo.request_failed', area, status: res.statusCode, requestId, durationMs: Date.now() - start }));
    const work = recordError({ source: 'server', area, kind: 'server_error', status: res.statusCode, requestId });
    if (process.env.VERCEL) waitUntil(work);
  });
  next();
}
const visitInput = z.object({ token: tokenInput, channel: z.enum(CHANNELS), stage: z.enum(['visit', 'booking_started']) }).strict();
const errorInput = z.object({ kind: z.enum(CLIENT_ERRORS), area: z.enum(AREAS) }).strict();
export async function ingestVisit(req, res) {
  const input = visitInput.parse(req.body);
  if (!monitoringEnabled() || optedOut(req) || staff(req.user)) return res.status(204).end();
  const now = new Date();
  await FunnelVisit.updateOne({ _id: hash(input.token) }, {
    $setOnInsert: { channel: input.channel, firstSeen: now, expiresAt: new Date(now.getTime() + retention) },
    ...(input.stage === 'booking_started' ? { $set: { started: true } } : {}),
  }, { upsert: true, maxTimeMS: 1000 });
  res.status(204).end();
}
export async function ingestError(req, res) {
  const input = errorInput.parse(req.body);
  if (!monitoringEnabled()) return res.status(204).end();
  await recordError({ ...input, source: 'browser' });
  res.status(204).end();
}
// This runs only AFTER the server saved a real request. Client telemetry cannot
// claim a conversion. Retries keep the original attribution and never add counts.
export async function attributeBooking(req, booking) {
  if (!monitoringEnabled() || staff(req.user) || optedOut(req)) return;
  const parsed = tokenInput.safeParse(req.get('X-Bravo-Visit'));
  if (!parsed.success) return;
  try {
    const sessionId = hash(parsed.data);
    const visit = await FunnelVisit.findOne({ _id: sessionId, expiresAt: { $gt: new Date() } }).select('_id').maxTimeMS(1000).lean();
    if (!visit) return;
    await Booking.updateOne({ _id: booking._id, userId: req.user._id, analyticsSession: { $exists: false } }, { $set: { analyticsSession: sessionId } }, { maxTimeMS: 1000, timestamps: false });
    await FunnelVisit.updateOne({ _id: sessionId }, { $set: { started: true } }, { maxTimeMS: 1000 });
  } catch { console.error(JSON.stringify({ level: 'error', event: 'bravo.conversion_tracking_unavailable' })); }
}
export async function monitoringSummary(req, res) {
  if (!monitoringEnabled()) return res.status(409).json({ error: 'Open the live Bravo website to view the production report.' });
  const days = z.enum(['7', '30']).default('30').parse(req.query.days);
  const since = new Date(Date.now() - (Number(days) - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const [funnel, errors] = await Promise.all([
    FunnelVisit.aggregate([
      { $match: { firstSeen: { $gte: since }, expiresAt: { $gt: new Date() } } },
      { $lookup: { from: Booking.collection.name, localField: '_id', foreignField: 'analyticsSession', pipeline: [{ $project: { _id: 0, status: 1, paymentStatus: 1, paidAt: 1 } }], as: 'bookings' } },
      { $project: { channel: 1, started: { $cond: ['$started', 1, 0] }, saved: { $cond: [{ $gt: [{ $size: '$bookings' }, 0] }, 1, 0] }, paid: { $cond: [{ $gt: [{ $size: { $filter: { input: '$bookings', as: 'b', cond: { $and: [{ $ne: [{ $ifNull: ['$$b.paidAt', null] }, null] }, { $in: ['$$b.paymentStatus', ['paid', 'refunded']] }] } } } }, 0] }, 1, 0] } } },
      { $group: { _id: '$channel', visits: { $sum: 1 }, started: { $sum: '$started' }, saved: { $sum: '$saved' }, paid: { $sum: '$paid' } } },
    ]).option({ maxTimeMS: 5000 }),
    SiteError.find({ lastSeen: { $gte: since }, expiresAt: { $gt: new Date() } }).select('-_id -__v -expiresAt').sort({ lastSeen: -1 }).limit(200).maxTimeMS(5000).lean(),
  ]);
  const totals = funnel.reduce((a, row) => { for (const key of ['visits', 'started', 'saved', 'paid']) a[key] += row[key]; return a; }, { visits: 0, started: 0, saved: 0, paid: 0 });
  res.json({ days: Number(days), since, checkedAt: new Date(), databaseConnected: mongoose.connection.readyState === 1, totals, channels: funnel.map(({ _id, ...row }) => ({ channel: _id, ...row })), errors });
}
