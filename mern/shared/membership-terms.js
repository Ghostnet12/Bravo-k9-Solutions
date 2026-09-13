import { DateTime } from 'luxon';
export const MEMBERSHIP_ZONE = 'America/Chicago';
export function monthTerm(start = new Date()) {
  const date = DateTime.fromJSDate(new Date(start), { zone: MEMBERSHIP_ZONE });
  if (!date.isValid) throw new Error('Invalid membership start date.');
  return { validFrom: date.toJSDate(), validUntil: date.plus({ months: 1 }).toJSDate() };
}
export function manualMonthTerm(startDate) {
  const invalid = () => Object.assign(new Error('Enter a valid membership start date.'), { status: 400 });
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw invalid();
  const start = DateTime.fromISO(startDate, { zone: MEMBERSHIP_ZONE }).startOf('day');
  if (!start.isValid || start.year < 1 || start.toISODate() !== startDate) throw invalid();
  // Calendar month, clamped at month-end; DST is resolved in Aberdeen time.
  return { validFrom: start.toJSDate(), validUntil: start.plus({ months: 1 }).toJSDate() };
}
export const membershipDate = value => DateTime.fromJSDate(new Date(value), { zone: MEMBERSHIP_ZONE }).toISODate();
export const membershipToday = () => DateTime.now().setZone(MEMBERSHIP_ZONE).toISODate();
export function termActive(term, now = new Date()) {
  return !!term && (['active', 'trialing'].includes(term.status) || (term.status === 'canceled' && new Date(term.creditedUntil) > now)) && (!term.validFrom || new Date(term.validFrom) <= now) && new Date(term.validUntil) > now;
}
export function grantActive(grant, now = new Date()) {
  return grant?.enabled === true && (!grant.startsAt || new Date(grant.startsAt) <= now) && (!grant.endsAt || new Date(grant.endsAt) > now);
}
export function reminderPhase(end, now = new Date()) {
  const expires = DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE });
  const today = DateTime.fromJSDate(new Date(now), { zone: MEMBERSHIP_ZONE });
  if (!expires.isValid) return null;
  if (expires <= today) return 'expired';
  return expires.toISODate() === today.plus({ days: 1 }).toISODate() ? 'tomorrow' : null;
}
export const activeTermQuery = (now = new Date()) => ({ $and: [{ $or: [{ status: { $in: ['active', 'trialing'] } }, { status: 'canceled', creditedUntil: { $gt: now } }] }], validUntil: { $gt: now }, $or: [{ validFrom: { $exists: false } }, { validFrom: { $lte: now } }] });
