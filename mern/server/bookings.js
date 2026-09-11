import { z } from 'zod';
import { Booking, Settings, Slot, Subscription, User } from './models.js';
import { transaction } from './db.js';
import { availability, validateVisits, dateTime, dateRange } from './scheduling.js';
import { quote, serviceSelection, TRAINING_FOCUSES } from '../shared/catalog.js';
import { effectiveServices } from './services.js';
import { filterTrainerAvailability, checkTrainerVisits } from './trainer-schedules.js';
export const bookingInput = z.object({
  requestKey: z.string().uuid(), serviceIds: z.array(z.string()).min(1).max(4),
  preferredTrainerId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  visits: z.array(z.object({ date: z.string(), time: z.string(), service: z.string() })).max(62),
  trainingFocus: z.enum(TRAINING_FOCUSES.map(focus => focus.id)).optional(),
  dogCount: z.number().int().min(1).max(10).default(1),
  dogName: z.string().trim().min(1).max(80), phone: z.string().trim().min(7).max(30),
  address: z.string().trim().max(300), notes: z.string().trim().max(1500).default(''),
});
export const TRAINER_DOG_LIMIT = 5;
export async function trainerCapacity(staffId, { session, excludeUserId } = {}) {
  if (!staffId) return { activeDogs: 0, spotsRemaining: TRAINER_DOG_LIMIT, full: false };
  const filter = { staffId, status: { $in: ['requested', 'confirmed'] }, serviceIds: 'training' };
  if (excludeUserId) filter.userId = { $ne: excludeUserId };
  let query = Booking.find(filter).select('userId dogCount');
  if (session) query = query.session(session);
  const records = await query.lean();
  const dogsByClient = new Map();
  for (const record of records) {
    const client = String(record.userId);
    dogsByClient.set(client, Math.max(dogsByClient.get(client) || 0, record.dogCount || 1));
  }
  const activeDogs = [...dogsByClient.values()].reduce((total, dogs) => total + dogs, 0);
  return { activeDogs, spotsRemaining: Math.max(0, TRAINER_DOG_LIMIT - activeDogs), full: activeDogs >= TRAINER_DOG_LIMIT };
}
async function activeTrainer(id) {
  if (!id) return null;
  const trainer = await User.exists({ _id: id, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } });
  if (!trainer) throw new Error('Choose an active trainer.');
  return trainer;
}
export async function getEntitlements(userId) {
  const subs = await Subscription.find({ userId, status: { $in: ['active', 'trialing'] }, validUntil: { $gt: new Date() } }).lean();
  const active = new Set(['training', 'walking', 'sitting', 'online', 'aggression']);
  const legacy = { complete: ['training', 'sitting'], 'all-access': ['training', 'sitting', 'online'] };
  const services = [...new Set(subs.flatMap(subscription => subscription.serviceIds.flatMap(id => legacy[id] || (active.has(id) ? [id] : []))))];
  const serviceDogCounts = subs.reduce((counts, subscription) => {
    for (const service of subscription.serviceIds.flatMap(id => legacy[id] || [id])) counts[service] = Math.max(counts[service] || 0, service === 'training' ? subscription.dogCount || 1 : 1);
    return counts;
  }, {});
  return { subscriptions: subs, services, serviceDogCounts };
}
export function bookingCoveredByEntitlements(serviceIds, dogCount, entitlements) {
  return serviceSelection(serviceIds).every(service => service.interval === 'month' && service.includes.every(id => entitlements.services.includes(id)))
    && (!serviceIds.includes('training') || (entitlements.serviceDogCounts?.training || 0) >= dogCount);
}
export async function getAvailability(from, to, staffId = null) {
  if (staffId) { z.string().regex(/^[a-f\d]{24}$/i).parse(staffId); await activeTrainer(staffId); }
  dateRange(from, to); // Validate bounded dates before issuing a database range query.
  const settings = await Settings.findById('schedule').lean();
  const slots = await Slot.find({ date: { $gte: from, $lte: to } }, { _id: 1 }).lean();
  return { days: await filterTrainerAvailability(availability({ from, to, settings, occupied: slots.map(s => s._id) }), staffId, settings), enabled: settings.enabled };
}
export async function createBooking(userId, payload, assignment = {}) {
  const data = bookingInput.parse(payload);
  if (data.serviceIds.includes('training')) data.trainingFocus ||= 'basic-obedience';
  else delete data.trainingFocus;
  const catalog = await effectiveServices();
  serviceSelection(data.serviceIds, catalog);
  validateVisits(data.serviceIds, data.visits, catalog);
  if (data.visits.length && data.address.length < 5) throw new Error('Enter the address where Bravo should visit.');
  const dates = data.visits.map(v => v.date).sort();
  const maximum = dateTime(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })).plus({ days: 92 });
  if (dates.some(date => dateTime(date) > maximum)) throw new Error('Book within the next 92 days.');
  const existing = await Booking.findOne({ userId, requestKey: data.requestKey });
  if (existing) return existing;
  const chosenTrainerId = assignment.staffId || data.preferredTrainerId || null;
  if (chosenTrainerId) await activeTrainer(chosenTrainerId);
  delete data.preferredTrainerId;
  const entitlements = await getEntitlements(userId);
  const covered = bookingCoveredByEntitlements(data.serviceIds, data.dogCount, entitlements);
  let booking;
  try {
    await transaction(async session => {
      // Schedule updates and reservations share a write lock; closures cannot race a booking.
      const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
      await checkTrainerVisits(chosenTrainerId, data.visits, settings, session);
      const capacity = data.serviceIds.includes('training') && chosenTrainerId ? await trainerCapacity(chosenTrainerId, { session, excludeUserId: userId }) : null;
      const waitlisted = !!capacity && capacity.activeDogs + data.dogCount > TRAINER_DOG_LIMIT;
      if (dates.length && !waitlisted) {
        const open = availability({ from: dates[0], to: dates.at(-1), settings });
        if (data.visits.some(v => !open.find(d => d.date === v.date)?.slots.includes(v.time))) throw Object.assign(new Error('One or more visits are no longer available. Refresh the schedule.'), { status: 409 });
      }
      [booking] = await Booking.create([{ ...data, userId, staffId: waitlisted ? null : chosenTrainerId, requestedStaffId: chosenTrainerId, createdBy: assignment.createdBy || userId, status: waitlisted ? 'waitlisted' : 'requested', waitlistedAt: waitlisted ? new Date() : undefined, quote: quote(data.serviceIds, data.visits, { dogCount: data.dogCount }, catalog), paymentStatus: covered ? 'covered' : 'unpaid' }], { session });
      if (data.visits.length && !waitlisted) await Slot.insertMany(data.visits.map(v => ({ _id: `${v.date}|${v.time}`, date: v.date, time: v.time, bookingId: booking._id })), { session });
    });
  } catch (error) {
    if (error.code === 11000) {
      const retry = await Booking.findOne({ userId, requestKey: data.requestKey });
      if (retry) return retry;
      throw Object.assign(new Error('That time was just taken. Refresh availability and select another opening.'), { status: 409 });
    }
    throw error;
  }
  return booking;
}
export async function assignTrainer(booking, staffId) {
  if (!staffId) {
    const previous = booking.staffId;
    booking.staffId = null;
    await booking.save();
    if (previous) await promoteTrainerWaitlist(previous);
    return booking;
  }
  await activeTrainer(staffId);
  if (!booking.serviceIds?.includes('training')) {
    await transaction(async session => {
      const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
      await checkTrainerVisits(staffId, booking.visits || [], settings, session);
      booking.staffId = staffId; booking.requestedStaffId ||= staffId; await booking.save({ session });
    });
    return booking;
  }
  const previous = booking.staffId;
  await transaction(async session => {
    const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
    await checkTrainerVisits(staffId, booking.visits || [], settings, session);
    const capacity = await trainerCapacity(staffId, { session, excludeUserId: booking.userId });
    if (capacity.activeDogs + (booking.dogCount || 1) > TRAINER_DOG_LIMIT) throw Object.assign(new Error('That trainer is at the five-dog limit. This client must remain on the waiting list or choose another trainer.'), { status: 409 });
    if (booking.status === 'waitlisted' && booking.visits.length) {
      const dates = booking.visits.map(visit => visit.date).sort();
      const occupied = await Slot.find({ date: { $gte: dates[0], $lte: dates.at(-1) } }, { _id: 1 }).session(session).lean();
      const open = availability({ from: dates[0], to: dates.at(-1), settings, occupied: occupied.map(slot => slot._id) });
      if (booking.visits.some(visit => !open.find(day => day.date === visit.date)?.slots.includes(visit.time))) throw Object.assign(new Error('This waitlisted client’s preferred times are no longer open. Ask them to choose new dates before activating the request.'), { status: 409 });
      await Slot.insertMany(booking.visits.map(visit => ({ _id: `${visit.date}|${visit.time}`, date: visit.date, time: visit.time, bookingId: booking._id })), { session });
    }
    const result = await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' } }, { $set: { staffId, requestedStaffId: staffId, status: booking.status === 'waitlisted' ? 'requested' : booking.status }, $unset: { waitlistedAt: 1 } }, { session });
    if (!result.matchedCount) throw Object.assign(new Error('This request changed. Refresh and try again.'), { status: 409 });
  });
  if (previous && String(previous) !== String(staffId)) await promoteTrainerWaitlist(previous);
  return Booking.findById(booking._id);
}
export async function promoteTrainerWaitlist(staffId) {
  if (!staffId) return null;
  const next = await Booking.findOne({ requestedStaffId: staffId, status: 'waitlisted' }).sort({ waitlistedAt: 1, createdAt: 1 });
  if (!next) return null;
  try { return await assignTrainer(next, staffId); }
  catch (error) { if (error.status === 409 || error.code === 11000) return null; throw error; }
}
export async function cancelBooking(booking, stripe) {
  const current = await Booking.findById(booking._id);
  if (!current) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (current.checkoutStarting) throw Object.assign(new Error('Checkout is still starting. Retry checkout from your account, then cancel after it finishes opening.'), { status: 409 });
  if (current.stripeSessionId) {
    if (!stripe) throw Object.assign(new Error('Contact Bravo to cancel this checkout-linked booking.'), { status: 503 });
    const checkout = await stripe.checkout.sessions.retrieve(current.stripeSessionId);
    if (checkout.status === 'open') await stripe.checkout.sessions.expire(checkout.id);
  }
  await transaction(async session => {
    const result = await Booking.updateOne({ _id: booking._id, checkoutStarting: { $ne: true }, stripeSessionId: current.stripeSessionId || { $exists: false } }, { $set: { status: 'cancelled' } }, { session });
    if (!result.matchedCount) throw Object.assign(new Error('Checkout is starting. Wait for it to open before cancelling.'), { status: 409 });
    await Slot.deleteMany({ bookingId: booking._id }, { session });
  });
  await promoteTrainerWaitlist(current.staffId);
  // Cancellation never silently refunds a charge or cancels a recurring plan.
}
