import mongoose from 'mongoose';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { User, Subscription, AuditEvent } from './models.js';
import { grantActive, monthTerm, MEMBERSHIP_ZONE } from '../shared/membership-terms.js';
import { manualMembershipDates } from '../shared/manual-membership.js';

export const MemberAccess = mongoose.models.BravoMemberAccess || mongoose.model('BravoMemberAccess', new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  enabled: { type: Boolean, default: false }, revision: { type: Number, default: 0 },
  updatedBy: mongoose.Schema.Types.ObjectId, startsAt: Date, endsAt: Date,
  serviceIds: { type: [String], default: ['online'] }, dogCount: { type: Number, default: 1, min: 1, max: 10 },
}, { timestamps: true }));
export const manualGrantInput = z.object({
  startDate: z.string().optional(), serviceIds: z.array(z.enum(['training', 'online'])).min(1).max(2).optional(), dogCount: z.number().int().min(1).max(10).optional(),
}).strict();
export function manualGrantTerm(startDate) {
  if (startDate === undefined) return monthTerm(); // Preserve existing callers.
  let dates;
  try { dates = manualMembershipDates(startDate); } catch (error) { error.status = 400; throw error; }
  return { validFrom: DateTime.fromISO(dates.startDate, { zone: MEMBERSHIP_ZONE }).startOf('day').toJSDate(), validUntil: DateTime.fromISO(dates.endDate, { zone: MEMBERSHIP_ZONE }).startOf('day').toJSDate() };
}
export function manualOnlineAccess(grant) { return grantActive(grant) && (grant.serviceIds || ['online']).includes('online'); }
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function writeMemberGrant({ userId, actorId, enabled, expectedRevision = 0, startDate, serviceIds, dogCount }, session) {
  const term = enabled ? manualGrantTerm(startDate) : null;
  const actor = await User.findById(actorId).select('role blocked').session(session);
  if (!actor || actor.blocked || actor.role !== 'owner') throw fail('Administrator or owner access is required.', 403);
  const target = await User.findById(userId).select('role blocked').session(session);
  if (!target) throw fail('Account not found.', 404);
  if (enabled && target.blocked) throw fail('Restore this account before activating Member access.', 409);
  if (enabled && target.role !== 'member') throw fail('Choose a client account. Staff have separate work access.');
  const previous = await MemberAccess.findById(userId).session(session);
  if ((previous?.revision || 0) !== expectedRevision) throw fail('Member access changed. Refresh this profile before saving.', 409);
  const record = previous || new MemberAccess({ _id: userId });
  const before = { enabled: record.enabled, startsAt: record.startsAt, endsAt: record.endsAt, serviceIds: record.serviceIds };
  record.enabled = enabled; record.revision = expectedRevision + 1; record.updatedBy = actorId;
  if (enabled) { record.startsAt = term.validFrom; record.endsAt = term.validUntil; record.serviceIds = [...new Set(serviceIds || ['online'])]; record.dogCount = dogCount || 1; }
  await record.save({ session });
  // Only replace administrator grants. Stripe/payment records remain untouched.
  await Subscription.updateMany({ userId, source: 'grant', status: 'active' }, { $set: { status: 'revoked' } }, { session });
  if (enabled) await Subscription.create([{ stripeId: `grant:${userId}:${record.revision}`, userId, serviceIds: record.serviceIds, dogCount: record.dogCount, source: 'grant', autoPayDisabled: true, status: 'active', validFrom: record.startsAt, validUntil: record.endsAt }], { session });
  await AuditEvent.create([{ actorId, action: enabled ? 'membership.granted' : 'membership.revoked', targetType: 'user', targetId: String(userId), details: { before, enabled, revision: record.revision, startsAt: record.startsAt, endsAt: record.endsAt, serviceIds: record.serviceIds, dogCount: record.dogCount, paymentChanged: false } }], { session });
  return { manual: grantActive(record), enabled: record.enabled, revision: record.revision, startsAt: record.startsAt, endsAt: record.endsAt, serviceIds: record.serviceIds, dogCount: record.dogCount };
}
