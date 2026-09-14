import { z } from 'zod';
import { DateTime } from 'luxon';
import { User, Subscription, Booking, MemberAccess, MembershipCredit, AuditEvent, Notification, Settings } from './models.js';
import { transaction } from './db.js';
import { releaseVisit } from './reservations.js';
import { creditableTerm, CREDIT_REASONS, trainingServiceIds, planCreditDays, creditPlacementDates } from '../shared/day-credits.js';
import { MEMBERSHIP_ZONE } from '../shared/membership-terms.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const common = { clientId: z.string().regex(/^[a-f\d]{24}$/i), requestKey: z.string().uuid(), note: z.string().trim().max(1200).default(''), includeWeekends: z.boolean().default(false) };
const inputSchema = z.object({ ...common, termId: z.string().min(1).max(150), expectedEnd: z.string().datetime(), days: z.number().int().min(1).max(366), reason: z.enum(CREDIT_REASONS).default('Other'), missedDate: dateSchema.optional(), missedDates: z.array(dateSchema).min(1).max(366).optional() }).strict();
const moveSchema = z.object({ ...common, creditId: z.string().min(1).max(180), expectedRevision: z.number().int().min(0), from: dateSchema, to: dateSchema }).strict();
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const localDay = value => DateTime.fromISO(value, { zone: MEMBERSHIP_ZONE });
const validDay = value => { const day = localDay(value); if (!day.isValid || day.toISODate() !== value) throw fail('Choose a valid calendar date.', 400); return day; };

