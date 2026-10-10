import { DateTime } from 'luxon';
import { termActive } from './membership-terms.js';
export function nextRequestedVisit(bookings = [], now = DateTime.now()) {
  return bookings.filter(booking => ['requested', 'confirmed'].includes(booking.status))
    .flatMap(booking => (booking.visits || []).filter(visit => !visit.cancelled && visit.status !== 'cancelled').map(visit => ({ ...visit, bookingId: String(booking._id), dogName: booking.dogName, status: booking.status, paymentStatus: booking.paymentStatus })))
    .filter(visit => { const start = DateTime.fromISO(`${visit.date}T${visit.time}`, { zone: 'America/Chicago' }); return start.isValid && start.toMillis() > now.toMillis(); })
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0] || null;
}
export function currentTrainingTerm(terms = [], now = Date.now()) {
  return terms.filter(term => term.serviceIds?.includes('training') && termActive(term, new Date(now)))
    .sort((a, b) => Date.parse(b.validUntil) - Date.parse(a.validUntil))[0] || null;
}
