/** Date-only membership inputs. End dates are exclusive calendar anniversaries. */
export const MEMBERSHIP_TIME_ZONE = 'America/Chicago';
export function businessDate(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid membership date.');
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: MEMBERSHIP_TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function manualMembershipDates(startDate, now = new Date()) {
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Choose a valid membership start date.');
  const [year, month, day] = startDate.split('-').map(Number);
  if (year < 1900 || year > 9998 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw new Error('Choose a valid membership start date.');
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const endDay = Math.min(day, new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate());
  const endDate = `${endYear}-${String(endMonth).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`;
  return {startDate, endDate, expired: endDate <= businessDate(now)};
}
