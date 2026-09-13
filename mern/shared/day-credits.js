import { DateTime } from 'luxon';
import { ALL_SERVICES } from './catalog.js';
import { MEMBERSHIP_ZONE } from './membership-terms.js';

export const CREDIT_REASONS = ['Rain', 'Snow', 'Trainer unavailable', 'Other'];
export const trainingServiceIds = ALL_SERVICES.filter(service => service.includes.includes('training')).map(service => service.id);
export const isTrainingTerm = term => term.serviceIds?.some(id => trainingServiceIds.includes(id));
export const creditableTerm = term => isTrainingTerm(term) && ['active', 'trialing', 'canceled'].includes(term.status)
  && !!term.validFrom && new Date(term.validUntil) > new Date(term.validFrom)
  && (!term.stripeId?.startsWith('sub_') || term.autoPayDisabled === true);
export function creditedEnd(end, days) {
  const date = DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE });
  if (!date.isValid || !Number.isInteger(days) || days < 1 || days > 31) throw new Error('Choose 1 to 31 whole days to credit.');
  return date.plus({ days }).toJSDate();
}
export const remainingDays = (end, now = new Date()) => Math.max(0, Math.ceil(
  DateTime.fromJSDate(new Date(end), { zone: MEMBERSHIP_ZONE }).diff(DateTime.fromJSDate(new Date(now), { zone: MEMBERSHIP_ZONE }), 'days').days
));
