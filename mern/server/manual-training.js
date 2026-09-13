import { randomUUID } from 'node:crypto';
import { Booking, Subscription, Settings } from './models.js';
import { effectiveServices } from './services.js';
import { quote } from '../shared/catalog.js';
import { assignedTrainerIds } from '../shared/trainers.js';
import { trainerCapacity, TRAINER_DOG_LIMIT } from './bookings.js';
import { dateTime } from './scheduling.js';

const fail = message => Object.assign(new Error(message), { status: 409 });

// Called inside the caller's membership transaction. Only manual training grants
// are editable here; payment records, trainer acceptance and visits are preserved.
export async function saveManualTraining({ user, actorId, term, dogCount, session, subscriptionId }) {
  await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
  const filter = { userId: user._id, source: 'grant', serviceIds: ['training'] };
  let subscription;
  if (subscriptionId) {
    subscription = await Subscription.findOne({ ...filter, stripeId: subscriptionId }).session(session);
    if (!subscription) throw fail('The linked training membership changed. Reload this client before saving.');
  } else {
    const matches = await Subscription.find({ ...filter, status: 'active', validFrom: { $lt: term.validUntil }, validUntil: { $gt: term.validFrom } }).limit(2).session(session);
    if (matches.length > 1) throw fail('This client has overlapping manual training memberships. Review their membership dates before saving.');
    subscription = matches[0];
  }
  let booking = subscription?.bookingId ? await Booking.findOne({ _id: subscription.bookingId, userId: user._id }).session(session) : null;
  if (subscription && (!booking || !['requested', 'confirmed'].includes(booking.status) || booking.paymentStatus !== 'covered' || booking.stripeSessionId || booking.stripePaymentIntentId || booking.checkoutStarting || booking.serviceIds.join(',') !== 'training')) {
    throw fail('The existing training request needs review. Open the client’s schedule before changing its membership.');
  }
  if (booking) {
    if (booking.visits.some(visit => {
      const at = dateTime(visit.date, visit.time).toJSDate();
      return at < term.validFrom || at >= term.validUntil;
    })) throw fail('Saved visits fall outside these membership dates. Adjust the schedule before changing the dates.');
    for (const trainerId of assignedTrainerIds(booking)) {
      const capacity = await trainerCapacity(trainerId, { session, excludeUserId: user._id });
      if (capacity.activeDogs + dogCount > TRAINER_DOG_LIMIT) throw fail('These dogs would exceed an assigned trainer’s five-dog limit. Adjust the trainer assignment first.');
    }
  } else {
    booking = new Booking({ userId: user._id, createdBy: actorId, requestKey: randomUUID(), serviceIds: ['training'], trainingFocus: 'basic-obedience', dogName: user.dogName || 'Training membership', phone: user.phone, address: user.address, visits: [], status: 'requested', paymentStatus: 'covered' });
  }
  booking.dogCount = dogCount;
  booking.termStartsAt = term.validFrom; booking.termEndsAt = term.validUntil;
  booking.quote = quote(['training'], [], { dogCount }, await effectiveServices());
  await booking.save({ session });
  subscription ||= new Subscription({ userId: user._id, stripeId: `grant:training:${user._id}:${randomUUID()}`, bookingId: booking._id, source: 'grant', serviceIds: ['training'] });
  Object.assign(subscription, term, { dogCount, autoPayDisabled: true, status: 'active' });
  await subscription.save({ session });
  return { bookingId: booking._id, subscriptionId: subscription.stripeId, dogCount };
}
