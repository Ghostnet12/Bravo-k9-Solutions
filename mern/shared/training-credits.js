import { DateTime } from 'luxon';
import { MEMBERSHIP_ZONE } from './membership-terms.js';

export const CREDIT_REASONS = Object.freeze({ rain: 'Rain', snow: 'Snow / ice', weather: 'Other unsafe weather', trainer: 'Trainer unavailable', other: 'Other approved reason' });
export function extendCalendarDays(end, days) {
  const value = DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE });
  if (!value.isValid || !Number.isInteger(days) || days < 1 || days > 31) throw Object.assign(new Error('Choose between 1 and 31 calendar days.'), { status: 400 });
  return value.plus({ days }).toJSDate();
}
export function trainingDaysRemaining(end, now = new Date()) {
  return Math.max(0, Math.ceil(DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE }).diff(DateTime.fromJSDate(new Date(now), { zone: MEMBERSHIP_ZONE }), 'days').days));
}
// Stripe is authoritative for billing periods, not for a separately approved
// local make-up extension. Retain credits only for the same original period.
export function retainPeriodCredits(previous, from, until) {
  const same = previous?.creditPeriodStart && new Date(previous.creditPeriodStart).getTime() === new Date(from).getTime();
  if (!same || !previous.creditedDays) return { validUntil: until, creditedDays: 0, creditBaseEnd: null, creditPeriodStart: null };
  const validUntil = DateTime.fromJSDate(new Date(until), { zone: MEMBERSHIP_ZONE }).plus({ days: previous.creditedDays }).toJSDate();
  return { validUntil, creditedDays: previous.creditedDays, creditBaseEnd: until, creditPeriodStart: from };
}
