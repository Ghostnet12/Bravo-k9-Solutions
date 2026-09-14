import { DateTime } from 'luxon';
import { ALL_SERVICES } from './catalog.js';
import { MEMBERSHIP_ZONE } from './membership-terms.js';

export const CREDIT_REASONS = ['Rain', 'Snow', 'Trainer unavailable', 'Other'];
export const trainingServiceIds = ALL_SERVICES.filter(service => service.includes.includes('training')).map(service => service.id);
export const isTrainingTerm = term => term.serviceIds?.some(id => trainingServiceIds.includes(id));
export const creditableTerm = term => isTrainingTerm(term) && ['active', 'trialing', 'canceled'].includes(term.status)
  && !!term.validFrom && new Date(term.validUntil) > new Date(term.validFrom)
  && (!term.stripeId?.startsWith('sub_') || term.autoPayDisabled === true);

// Resolve the membership from the selected request and date, without making
// staff choose internal membership records or guessing between legacy terms.
export function termForDayCredit(terms = [], booking, date) {
  if (!booking || !date) return null;
  const day = DateTime.fromISO(date, { zone: MEMBERSHIP_ZONE });
  if (!day.isValid || day.toISODate() !== date) return null;
  const candidates = terms.filter(term => creditableTerm(term)
    && day.endOf('day').toMillis() >= new Date(term.validFrom).getTime()
    && day.toMillis() < new Date(term.validUntil).getTime());
  const direct = candidates.filter(term => String(term.bookingId || '') === String(booking._id));
  if (direct.length) return direct.length === 1 ? direct[0] : null;
  const exact = candidates.filter(term => new Date(term.validFrom).getTime() === new Date(booking.termStartsAt).getTime()
    && new Date(term.validUntil).getTime() === new Date(booking.termEndsAt).getTime());
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  return !booking.termEndsAt && candidates.length === 1 ? candidates[0] : null;
}
export function creditedEnd(end, days) {
  const date = DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE });
  if (!date.isValid || !Number.isInteger(days) || days < 1 || days > 31) throw new Error('Choose 1 to 31 whole days to credit.');
  return date.plus({ days }).toJSDate();
}
export const remainingDays = (end, now = new Date()) => Math.max(0, Math.ceil(
  DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE }).diff(DateTime.fromJSDate(new Date(now), { zone: MEMBERSHIP_ZONE }), 'days').days
));

// Membership ends are exclusive. Midnight on the 11th means the 10th
// is the last covered calendar day. Show newly added dates, not fake visits.
export const lastCoveredDay = end => DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE }).minus({ milliseconds: 1 }).toISODate();
export function creditedCalendarDates(terms = [], credits = [], termId) {
  const dates = new Set();
  for (const credit of credits) {
    const term = terms.find(item => item.stripeId === credit.termId && (!termId || item.stripeId === termId));
    if (!term || !isTrainingTerm(term) || !['active', 'trialing', 'canceled'].includes(term.status)) continue;
    const termEnd = lastCoveredDay(term.validUntil), termStart = DateTime.fromJSDate(new Date(term.validFrom), { zone: MEMBERSHIP_ZONE }).toISODate();
    if (!termEnd || !termStart) continue;
    for (const key of creditPlacementDates(credit)) if (key >= termStart && key <= termEnd) dates.add(key);
  }
  return [...dates].sort();
}

// Explicit placements allow a credit to move without changing its original audit dates.
export function creditPlacementDates(credit) {
  if (Array.isArray(credit.creditDates)) return [...credit.creditDates].sort();
  const first = DateTime.fromISO(lastCoveredDay(credit.beforeEnd) || '', { zone: MEMBERSHIP_ZONE }).plus({ days: 1 });
  const last = lastCoveredDay(credit.afterEnd);
  if (!first.isValid || !last) return [];
  const dates = [];
  for (let day = first; day.toISODate() <= last && dates.length < 366; day = day.plus({ days: 1 })) dates.push(day.toISODate());
  return dates;
}
export function planCreditDays(end, count, includeWeekends = false) {
  if (!Number.isInteger(count) || count < 1 || count > 366) throw new Error('Choose 1 to 366 days per save. You can add more afterwards.');
  let day = DateTime.fromISO(lastCoveredDay(end) || '', { zone: MEMBERSHIP_ZONE });
  if (!day.isValid) throw new Error('A valid membership end date is required.');
  const dates = [];
  while (dates.length < count) {
    day = day.plus({ days: 1 });
    if (includeWeekends || day.weekday <= 5) dates.push(day.toISODate());
  }
  return { dates, afterEnd: day.plus({ days: 1 }).startOf('day').toJSDate() };
}
