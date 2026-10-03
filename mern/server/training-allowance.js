import { Booking } from './models.js';

const counts = visits => {
  const result = new Map();
  for (const visit of visits || []) if (visit.service === 'training') result.set(visit.date, (result.get(visit.date) || 0) + 1);
  return result;
};

// Call inside the shared Settings transaction lock. Count across all requests,
// including unpaid holds; changing request keys or trainers cannot reset a day.
// Existing staff-approved extra sessions may be moved within the day or removed.
export async function assertTrainingAllowance({ userId, visits, previousVisits = [], bookingId, session }) {
  const before = counts(previousVisits), after = counts(visits);
  const addedDates = [...after.keys()].filter(date => after.get(date) > (before.get(date) || 0));
  if (!addedDates.length) return;
  const others = await Booking.find({ userId, status: { $in: ['requested', 'confirmed', 'waitlisted'] },
    ...(bookingId ? { _id: { $ne: bookingId } } : {}),
    visits: { $elemMatch: { service: 'training', date: { $in: addedDates } } },
  }).select('visits').session(session).lean();
  const existing = counts(others.flatMap(booking => booking.visits));
  if (addedDates.some(date => after.get(date) + (existing.get(date) || 0) > 1)) {
    throw Object.assign(new Error('Your training membership includes one session per day. Move or cancel the existing session, or contact Bravo for an additional session.'), { status: 409 });
  }
}
