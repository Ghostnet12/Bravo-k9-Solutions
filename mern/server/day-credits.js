import { z } from 'zod';
import { DateTime } from 'luxon';
import { User, Subscription, Booking, MemberAccess, MembershipCredit, AuditEvent, Notification, Settings } from './models.js';
import { transaction } from './db.js';
import { releaseVisit } from './reservations.js';
import { creditableTerm, creditedEnd, CREDIT_REASONS, trainingServiceIds } from '../shared/day-credits.js';
import { MEMBERSHIP_ZONE } from '../shared/membership-terms.js';

const inputSchema = z.object({
  clientId: z.string().regex(/^[a-f\d]{24}$/i), termId: z.string().min(1).max(150),
  expectedEnd: z.string().datetime(), requestKey: z.string().uuid(), days: z.number().int().min(1).max(31),
  reason: z.enum(CREDIT_REASONS).default('Other'), note: z.string().trim().max(1200).default(''),
  missedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

export async function creditMembershipDays(req, res) {
  const input = inputSchema.parse(req.body);
  if (input.missedDate && input.days !== 1) throw fail('A missed training date receives one day of credit.', 400);
  let credit;
  await transaction(async session => {
    // Serialize against calendar changes, membership edits and client removal.
    await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
    const actor = await User.findById(req.user._id).session(session);
    if (!actor || actor.blocked || !['staff', 'owner'].includes(actor.role)) throw fail('Bravo staff access required.', 403);
    const client = await User.findById(input.clientId).session(session);
    if (!client || client.blocked || client.removedAt || client.role !== 'member') throw fail('Choose an active client profile.');
    const creditId = `${client._id}:${input.requestKey}`;
    credit = await MembershipCredit.findById(creditId).session(session);
    if (credit) {
      if (credit.termId !== input.termId || credit.days !== input.days || credit.reason !== input.reason || credit.note !== input.note || credit.missedDate !== input.missedDate) throw fail('This credit was already saved with different details. Reload before adding another.');
      return;
    }
    const term = await Subscription.findOne({ userId: client._id, stripeId: input.termId }).session(session);
    if (!term || !creditableTerm(term)) throw fail('Choose a dated training membership with manual renewal. Automatic plans must be switched to manual renewal by an administrator first.');
    if (term.validUntil.toISOString() !== input.expectedEnd) throw fail('Membership dates changed. Reload this client before crediting days.');
    const beforeEnd = term.validUntil, afterEnd = creditedEnd(beforeEnd, input.days);
    if (await Subscription.exists({ userId: client._id, stripeId: { $ne: term.stripeId }, serviceIds: { $in: trainingServiceIds }, status: { $in: ['active', 'trialing', 'canceled'] }, $or: [{ renewalOf: term.stripeId }, { validFrom: { $gte: beforeEnd, $lt: afterEnd }, validUntil: { $gt: beforeEnd } }] }).session(session)) throw fail('This month has a later membership. Credit the latest training month so the extra days are not lost in an overlap.');
    const bookings = await Booking.find({ userId: client._id, serviceIds: { $in: trainingServiceIds }, status: { $in: ['requested', 'confirmed'] }, paymentStatus: { $in: ['paid', 'covered'] }, $or: [
      ...(term.bookingId ? [{ _id: term.bookingId }] : []),
      { termStartsAt: term.validFrom, termEndsAt: beforeEnd },
      { termEndsAt: { $exists: false } },
    ] }).session(session);
    if (term.bookingId && !bookings.some(booking => String(booking._id) === String(term.bookingId))) throw fail('The linked training request is inactive or refunded. Review it before adding credit.');
    const cancelled = [];
    if (input.missedDate) {
      const date = DateTime.fromISO(input.missedDate, { zone: MEMBERSHIP_ZONE });
      if (!date.isValid || date.toISODate() !== input.missedDate || date.endOf('day').toJSDate() < term.validFrom || date.toJSDate() >= beforeEnd) throw fail('Choose a missed date within this membership.', 400);
      if (await MembershipCredit.exists({ userId: client._id, missedDate: input.missedDate }).session(session)) throw fail('This missed date has already been credited.');
      for (const booking of bookings) {
        const visits = booking.visits.filter(visit => visit.service === 'training' && visit.date === input.missedDate);
        const alreadyCancelled = booking.cancelledVisits.filter(visit => visit.service === 'training' && visit.date === input.missedDate);
        for (const visit of visits) {
          await releaseVisit(booking._id, visit, session);
          booking.cancelledVisits.push(visit);
        }
        booking.visits = booking.visits.filter(visit => !(visit.service === 'training' && visit.date === input.missedDate));
        cancelled.push(...[...visits, ...alreadyCancelled].map(visit => ({ bookingId: booking._id, date: visit.date, time: visit.time })));
      }
      if (!cancelled.length) throw fail('No saved training visits match that missed date. Reload the schedule.');
    }
    for (const booking of bookings) {
      if (booking.termEndsAt?.getTime() === beforeEnd.getTime() || String(booking._id) === String(term.bookingId)) booking.termEndsAt = afterEnd;
      if (booking.isModified()) await booking.save({ session });
    }
    term.validUntil = afterEnd; term.creditedUntil = afterEnd; term.creditedDays = (term.creditedDays || 0) + input.days;
    await term.save({ session });
    const reminderTerms = [term.stripeId];
    const grant = await MemberAccess.findOne({ _id: client._id, enabled: true, trainingSubscriptionId: term.stripeId, endsAt: beforeEnd }).session(session);
    if (grant) {
      grant.endsAt = afterEnd; grant.revision += 1; grant.updatedBy = actor._id;
      await grant.save({ session });
      const onlineFilter = { userId: client._id, source: 'grant', serviceIds: ['online'], status: 'active', validFrom: grant.startsAt, validUntil: beforeEnd };
      const onlineTerms = await Subscription.find(onlineFilter).select('stripeId').session(session).lean();
      reminderTerms.push(...onlineTerms.map(item => item.stripeId));
      await Subscription.updateMany(onlineFilter, { $set: { validUntil: afterEnd } }, { session });
    }
    [credit] = await MembershipCredit.create([{ _id: creditId, userId: client._id, termId: term.stripeId, actorId: actor._id, days: input.days, reason: input.reason, note: input.note, missedDate: input.missedDate, beforeEnd, afterEnd, cancelled }], { session });
    await AuditEvent.create([{ actorId: actor._id, action: 'membership.days-credited', targetType: 'user', targetId: String(client._id), details: { creditId, termId: term.stripeId, days: input.days, beforeEnd, afterEnd, missedDate: input.missedDate } }], { session });
    // Remove stale expiry reminders; the normal reminder job uses the new date.
    for (const reminderTerm of reminderTerms) for (const phase of ['tomorrow', 'expired']) await Notification.deleteMany({ _id: { $in: ['staff', 'client'].map(audience => `term:${reminderTerm}:${beforeEnd.toISOString()}:${phase}:${audience}`) } }, { session });
    const endLabel = DateTime.fromJSDate(afterEnd, { zone: MEMBERSHIP_ZONE }).toFormat('LLL d, yyyy · h:mm a');
    const body = `Bravo credited ${input.days} ${input.days === 1 ? 'day' : 'days'} to your training membership. It now ends ${endLabel} (Aberdeen time).${input.missedDate ? ` Training on ${input.missedDate} is cancelled.` : ''} Reason: ${input.reason}.${input.note ? ` ${input.note}` : ''}`;
    await Notification.create([
      { _id: `credit:${creditId}:client`, userId: client._id, staff: false, body, href: '/schedule' },
      { _id: `credit:${creditId}:staff`, userId: client._id, staff: true, body: `${client.name}: ${body}`, href: `/schedule?client=${client._id}` },
    ], { session, ordered: true });
  });
  res.json({ ok: true, credit: { days: credit.days, beforeEnd: credit.beforeEnd, afterEnd: credit.afterEnd }, message: `${credit.days} ${credit.days === 1 ? 'day' : 'days'} credited. The membership end date and client schedule are updated. No charge was made.` });
}
