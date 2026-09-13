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
import { monthTerm, grantActive, activeTermQuery } from '../shared/membership-terms.js';

// Member access is an entitlement, NOT an employee role or a Stripe subscription.
// No grant is created during registration. Paid plans, quotes and billing records
// remain independent; grants cover only the services explicitly selected by Bravo.
import { MemberAccess, writeMemberGrant, manualGrantInput, manualOnlineAccess } from './member-grants.js';
export { MemberAccess } from './member-grants.js';
const idInput = z.string().regex(/^[a-f\d]{24}$/i);
const changeInput = z.object({ enabled: z.boolean(), expectedRevision: z.number().int().min(0), ...manualGrantInput.shape }).strict();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function membershipSummary(entitlements, grant) {
  const manual = grantActive(grant);
  return { active: manual || entitlements.services.length > 0, manual, onlineAccess: manualOnlineAccess(grant) || entitlements.services.includes('online') };
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
    return [id, { manual: grantActive(grant), enabled: grant?.enabled === true, serviceIds: grant?.serviceIds || ['online'], dogCount: grant?.dogCount || 1, startsAt: grant?.startsAt, endsAt: grant?.endsAt, revision: grant?.revision || 0, paidMembership: subscriptions.length > 0, paidOnline: subscriptions.some(item => item.serviceIds.some(service => ['online', 'all-access'].includes(service))) }];
  })) });
});
app.patch('/api/admin/memberships/:id', ...session, requireUser, requireOwner, sameOrigin, rateLimit('member-access-write', 80, 3600000), express.json({ limit: '4kb' }), async (req, res) => {
  const userId = idInput.parse(req.params.id), input = changeInput.parse(req.body);
  await MemberAccess.init();
  let result;
  await transaction(async dbSession => {
    result = await writeMemberGrant({ userId, actorId: req.user._id, ...input }, dbSession);
  });
  res.json({ membership: result, message: input.enabled ? 'Membership dates saved. No charge was created; existing payments and staff permissions are unchanged.' : 'Manual Member access removed. Existing paid subscriptions are unchanged.' });
});
// Extend the existing protected player without exposing a public video endpoint.
// Manual access never grants staff privileges or access to draft lessons.
for (const type of ['video', 'captions', 'transcript']) app.get(`/api/lessons/:id/${type}`, ...session, requireUser, async (req, res) => {
  if (!/^[a-z0-9-]{1,80}$/.test(req.params.id)) return res.status(404).json({ error: 'Lesson not found.' });
  const grant = req.user.role === 'member' ? await MemberAccess.findById(req.user._id).lean() : null;
  return protectedLesson(req, res, type, { manualMember: manualOnlineAccess(grant) });
});
app.use(mediaApp);
app.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500;
  const message = error instanceof z.ZodError ? 'Check the account and Member access settings.' : status === 409 ? 'This account or its Member access changed. Refresh it and try again.' : status >= 500 ? 'Member access could not be confirmed. Refresh the profile before trying again.' : error.message;
  if (status >= 500) console.error('Bravo member access operation failed', { status });
  res.status(status).json({ error: message });
});
export default app;