async function context(req, input, session) {
  // All schedule writers share this transaction lock, including client removal.
  await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
  const actor = await User.findById(req.user._id).session(session);
  if (!actor || actor.blocked || actor.removedAt || !['staff', 'owner'].includes(actor.role)) throw fail('Bravo staff access required.', 403);
  const client = await User.findById(input.clientId).session(session);
  if (!client || client.blocked || client.removedAt || client.role !== 'member') throw fail('Choose an active client profile.');
  return { actor, client };
}
async function linkedBookings(client, term, session) {
  const bookings = await Booking.find({ userId: client._id, serviceIds: { $in: trainingServiceIds }, status: { $in: ['requested', 'confirmed'] }, paymentStatus: { $in: ['paid', 'covered'] }, $or: [
    ...(term.bookingId ? [{ _id: term.bookingId }] : []), { termStartsAt: term.validFrom, termEndsAt: term.validUntil }, { termEndsAt: { $exists: false } },
  ] }).session(session);
  if (term.bookingId && !bookings.some(booking => String(booking._id) === String(term.bookingId))) throw fail('The linked training request is inactive or refunded. Review it before adding credit.');
  return bookings;
}
async function extendMembership(client, actor, term, bookings, afterEnd, addedDays, session) {
  const beforeEnd = term.validUntil;
  if (afterEnd > beforeEnd && await Subscription.exists({ userId: client._id, stripeId: { $ne: term.stripeId }, serviceIds: { $in: trainingServiceIds }, status: { $in: ['active', 'trialing', 'canceled'] }, $or: [{ renewalOf: term.stripeId }, { validFrom: { $gte: beforeEnd, $lt: afterEnd }, validUntil: { $gt: beforeEnd } }] }).session(session)) throw fail('This would overlap a later membership. Ask the owner to review the membership dates.');
  for (const booking of bookings) {
    if (afterEnd > beforeEnd && (booking.termEndsAt?.getTime() === beforeEnd.getTime() || String(booking._id) === String(term.bookingId))) booking.termEndsAt = afterEnd;
    if (booking.isModified()) await booking.save({ session });
  }
  term.creditedDays = (term.creditedDays || 0) + addedDays;
  if (afterEnd > beforeEnd) { term.validUntil = afterEnd; term.creditedUntil = afterEnd; }
  await term.save({ session });
  if (afterEnd <= beforeEnd) return;
  const reminderTerms = [term.stripeId];
  const grant = await MemberAccess.findOne({ _id: client._id, enabled: true, trainingSubscriptionId: term.stripeId, endsAt: beforeEnd }).session(session);
  if (grant) {
    grant.endsAt = afterEnd; grant.revision += 1; grant.updatedBy = actor._id; await grant.save({ session });
    const filter = { userId: client._id, source: 'grant', serviceIds: ['online'], status: 'active', validFrom: grant.startsAt, validUntil: beforeEnd };
    const online = await Subscription.find(filter).select('stripeId').session(session).lean(); reminderTerms.push(...online.map(item => item.stripeId));
    await Subscription.updateMany(filter, { $set: { validUntil: afterEnd } }, { session });
  }
  for (const id of reminderTerms) for (const phase of ['tomorrow', 'expired']) await Notification.deleteMany({ _id: { $in: ['staff', 'client'].map(audience => `term:${id}:${beforeEnd.toISOString()}:${phase}:${audience}`) } }, { session });
}
async function notify(client, id, body, session) {
  await Notification.create([{ _id: `${id}:client`, userId: client._id, staff: false, body, href: '/schedule' }, { _id: `${id}:staff`, userId: client._id, staff: true, body: `${client.name}: ${body}`, href: `/schedule?client=${client._id}` }], { session, ordered: true });
}
export async function creditMembershipDays(req, res) {
  const input = inputSchema.parse(req.body);
  if (input.missedDate && input.missedDates) throw fail('Choose one list of missed dates.', 400);
  const missedDates = [...new Set(input.missedDates || (input.missedDate ? [input.missedDate] : []))].sort();
  if (missedDates.length && missedDates.length !== input.days) throw fail('Each selected missed date receives one credit day.', 400);
  let credit;
  await transaction(async session => {
    const { actor, client } = await context(req, input, session);
    const creditId = `${client._id}:${input.requestKey}`;
    credit = await MembershipCredit.findById(creditId).session(session);
    if (credit) {
      const previousDates = credit.missedDates || (credit.missedDate ? [credit.missedDate] : []);
      if (credit.termId !== input.termId || credit.days !== input.days || credit.reason !== input.reason || credit.note !== input.note || JSON.stringify([...previousDates].sort()) !== JSON.stringify(missedDates) || (credit.includeWeekends ?? false) !== input.includeWeekends) throw fail('This credit was already saved with different details. Reload before adding another.');
      return;
    }
    const term = await Subscription.findOne({ userId: client._id, stripeId: input.termId }).session(session);
    if (!term || !creditableTerm(term)) throw fail('Choose a dated training membership with manual renewal.');
    if (term.validUntil.toISOString() !== input.expectedEnd) throw fail('Membership dates changed. Reload this client before crediting days.');
    const beforeEnd = term.validUntil, plan = planCreditDays(beforeEnd, input.days, input.includeWeekends), afterEnd = plan.afterEnd;
    const bookings = await linkedBookings(client, term, session), cancelled = [];
    for (const missedDate of missedDates) {
      const day = validDay(missedDate);
      if (day.endOf('day').toJSDate() < term.validFrom || day.toJSDate() >= beforeEnd) throw fail('Choose missed dates within this membership.', 400);
      if (await MembershipCredit.exists({ userId: client._id, $or: [{ missedDate }, { missedDates: missedDate }] }).session(session)) throw fail('A selected missed date has already been credited. Reload the schedule.');
      let matched = false;
      for (const booking of bookings) {
        const visits = booking.visits.filter(v => v.service === 'training' && v.date === missedDate);
        const old = booking.cancelledVisits.filter(v => v.service === 'training' && v.date === missedDate);
        for (const visit of visits) { await releaseVisit(booking._id, visit, session); booking.cancelledVisits.push(visit); }
        booking.visits = booking.visits.filter(v => !(v.service === 'training' && v.date === missedDate));
        cancelled.push(...[...visits, ...old].map(v => ({ bookingId: booking._id, date: v.date, time: v.time })));
        if (visits.length || old.length) matched = true;
      }
      if (!matched) throw fail('No saved training visits match a selected date. Reload the schedule.');
    }
    await extendMembership(client, actor, term, bookings, afterEnd, input.days, session);
    [credit] = await MembershipCredit.create([{ _id: creditId, userId: client._id, termId: term.stripeId, actorId: actor._id, days: input.days, reason: input.reason, note: input.note, includeWeekends: input.includeWeekends, missedDates, ...(missedDates.length === 1 ? { missedDate: missedDates[0] } : {}), beforeEnd, afterEnd, creditDates: plan.dates, cancelled }], { session });
    await AuditEvent.create([{ actorId: actor._id, action: 'membership.days-credited', targetType: 'user', targetId: String(client._id), details: { creditId, termId: term.stripeId, days: input.days, beforeEnd, afterEnd, missedDates, creditDates: plan.dates } }], { session });
    await notify(client, `credit:${creditId}`, `Bravo added ${input.days} credit ${input.days === 1 ? 'day' : 'days'}: ${plan.dates.join(', ')}.${missedDates.length ? ` Training on ${missedDates.join(', ')} is cancelled.` : ''}${input.reason !== 'Other' ? ` Reason: ${input.reason}.` : ''}${input.note ? ` ${input.note}` : ''}`, session);
  });
  res.json({ ok: true, credit: { days: credit.days, beforeEnd: credit.beforeEnd, afterEnd: credit.afterEnd, creditDates: creditPlacementDates(credit) }, message: `${credit.days} credit ${credit.days === 1 ? 'day' : 'days'} saved. The membership and calendar are updated.` });
}
export async function moveMembershipCredit(req, res) {
  const input = moveSchema.parse(req.body), target = validDay(input.to);
  if (input.from === input.to) throw fail('Choose a different date.', 400);
  if (!input.includeWeekends && target.weekday >= 6) throw fail('Turn on Include weekends to move a credit to Saturday or Sunday.', 400);
  await transaction(async session => {
    const { actor, client } = await context(req, input, session);
    const credit = await MembershipCredit.findOne({ _id: input.creditId, userId: client._id }).session(session);
    if (!credit) throw fail('That credit is no longer available. Reload the calendar.');
    const previous = credit.moves.find(move => move.requestKey === input.requestKey);
    if (previous) {
      if (previous.from !== input.from || previous.to !== input.to || previous.note !== input.note) throw fail('This move was already saved with different details.');
      return;
    }
    if ((credit.revision || 0) !== input.expectedRevision) throw fail('This credit changed. Reload the calendar before moving it.');
    const dates = creditPlacementDates(credit), index = dates.indexOf(input.from);
    if (index < 0) throw fail('That credit has already moved. Reload the calendar.');
    const term = await Subscription.findOne({ userId: client._id, stripeId: credit.termId }).session(session);
    if (!term || !creditableTerm(term)) throw fail('This membership is no longer eligible for credit changes.');
    if (target.endOf('day').toJSDate() < term.validFrom) throw fail('Choose a date on or after the membership start.', 400);
    const others = await MembershipCredit.find({ userId: client._id }).session(session).lean();
    if (others.some(item => creditPlacementDates(item).includes(input.to))) throw fail('That date already has a credit. Choose another date.');
    const bookings = await linkedBookings(client, term, session);
    const afterEnd = new Date(Math.max(term.validUntil.getTime(), target.plus({ days: 1 }).startOf('day').toMillis()));
    await extendMembership(client, actor, term, bookings, afterEnd, 0, session);
    dates[index] = input.to; credit.creditDates = dates.sort(); credit.revision = (credit.revision || 0) + 1;
    credit.moves.push({ requestKey: input.requestKey, from: input.from, to: input.to, note: input.note, actorId: actor._id, createdAt: new Date() });
    await credit.save({ session });
    await AuditEvent.create([{ actorId: actor._id, action: 'membership.credit-moved', targetType: 'user', targetId: String(client._id), details: { creditId: credit._id, from: input.from, to: input.to, afterEnd } }], { session });
    await notify(client, `credit-move:${credit._id}:${input.requestKey}`, `Bravo moved your credit from ${input.from} to ${input.to}.${input.note ? ` ${input.note}` : ''}`, session);
  });
  res.json({ ok: true, date: input.to, message: `Credit moved to ${input.to}.` });
}
