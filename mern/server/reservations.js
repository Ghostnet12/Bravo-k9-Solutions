import { Booking, Slot } from './models.js';
import { bookingTrainerIds } from '../shared/trainers.js';

export const visitKey = visit => `${visit.date}|${visit.time}`;
const queryIn = (query, session) => session ? query.session(session) : query;

// Resolve reservations through their booking, including legacy date|time rows.
// One trainer's appointment never closes another trainer's calendar. Shared
// blocks and unassigned requests remain conservative business-wide holds.
export async function occupiedTimes({ from, to, trainerIds = [], excludeBookingId, session }) {
  const filter = { date: { $gte: from, $lte: to } };
  if (excludeBookingId) filter.bookingId = { $ne: excludeBookingId };
  const slots = await queryIn(Slot.find(filter).select('date time bookingId'), session).lean();
  const ids = [...new Set(slots.filter(slot => slot.bookingId).map(slot => String(slot.bookingId)))];
  const bookings = ids.length ? await queryIn(Booking.find({ _id: { $in: ids } }).select('staffId staffIds requestedStaffId requestedStaffIds status'), session).lean() : [];
  const records = new Map(bookings.map(booking => [String(booking._id), booking]));
  const blocked = slots.filter(slot => {
    if (!slot.bookingId) return true;
    const booking = records.get(String(slot.bookingId));
    if (!booking) return true;
    if (['cancelled', 'waitlisted'].includes(booking.status)) return false;
    const assigned = bookingTrainerIds(booking);
    return !trainerIds.length || !assigned.length || assigned.some(id => trainerIds.map(String).includes(id));
  });
  return [...new Set(blocked.map(visitKey))];
}

// All callers hold the shared Settings revision lock in this transaction.
export async function assertVisitsFree(visits, trainerIds, session, excludeBookingId) {
  if (!visits?.length) return;
  const dates = visits.map(visit => visit.date).sort();
  const busy = new Set(await occupiedTimes({ from: dates[0], to: dates.at(-1), trainerIds, excludeBookingId, session }));
  const conflict = visits.find(visit => busy.has(visitKey(visit)));
  if (conflict) throw Object.assign(new Error(`${conflict.date} at ${conflict.time} is reserved for this trainer or blocked. Choose another time.`), { status: 409 });
}

export async function reserveVisits(bookingId, visits, trainerIds, session) {
  if (!visits.length) return;
  await assertVisitsFree(visits, trainerIds, session, bookingId);
  // Per-booking keys allow different trainers at the same time. The transaction
  // lock and conflict check prevent two requests from reserving the same trainer.
  await Slot.insertMany(visits.map(visit => ({ _id: `${visitKey(visit)}|${bookingId}`, date: visit.date, time: visit.time, bookingId })), { session });
}
export const releaseVisit = (bookingId, visit, session) => Slot.deleteMany({ bookingId, date: visit.date, time: visit.time }, { session });
