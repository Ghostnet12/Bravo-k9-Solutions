import { z } from 'zod';
import { occupiedTimes, reserveVisits, assertVisitsFree } from './reservations.js';
import { randomUUID } from 'node:crypto';
import { trainerSelectionInput, resolveTrainerIds } from './trainer-selection.js';
import { assignedTrainerIds, requestedTrainerIds, acceptedTrainerIds } from '../shared/trainers.js';
import { Booking, Settings, Slot, Subscription, User, Notification, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { availability, validateVisits, dateTime, dateRange } from './scheduling.js';
import { quote, serviceSelection, TRAINING_FOCUSES, ALL_SERVICES } from '../shared/catalog.js';
import { effectiveServices } from './services.js';
import { filterTrainerAvailability, checkTrainerVisits } from './trainer-schedules.js';
import { activeTermQuery, monthTerm } from '../shared/membership-terms.js';
export const bookingInput = z.object({
  requestKey: z.string().uuid(), serviceIds: z.array(z.string()).min(1).max(4),
  preferredTrainerId: trainerSelectionInput.nullable().optional(),
  visits: z.array(z.object({ date: z.string(), time: z.string(), service: z.string() })).max(62),
  trainingFocus: z.enum(TRAINING_FOCUSES.map(focus => focus.id)).optional(),
  dogCount: z.number().int().min(1).max(10).default(1),
  dogName: z.string().trim().min(1).max(80), phone: z.string().trim().min(7).max(30),
  address: z.string().trim().max(300), notes: z.string().trim().max(1500).default(''),
});
export const TRAINER_DOG_LIMIT = 5;
export async function trainerCapacity(staffId, { session, excludeUserId } = {}) {
  if (!staffId) return { activeDogs: 0, spotsRemaining: TRAINER_DOG_LIMIT, full: false };
  const filter = { $or: [{ staffId }, { staffIds: staffId }], status: { $in: ['requested', 'confirmed'] }, serviceIds: 'training' };
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
export async function getEntitlements(userId, { includeFuture = false } = {}) {
  const filter = activeTermQuery();
  if (includeFuture) delete filter.$or;
  const subs = await Subscription.find({ userId, ...filter }).lean();
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
  const trainerIds = await resolveTrainerIds(staffId);
  dateRange(from, to); // Validate bounded dates before issuing a database range query.
  const settings = await Settings.findById('schedule').lean();
  const occupied = new Set(await occupiedTimes({ from, to, trainerIds }));
  const working = await filterTrainerAvailability(availability({ from, to, settings }), trainerIds, settings);
  return { days: working.map(day => ({ ...day, workingHours: day.slots, slots: day.slots.filter(time => !occupied.has(`${day.date}|${time}`)), reservedTimes: [...occupied].filter(key => key.startsWith(`${day.date}|`)).map(key => key.split('|')[1]) })), enabled: settings.enabled };
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
  const chosenTrainerIds = await resolveTrainerIds(assignment.staffId || data.preferredTrainerId || null);
  const chosenTrainerId = chosenTrainerIds[0] || null;
  delete data.preferredTrainerId;
  const entitlements = await getEntitlements(userId, { includeFuture: true });
  const covered = bookingCoveredByEntitlements(data.serviceIds, data.dogCount, entitlements) && data.visits.every(visit => entitlements.subscriptions.some(term => serviceSelection(term.serviceIds, ALL_SERVICES).some(service => service.includes.includes(visit.service)) && dateTime(visit.date, visit.time).toJSDate() < term.validUntil && (!term.validFrom || dateTime(visit.date, visit.time).toJSDate() >= term.validFrom)));
  if (!covered && data.visits.some(visit => visit.service === 'training' && dateTime(visit.date, visit.time).toJSDate() >= monthTerm().validUntil)) throw Object.assign(new Error('A training purchase covers one month. Choose training dates within the next month, then renew manually for later visits.'), { status: 400 });
  let booking;
  try {
    await transaction(async session => {
      // Schedule updates and reservations share a write lock; closures cannot race a booking.
      const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
      await resolveTrainerIds(chosenTrainerIds, session);
      await checkTrainerVisits(chosenTrainerIds, data.visits, settings, session);
      const capacities = [];
      if (data.serviceIds.includes('training')) for (const trainerId of chosenTrainerIds) capacities.push(await trainerCapacity(trainerId, { session, excludeUserId: userId }));
      const waitlisted = capacities.some(capacity => capacity.activeDogs + data.dogCount > TRAINER_DOG_LIMIT);
      if (dates.length && !waitlisted) {
        const open = availability({ from: dates[0], to: dates.at(-1), settings });
        if (data.visits.some(v => !open.find(d => d.date === v.date)?.slots.includes(v.time))) throw Object.assign(new Error('One or more visits are no longer available. Refresh the schedule.'), { status: 409 });
      }
      [booking] = await Booking.create([{ ...data, userId, staffId: waitlisted ? null : chosenTrainerId, staffIds: waitlisted ? [] : chosenTrainerIds, requestedStaffId: chosenTrainerId, requestedStaffIds: chosenTrainerIds, trainerAcceptanceRequired: chosenTrainerIds.length > 1, createdBy: assignment.createdBy || userId, status: waitlisted ? 'waitlisted' : 'requested', waitlistedAt: waitlisted ? new Date() : undefined, quote: quote(data.serviceIds, data.visits, { dogCount: data.dogCount }, catalog), paymentStatus: covered ? 'covered' : 'unpaid' }], { session });
      if (data.visits.length && !waitlisted) await reserveVisits(booking._id, data.visits, chosenTrainerIds, session);
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
export async function assignTrainer(booking, selection, options = {}) {
  const trainerIds = await resolveTrainerIds(selection);
  const previous = assignedTrainerIds(booking);
  const sameAssignment = previous.length === trainerIds.length && previous.every(id => trainerIds.includes(id));
  const acceptingIds = options.acceptedBy ? (options.acceptingStaffIds || trainerIds).map(String) : [];
  if (acceptingIds.some(id => !trainerIds.includes(id))) throw Object.assign(new Error('This trainer is not assigned to this client.'), { status: 409 });
  const acceptedIds = options.acceptedBy ? [...new Set([...(sameAssignment ? acceptedTrainerIds(booking) : []), ...acceptingIds])] : [];
  const complete = !!options.acceptedBy && trainerIds.length > 0 && trainerIds.every(id => acceptedIds.includes(id));
  const acceptance = { trainerAcceptedIds: acceptedIds, trainerAcceptanceRequired: trainerIds.length > 0 && (options.acceptedBy ? !complete : !!options.requireAcceptance || trainerIds.length > 1 || !!booking.trainerAcceptanceRequired), trainerAcceptedAt: complete ? new Date() : null, trainerAcceptedBy: complete ? options.acceptedBy : null };
  await transaction(async session => {
    // Both trainers and all slot reservations share one transaction and schedule lock.
    const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
    await resolveTrainerIds(trainerIds, session);
    await checkTrainerVisits(trainerIds, booking.visits || [], settings, session);
    if (booking.serviceIds?.includes('training')) for (const trainerId of trainerIds) {
      const capacity = await trainerCapacity(trainerId, { session, excludeUserId: booking.userId });
      if (capacity.activeDogs + (booking.dogCount || 1) > TRAINER_DOG_LIMIT) throw Object.assign(new Error('One of the selected trainers is at the five-dog limit. Keep this request on the waiting list or choose another trainer.'), { status: 409 });
    }
    await assertVisitsFree(booking.visits, trainerIds, session, booking._id);
    if (trainerIds.length && booking.status === 'waitlisted' && booking.visits.length) {
      const dates = booking.visits.map(visit => visit.date).sort();
      const open = availability({ from: dates[0], to: dates.at(-1), settings });
      if (booking.visits.some(visit => !open.find(day => day.date === visit.date)?.slots.includes(visit.time))) throw Object.assign(new Error('This waitlisted client’s preferred times are no longer open. Choose new dates before activating the request.'), { status: 409 });
      await reserveVisits(booking._id, booking.visits, trainerIds, session);
    }
    const result = await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' }, ...((options.expectedUpdatedAt || booking.updatedAt) ? { updatedAt: options.expectedUpdatedAt || booking.updatedAt } : {}) }, {
      $set: { staffId: trainerIds[0] || null, staffIds: trainerIds, requestedStaffId: trainerIds[0] || null, requestedStaffIds: trainerIds, ...acceptance, status: trainerIds.length && booking.status === 'waitlisted' ? 'requested' : booking.status },
      ...(trainerIds.length ? { $unset: { waitlistedAt: 1 } } : {}),
    }, { session });
    if (!result.matchedCount) throw Object.assign(new Error('This request changed. Refresh and try again.'), { status: 409 });
    if (options.acceptedBy) {
      const people = await User.find({ _id: { $in: acceptingIds } }).select('name').session(session).lean();
      const body = `${people.map(person => person.name).join(' and ')} accepted ${booking.dogName || 'your dog'} as a training client. ${complete ? 'Your saved schedule now shows your trainer' + (trainerIds.length > 1 ? 's.' : '.') : 'The other assigned trainer still needs to accept.'}`;
      const event = randomUUID();
      await Notification.create([{ _id: `trainer:${booking._id}:${event}:client`, staff: false, userId: booking.userId, body, href: '/schedule' }, { _id: `trainer:${booking._id}:${event}:staff`, staff: true, body, href: `/schedule?client=${booking.userId}` }], { session, ordered: true });
      await AuditEvent.create([{ actorId: options.acceptedBy, action: 'trainer.client.accepted', targetType: 'booking', targetId: String(booking._id), details: { staffId: trainerIds[0] || null, staffIds: trainerIds, acceptingStaffIds: acceptingIds, complete } }], { session });
    }
  });
  for (const formerId of previous.filter(id => !trainerIds.includes(id))) await promoteTrainerWaitlist(formerId);
  return Booking.findById(booking._id);
}
export async function promoteTrainerWaitlist(staffId) {
  if (!staffId) return null;
  const next = await Booking.findOne({ $or: [{ requestedStaffId: staffId }, { requestedStaffIds: staffId }], status: 'waitlisted' }).sort({ waitlistedAt: 1, createdAt: 1 });
  if (!next) return null;
  try { return await assignTrainer(next, requestedTrainerIds(next), { requireAcceptance: true }); }
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
    const result = await Booking.updateOne({ _id: booking._id, checkoutStarting: { $ne: true }, stripeSessionId: current.stripeSessionId || { $exists: false } }, { $set: { status: 'cancelled', ...(current.renewalOf ? { requestKey: `cancelled-renewal:${current._id}` } : {}) } }, { session });
    if (!result.matchedCount) throw Object.assign(new Error('Checkout is starting. Wait for it to open before cancelling.'), { status: 409 });
    await Slot.deleteMany({ bookingId: booking._id }, { session });
  });
  for (const trainerId of assignedTrainerIds(current)) await promoteTrainerWaitlist(trainerId);
  // Cancellation never silently refunds a charge or cancels a recurring plan.
}
