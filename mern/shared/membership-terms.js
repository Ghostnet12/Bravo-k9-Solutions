import { DateTime } from 'luxon';
export const MEMBERSHIP_ZONE = 'America/Chicago';
export function monthTerm(start = new Date()) {
  const date = DateTime.fromJSDate(new Date(start), { zone: MEMBERSHIP_ZONE });
  if (!date.isValid) throw new Error('Invalid membership start date.');
  return { validFrom: date.toJSDate(), validUntil: date.plus({ months: 1 }).toJSDate() };
}
export function termActive(term, now = new Date()) {
  return !!term && ['active', 'trialing'].includes(term.status) && (!term.validFrom || new Date(term.validFrom) <= now) && new Date(term.validUntil) > now;
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
export const activeTermQuery = (now = new Date()) => ({ status: { $in: ['active', 'trialing'] }, validUntil: { $gt: now }, $or: [{ validFrom: { $exists: false } }, { validFrom: { $lte: now } }] });
