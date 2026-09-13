import { z } from 'zod';
import { User, AuditEvent, MemberAccess, Subscription } from './models.js';
import { transaction } from './db.js';
import { publicUser } from './auth.js';
import { temporaryCredential } from './client-login.js';
import { saveManualTraining } from './manual-training.js';
import { manualMonthTerm, termActive, membershipToday } from '../shared/membership-terms.js';
import { prepareOptionalClientEmail } from './optional-client-email.js';

const inputSchema = z.object({
  email: z.preprocess(value => value == null || (typeof value === 'string' && !value.trim()) ? undefined : value, z.string().trim().email().max(254).transform(value => value.toLowerCase()).optional()),
  name: z.string().trim().min(2).max(80), dogName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).default(''), address: z.string().trim().max(300).default(''),
  membershipStartDate: z.preprocess(value => value === '' ? undefined : value, z.string().optional()),
  trainingDogCount: z.preprocess(value => value === '' ? undefined : value, z.coerce.number().int().min(1).max(10).default(1)),
});
// Mounted only behind authenticated Staff/Administrator/Owner permissions.
export async function createAssistedClient(req, res) {
  const { membershipStartDate, trainingDogCount, ...input } = inputSchema.parse(req.body);
  const term = manualMonthTerm(membershipStartDate || membershipToday());
  const { temporaryPassword, temporaryPasswordExpiresAt, passwordHash } = await temporaryCredential();
  const account = { ...input, role: 'member', passwordHash, mustChangePassword: true, temporaryPasswordExpiresAt };
  if (!input.email) await prepareOptionalClientEmail();
  await MemberAccess.init();
  let user, training;
  // Account, both membership grants, covered request and audit commit together.
  await transaction(async session => {
    const actor = await User.findById(req.user._id).select('role blocked').session(session);
    if (!actor || actor.blocked || !['staff', 'owner'].includes(actor.role)) throw Object.assign(new Error('Bravo staff access required.'), { status: 403 });
    [user] = await User.create([account], { session });
    training = await saveManualTraining({ user, actorId: req.user._id, term, dogCount: trainingDogCount, session });
    await MemberAccess.create([{ _id: user._id, enabled: true, revision: 1, updatedBy: req.user._id, startsAt: term.validFrom, endsAt: term.validUntil, trainingBookingId: training.bookingId, trainingSubscriptionId: training.subscriptionId, trainingDogCount }], { session });
    await Subscription.create([{ stripeId: `grant:${user._id}:1`, userId: user._id, serviceIds: ['online'], dogCount: 1, source: 'grant', autoPayDisabled: true, status: 'active', ...term }], { session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'client.created', targetType: 'user', targetId: String(user._id), details: { assistedOnboarding: true, manualTrainingMonth: true, onlineMembership: true, ...term, dogCount: trainingDogCount } }], { session });
  });
  const active = termActive({ ...term, status: 'active' });
  res.status(201).json({ user: publicUser(user), temporaryPassword, temporaryPasswordExpiresAt, membership: { ...term, active, enabled: true, manual: active, revision: 1, startsAt: term.validFrom, endsAt: term.validUntil, trainingBookingId: training.bookingId, trainingDogCount, service: 'training', dogCount: trainingDogCount } });
}
