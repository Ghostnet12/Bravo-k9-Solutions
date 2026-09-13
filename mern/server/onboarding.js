import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { User, Subscription, Booking, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { hashPassword, publicUser } from './auth.js';
import { effectiveServices } from './services.js';
import { quote } from '../shared/catalog.js';
import { manualMonthTerm, termActive } from '../shared/membership-terms.js';

const inputSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  name: z.string().trim().min(2).max(80), dogName: z.string().trim().max(80).default(''),
  phone: z.string().trim().max(30).default(''), address: z.string().trim().max(300).default(''),
  membershipStartDate: z.preprocess(value => value === '' ? undefined : value, z.string().optional()),
  trainingDogCount: z.coerce.number().int().min(1).max(10).default(1),
});
// Mounted only behind authenticated Owner/Administrator permissions.
export async function createAssistedClient(req, res) {
  const { membershipStartDate, trainingDogCount, ...input } = inputSchema.parse(req.body);
  const term = membershipStartDate ? manualMonthTerm(membershipStartDate) : null;
  const catalog = term ? await effectiveServices() : null;
  const temporaryPassword = `Bravo-${randomUUID().replaceAll('-', '').slice(0, 18)}!`;
  const account = { ...input, role: 'member', passwordHash: await hashPassword(temporaryPassword) };
  let user;
  async function persist(session) {
    user = session ? (await User.create([account], { session }))[0] : await User.create(account);
    if (term) {
      // Existing-client access is a manual grant, not evidence of a new payment.
      // A covered, empty request lets the team add dates in the shared calendar.
      const [booking] = await Booking.create([{ userId: user._id, createdBy: req.user._id, requestKey: randomUUID(), serviceIds: ['training'], trainingFocus: 'basic-obedience', dogCount: trainingDogCount, dogName: input.dogName || 'Training membership', phone: input.phone, address: input.address, visits: [], status: 'requested', paymentStatus: 'covered', termStartsAt: term.validFrom, termEndsAt: term.validUntil, quote: quote(['training'], [], { dogCount: trainingDogCount }, catalog) }], { session });
      await Subscription.create([{ userId: user._id, stripeId: `grant:training:${user._id}:${randomUUID()}`, bookingId: booking._id, source: 'grant', autoPayDisabled: true, status: 'active', serviceIds: ['training'], dogCount: trainingDogCount, ...term }], { session });
    }
    const audit = { actorId: req.user._id, action: 'client.created', targetType: 'user', targetId: String(user._id), details: { assistedOnboarding: true, ...(term ? { manualTrainingMonth: true, ...term, dogCount: trainingDogCount } : {}) } };
    if (session) await AuditEvent.create([audit], { session }); else await AuditEvent.create(audit);
  }
  // Account, dates, covered request, and audit succeed together or not at all.
  if (term) await transaction(persist); else await persist();
  res.status(201).json({ user: publicUser(user), temporaryPassword, membership: term ? { ...term, active: termActive({ ...term, status: 'active' }), service: 'training', dogCount: trainingDogCount } : null });
}
