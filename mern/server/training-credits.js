import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { User, Booking, Subscription, MemberAccess, Settings, BillingLock, Notification, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { releaseVisit } from './reservations.js';
import { assignedTrainerIds } from '../shared/trainers.js';
import { ALL_SERVICES } from '../shared/catalog.js';
import { MEMBERSHIP_ZONE } from '../shared/membership-terms.js';
import { CREDIT_REASONS, extendCalendarDays } from '../shared/training-credits.js';

const oid = z.string().regex(/^[a-f\d]{24}$/i);
const trainingIds = ALL_SERVICES.filter(s => s.includes.includes('training')).map(s => s.id);
const eligible = { status: { $in: ['active', 'trialing', 'canceled'] }, serviceIds: { $in: trainingIds } };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true }, termId: { type: String, required: true },
  requestKey: { type: String, required: true }, fingerprint: { type: String, required: true, select: false },
  missedDate: { type: String, required: true }, days: { type: Number, required: true }, reason: String, note: String,
  previousEnd: Date, newEnd: Date, actorId: mongoose.Schema.Types.ObjectId, actorName: String,
  cancelledVisits: [{ bookingId: mongoose.Schema.Types.ObjectId, date: String, time: String }],
}, { timestamps: true });
schema.index({ userId: 1, requestKey: 1 }, { unique: true });
// One event-day per client, not per dog, trainer, visit, or button tap.
schema.index({ userId: 1, missedDate: 1 }, { unique: true });
export const TrainingDayCredit = mongoose.models.BravoTrainingDayCredit || mongoose.model('BravoTrainingDayCredit', schema);
const inputSchema = z.object({
  clientId: oid, termId: z.string().min(1).max(200), requestKey: z.string().uuid(), expectedEnd: z.string().datetime(),
  missedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.number().int().min(1).max(31),
  reason: z.enum(Object.keys(CREDIT_REASONS)), note: z.string().trim().max(500).default(''), cancelVisits: z.boolean().default(false),
}).strict();
function assignedFilter(actor) { return actor.role === 'owner' ? {} : { $or: [{ staffId: actor._id }, { staffIds: actor._id }] }; }
async function clientAndBookings(actor, clientId, session) {
  const client = await User.findOne({ _id: clientId, role: 'member', blocked: { $ne: true }, removedAt: null }).select('name dogName').session(session).lean();
  if (!client) throw fail('Choose an active client account.', 404);
  const bookings = await Booking.find({ userId: clientId, status: { $in: ['requested', 'confirmed'] }, paymentStatus: { $in: ['paid', 'covered'] }, serviceIds: { $in: trainingIds } }).session(session).lean();
  if (actor.role !== 'owner' && !bookings.some(b => assignedTrainerIds(b).includes(String(actor._id)))) throw fail('Staff can credit only their assigned training clients.', 403);
  return { client, bookings };
}
function publicCredit(c) {
  return { id: String(c._id), termId: c.termId, missedDate: c.missedDate, days: c.days, reason: CREDIT_REASONS[c.reason] || 'Approved credit', note: c.note, previousEnd: c.previousEnd, newEnd: c.newEnd, actorName: c.actorName, createdAt: c.createdAt, cancelledVisits: c.cancelledVisits };
}
export async function creditClients(req, res) {
  const { q = '' } = z.object({ q: z.string().trim().max(80).optional() }).parse(req.query);
  const ids = await Booking.distinct('userId', { ...assignedFilter(req.user), status: { $in: ['requested', 'confirmed'] }, paymentStatus: { $in: ['paid', 'covered'] }, serviceIds: { $in: trainingIds } });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clients = await User.find({ _id: { $in: ids }, role: 'member', blocked: { $ne: true }, removedAt: null, ...(q ? { $or: [{ name: { $regex: escaped, $options: 'i' } }, { dogName: { $regex: escaped, $options: 'i' } }] } : {}) }).select('name dogName').sort({ name: 1, _id: 1 }).limit(100).lean();
  res.json({ clients });
}
export async function creditDetails(req, res) {
  const { client: clientParam } = z.object({ client: oid.optional() }).parse(req.query);
  const clientId = clientParam || String(req.user._id), isStaff = ['staff', 'owner'].includes(req.user.role);
  if (!isStaff && clientId !== String(req.user._id)) throw fail('You can only view your own day credits.', 403);
  const context = isStaff ? await clientAndBookings(req.user, clientId, null) : null;
  const terms = await Subscription.find({ userId: clientId, ...eligible }).select('stripeId validFrom validUntil source autoPayDisabled creditedDays creditBaseEnd dogCount serviceIds bookingId').sort({ validUntil: -1 }).limit(100).lean();
  const credits = await TrainingDayCredit.find({ userId: clientId }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ client: context?.client, terms, credits: credits.map(publicCredit), today: DateTime.now().setZone(MEMBERSHIP_ZONE).toISODate(), canCredit: isStaff });
}
export async function creditTrainingDays(req, res) {
  const data = inputSchema.parse(req.body);
  const missed = DateTime.fromISO(data.missedDate, { zone: MEMBERSHIP_ZONE });
  if (!missed.isValid || missed.toISODate() !== data.missedDate) throw fail('Choose a valid missed training date.');
  if (data.reason === 'other' && !data.note) throw fail('Please explain the reason for this credit.');
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  await TrainingDayCredit.init();
  let credit, replay = false;
  try {
    await transaction(async session => {
      const actor = await User.findOne({ _id: req.user._id, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true }, removedAt: null }).session(session);
      if (!actor) throw fail('Staff, administrator, or owner access is required.', 403);
      // Share the reservation lock: credit + cancellation + account state commit together.
      await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
      const { client, bookings } = await clientAndBookings(actor, data.clientId, session);
      const prior = await TrainingDayCredit.findOne({ userId: data.clientId, requestKey: data.requestKey }).select('+fingerprint').session(session);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw fail('This credit request changed. Reload before trying again.', 409);
        credit = prior; replay = true; return;
      }
      if (await TrainingDayCredit.exists({ userId: data.clientId, missedDate: data.missedDate }).session(session)) throw fail('This client already received credit for that date. No extra day was added.', 409);
      const term = await Subscription.findOne({ userId: data.clientId, stripeId: data.termId, ...eligible }).session(session);
      if (!term?.validFrom || !term.validUntil) throw fail('Choose a valid training membership.', 404);
      if (term.validUntil.toISOString() !== data.expectedEnd) throw fail('The membership end date changed. Reload the credit section before saving.', 409);
      if (term.stripeId.startsWith('sub_') && !term.autoPayDisabled) throw fail('This plan still has automatic Stripe billing. Ask an administrator to switch it to manual renewal before crediting days; no billing changes were made.', 409);
      const oldEnd = new Date(term.validUntil), newEnd = extendCalendarDays(oldEnd, data.days);
      const firstDate = DateTime.fromJSDate(term.validFrom, { zone: MEMBERSHIP_ZONE }).toISODate();
      const lastDate = DateTime.fromJSDate(oldEnd, { zone: MEMBERSHIP_ZONE }).minus({ milliseconds: 1 }).toISODate();
      if (data.missedDate < firstDate || data.missedDate > lastDate) throw fail('The missed date must fall inside the selected training membership.');
      if (await BillingLock.exists({ _id: data.clientId, expiresAt: { $gt: new Date() } }).session(session)) throw fail('This client has checkout in progress. Finish or cancel that checkout before crediting days.', 409);
      if (await Subscription.exists({ userId: data.clientId, stripeId: { $ne: term.stripeId }, ...eligible, validFrom: { $gte: oldEnd, $lt: newEnd }, validUntil: { $gt: oldEnd } }).session(session)) throw fail('A paid renewal already starts in these extra days. Ask an administrator to review the renewal before crediting this month; no dates were changed.', 409);
      const linked = bookings.filter(b => String(b._id) === String(term.bookingId) || (b.termStartsAt?.getTime() === term.validFrom.getTime() && b.termEndsAt?.getTime() === oldEnd.getTime()));
      if (actor.role === 'staff' && linked.length && !linked.some(b => assignedTrainerIds(b).includes(String(actor._id)))) throw fail('This training month is assigned to another trainer.', 403);
      const cancelled = [];
      if (data.cancelVisits) {
        for (const b of bookings) {
          const visits = b.visits.filter(v => v.service === 'training' && v.date === data.missedDate);
          if (!visits.length) continue;
          if (actor.role === 'staff' && !assignedTrainerIds(b).includes(String(actor._id))) throw fail('Another trainer also has a visit on this date. An administrator must cancel and credit this day.', 403);
          for (const v of visits) {
            await releaseVisit(b._id, v, session);
            cancelled.push({ bookingId: b._id, date: v.date, time: v.time });
          }
          await Booking.updateOne({ _id: b._id }, { $pull: { visits: { date: data.missedDate, service: 'training' } }, $addToSet: { cancelledVisits: { $each: visits } } }, { session });
        }
      }
      term.creditBaseEnd ||= oldEnd; term.creditPeriodStart = term.validFrom;
      term.creditedDays = (term.creditedDays || 0) + data.days; term.validUntil = newEnd;
      await term.save({ session });
      if (linked.length) await Booking.updateMany({ _id: { $in: linked.map(b => b._id) } }, { $set: { termEndsAt: newEnd } }, { session });
      // Keep the existing manually granted membership aligned, but never extend
      // an unrelated paid online plan or alter a payment/start date.
      const grant = await MemberAccess.findOne({ _id: data.clientId, enabled: true, trainingSubscriptionId: term.stripeId, endsAt: oldEnd }).session(session);
      if (grant) {
        grant.endsAt = newEnd; grant.revision += 1; grant.updatedBy = actor._id;
        await grant.save({ session });
        await Subscription.updateMany({ userId: data.clientId, source: 'grant', serviceIds: ['online'], status: 'active', validFrom: grant.startsAt, validUntil: oldEnd }, { $set: { validUntil: newEnd } }, { session });
      }
      [credit] = await TrainingDayCredit.create([{ ...data, userId: data.clientId, fingerprint, previousEnd: oldEnd, newEnd, actorId: actor._id, actorName: actor.name, cancelledVisits: cancelled }], { session });
      const label = DateTime.fromJSDate(newEnd, { zone: MEMBERSHIP_ZONE }).toFormat('LLL d, yyyy · h:mm a');
      const body = `${actor.name} credited ${data.days} training membership day${data.days === 1 ? '' : 's'} for ${data.missedDate} (${CREDIT_REASONS[data.reason]}). Your membership now ends ${label}, Aberdeen time.${cancelled.length ? ' Training visits on the missed date were cancelled.' : ''} No charge was made.${data.note ? ` ${data.note}` : ''}`;
      const event = randomUUID();
      await Notification.create([{ _id: `day-credit:${event}:client`, userId: data.clientId, staff: false, body, href: '/schedule' }, { _id: `day-credit:${event}:staff`, userId: data.clientId, staff: true, body: `${client.name}: ${body}`, href: `/schedule?client=${data.clientId}` }], { session, ordered: true });
      // Supersede stale expiry reminders; keep their history rather than silently deleting it.
      const reminderPrefix = `term:${term.stripeId}:${oldEnd.toISOString()}:`;
      await Notification.updateMany({ _id: { $in: ['tomorrow', 'expired'].flatMap(phase => ['staff', 'client'].map(audience => `${reminderPrefix}${phase}:${audience}`)) } }, { $set: { body: `Membership extended: ${client.name}'s training now ends ${label}, Aberdeen time. This replaces the earlier expiry reminder.` } }, { session });
      await AuditEvent.create([{ actorId: actor._id, action: 'training.days-credited', targetType: 'subscription', targetId: term.stripeId, details: { creditId: String(credit._id), userId: data.clientId, days: data.days, reason: data.reason, missedDate: data.missedDate, previousEnd: oldEnd, newEnd, cancelledVisits: cancelled } }], { session });
    });
  } catch (error) {
    if (error.code === 11000) throw fail('This day was already credited. Refresh to see the saved credit.', 409);
    throw error;
  }
  res.json({ ok: true, replay, credit: publicCredit(credit), message: replay ? 'This credit was already saved. No extra day was added.' : `${data.days} day${data.days === 1 ? '' : 's'} credited. The client’s membership was extended and the client and Bravo team were notified. No payment was taken.` });
}
