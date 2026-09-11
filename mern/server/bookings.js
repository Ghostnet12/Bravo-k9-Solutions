import { z } from 'zod';
import { Booking, Settings, Slot, Subscription } from './models.js';
import { transaction } from './db.js';
import { availability, validateVisits, dateTime } from './scheduling.js';
import { quote, serviceSelection } from '../shared/catalog.js';
import { effectiveServices } from './services.js';
export const bookingInput = z.object({
  requestKey: z.string().uuid(), serviceIds: z.array(z.string()).min(1).max(4),
  visits: z.array(z.object({ date: z.string(), time: z.string(), service: z.string() })).max(62),
  dogCount: z.number().int().min(1).max(10).default(1),
  dogName: z.string().trim().min(1).max(80), phone: z.string().trim().min(7).max(30),
  address: z.string().trim().max(300), notes: z.string().trim().max(1500).default(''),
});
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
export async function getAvailability(from, to) {
  const settings = await Settings.findById('schedule').lean();
  const slots = await Slot.find({ date: { $gte: from, $lte: to } }, { _id: 1 }).lean();
  return { days: availability({ from, to, settings, occupied: slots.map(s => s._id) }), enabled: settings.enabled };
}
export async function createBooking(userId, payload, assignment = {}) {
  const data = bookingInput.parse(payload);
  const catalog = await effectiveServices();
  serviceSelection(data.serviceIds, catalog);
  validateVisits(data.serviceIds, data.visits, catalog);
  if (data.visits.length && data.address.length < 5) throw new Error('Enter the address where Bravo should visit.');
  const dates = data.visits.map(v => v.date).sort();
  const maximum = dateTime(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })).plus({ days: 92 });
  if (dates.some(date => dateTime(date) > maximum)) throw new Error('Book within the next 92 days.');
  const existing = await Booking.findOne({ userId, requestKey: data.requestKey });
  if (existing) return existing;
  const entitlements = await getEntitlements(userId);
  const covered = bookingCoveredByEntitlements(data.serviceIds, data.dogCount, entitlements);
  let booking;
  try {
    await transaction(async session => {
      // Schedule updates and reservations share a write lock; closures cannot race a booking.
      const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
      if (dates.length) {
        const open = availability({ from: dates[0], to: dates.at(-1), settings });
        if (data.visits.some(v => !open.find(d => d.date === v.date)?.slots.includes(v.time))) throw Object.assign(new Error('One or more visits are no longer available. Refresh the schedule.'), { status: 409 });
      }
      [booking] = await Booking.create([{ ...data, userId, staffId: assignment.staffId || null, createdBy: assignment.createdBy || userId, quote: quote(data.serviceIds, data.visits, { dogCount: data.dogCount }, catalog), paymentStatus: covered ? 'covered' : 'unpaid' }], { session });
      if (data.visits.length) await Slot.insertMany(data.visits.map(v => ({ _id: `${v.date}|${v.time}`, date: v.date, time: v.time, bookingId: booking._id })), { session });
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
export async function cancelBooking(booking, stripe) {
  const current = await Booking.findById(booking._id);
  if (current.checkoutStarting) throw Object.assign(new Error('Checkout is still starting. Retry checkout from your account, then cancel after it finishes opening.'), { status: 409 });
  if (booking.stripeSessionId) {
    if (!stripe) throw Object.assign(new Error('Contact Bravo to cancel this checkout-linked booking.'), { status: 503 });
    const checkout = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
    if (checkout.status === 'open') await stripe.checkout.sessions.expire(checkout.id);
  }
  await transaction(async session => {
    const result = await Booking.updateOne({ _id: booking._id, checkoutStarting: { $ne: true } }, { $set: { status: 'cancelled' } }, { session });
    if (!result.matchedCount) throw Object.assign(new Error('Checkout is starting. Wait for it to open before cancelling.'), { status: 409 });
    await Slot.deleteMany({ bookingId: booking._id }, { session });
  });
  // Cancellation never silently refunds a charge or cancels a recurring plan.
}
