import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { z } from 'zod';
import mediaApp from './site-image-app.js';
import { connectDb, transaction } from './db.js';
import { User, Subscription, AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, publicUser, rateLimit } from './auth.js';
import { getEntitlements } from './bookings.js';
import { protectedLesson } from './lessons.js';
import { monthTerm, manualMonthTerm, grantActive, activeTermQuery } from '../shared/membership-terms.js';
import { saveManualTraining } from './manual-training.js';

// Member access is an entitlement, NOT an employee role or a Stripe subscription.
// No grant is created during registration. Paid plans, quotes and billing records
// remain independent. Current-client setup also links a manual training grant.
export const MemberAccess = mongoose.models.BravoMemberAccess || mongoose.model('BravoMemberAccess', new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  enabled: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
  updatedBy: mongoose.Schema.Types.ObjectId,
  startsAt: Date, endsAt: Date,
  trainingBookingId: mongoose.Schema.Types.ObjectId, trainingSubscriptionId: String, trainingDogCount: Number,
}, { timestamps: true }));
const idInput = z.string().regex(/^[a-f\d]{24}$/i);
const changeInput = z.object({ enabled: z.boolean(), expectedRevision: z.number().int().min(0), startDate: z.string().optional(), trainingDogCount: z.number().int().min(1).max(10).optional() }).strict();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function membershipSummary(entitlements, grant) {
  const manual = grantActive(grant);
  return { active: manual || entitlements.services.length > 0, manual, onlineAccess: manual || entitlements.services.includes('online') };
}
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', process.env.VERCEL ? 1 : false);
const session = [helmet(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, cookieParser(), async (_req, _res, next) => { await connectDb(); next(); }, identify, rateLimit('api', 240, 60000)];
app.get('/api/auth/me', ...session, async (req, res) => {
  if (!req.user) return res.json({ user: null, services: [], subscriptions: [], serviceDogCounts: {}, membership: { active: false, manual: false, onlineAccess: false } });
  const [entitlements, grant] = await Promise.all([getEntitlements(req.user._id), MemberAccess.findById(req.user._id).lean()]);
  res.json({ user: publicUser(req.user), ...entitlements, membership: membershipSummary(entitlements, grant) });
});
// A bounded batch lookup keeps the existing People & permissions search fast.
app.get('/api/admin/memberships', ...session, requireUser, requireOwner, async (req, res) => {
  const { ids } = z.object({ ids: z.string().min(24).max(2499) }).parse(req.query);
  const userIds = z.array(idInput).min(1).max(100).parse(ids.split(','));
  const [grants, paid] = await Promise.all([
    MemberAccess.find({ _id: { $in: userIds } }).lean(),
    Subscription.find({ userId: { $in: userIds }, ...activeTermQuery() }).select('userId serviceIds').lean(),
  ]);
  const byId = new Map(grants.map(grant => [String(grant._id), grant]));
  res.json({ memberships: Object.fromEntries(userIds.map(id => {
    const grant = byId.get(id), subscriptions = paid.filter(item => String(item.userId) === id);
    return [id, { enabled: grant?.enabled === true, manual: grantActive(grant), startsAt: grant?.startsAt, endsAt: grant?.endsAt, trainingBookingId: grant?.trainingBookingId, trainingDogCount: grant?.trainingDogCount, revision: grant?.revision || 0, paidMembership: subscriptions.length > 0, paidOnline: subscriptions.some(item => item.serviceIds.some(service => ['online', 'all-access'].includes(service))) }];
  })) });
});
app.patch('/api/admin/memberships/:id', ...session, requireUser, requireOwner, sameOrigin, rateLimit('member-access-write', 80, 3600000), express.json({ limit: '4kb' }), async (req, res) => {
  const userId = idInput.parse(req.params.id), input = changeInput.parse(req.body);
  const chosenTerm = input.enabled ? (input.startDate ? manualMonthTerm(input.startDate) : monthTerm()) : null;
  await MemberAccess.init();
  let result;
  await transaction(async dbSession => {
    const actor = await User.findById(req.user._id).select('role blocked').session(dbSession);
    if (!actor || actor.blocked || actor.role !== 'owner') throw fail('Administrator or owner access is required.', 403);
    const target = await User.findById(userId).select('role blocked dogName phone address').session(dbSession);
    if (!target) throw fail('Account not found.', 404);
    if (input.enabled && target.blocked) throw fail('Restore this account before activating Member access.', 409);
    if (input.enabled && target.role !== 'member') throw fail('Choose a client account. Staff and administrators already have separate work access.');
    const grant = await MemberAccess.findById(userId).session(dbSession);
    if ((grant?.revision || 0) !== input.expectedRevision) throw fail('Member access changed. Refresh this profile before saving.', 409);
    const record = grant || new MemberAccess({ _id: userId });
    const previous = record.enabled === true;
    record.enabled = input.enabled; record.revision = input.expectedRevision + 1; record.updatedBy = req.user._id;
    if (input.enabled) { record.startsAt = chosenTerm.validFrom; record.endsAt = chosenTerm.validUntil; }
    // Older online-only requests keep their scope. The current-client UI always
    // sends dogs covered, explicitly opting into the connected training setup.
    if (input.enabled && input.trainingDogCount !== undefined) {
      const training = await saveManualTraining({ user: target, actorId: req.user._id, term: chosenTerm, dogCount: input.trainingDogCount, session: dbSession, subscriptionId: record.trainingSubscriptionId });
      record.trainingBookingId = training.bookingId; record.trainingSubscriptionId = training.subscriptionId; record.trainingDogCount = training.dogCount;
    }
    // Date corrections replace only manual ONLINE grants, never training or Stripe access.
    await Subscription.updateMany({ userId, source: 'grant', serviceIds: 'online', status: 'active' }, { $set: { status: 'revoked' } }, { session: dbSession });
    await record.save({ session: dbSession });
    if (input.enabled) await Subscription.create([{ stripeId: `grant:${userId}:${record.revision}`, userId, serviceIds: ['online'], dogCount: 1, source: 'grant', autoPayDisabled: true, status: 'active', validFrom: record.startsAt, validUntil: record.endsAt }], { session: dbSession });
    await AuditEvent.create([{ actorId: req.user._id, action: input.enabled ? 'membership.granted' : 'membership.revoked', targetType: 'user', targetId: userId, details: { from: previous, to: input.enabled, revision: record.revision, scope: input.enabled && input.trainingDogCount !== undefined ? 'training-and-published-member-lessons' : 'published-member-lessons', startsAt: record.startsAt, endsAt: record.endsAt, trainingBookingId: record.trainingBookingId, trainingDogCount: record.trainingDogCount } }], { session: dbSession });
    result = { enabled: record.enabled, manual: grantActive(record), revision: record.revision, startsAt: record.startsAt, endsAt: record.endsAt, trainingBookingId: record.trainingBookingId, trainingDogCount: record.trainingDogCount };
  });
  res.json({ membership: result, message: input.enabled ? (input.trainingDogCount !== undefined ? 'Membership and covered training saved. Choose a trainer and add days and times below. No charge or automatic renewal was created.' : 'Member access dates saved. No payment, automatic billing, or staff permissions were created.') : 'Manual online access removed. Training and paid subscriptions are unchanged.' });
});
// Extend the existing protected player without exposing a public video endpoint.
// Manual access never grants staff privileges or access to draft lessons.
for (const type of ['video', 'captions', 'transcript']) app.get(`/api/lessons/:id/${type}`, ...session, requireUser, async (req, res) => {
  if (!/^[a-z0-9-]{1,80}$/.test(req.params.id)) return res.status(404).json({ error: 'Lesson not found.' });
  const grant = req.user.role === 'member' ? await MemberAccess.findById(req.user._id).lean() : null;
  return protectedLesson(req, res, type, { manualMember: grantActive(grant) });
});
app.use(mediaApp);
app.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500;
  const message = error instanceof z.ZodError ? 'Check the account and Member access settings.' : error.code === 11000 ? 'This account or its Member access changed. Refresh it and try again.' : status >= 500 ? 'Member access could not be confirmed. Refresh the profile before trying again.' : error.message;
  if (status >= 500) console.error('Bravo member access operation failed', { status });
  res.status(status).json({ error: message });
});
export default app;
