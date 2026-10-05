export const WORKSHOP_ZONE = 'America/Chicago';
export const WORKSHOP_MODES = ['specific', 'weekly', 'none'];
export function centralDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: WORKSHOP_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function validWorkshopDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}
export function addWorkshopDays(date, count) {
  const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + count); return day.toISOString().slice(0, 10);
}
export function saturdayDate(now = new Date()) {
  const day = centralDay(now), weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addWorkshopDays(day, (6 - weekday + 7) % 7);
}
export function workshopDateLabel(date) {
  return validWorkshopDate(date) ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: WORKSHOP_ZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
}
export function workshopTimeLabel(start, end) {
  if (!start || !end) return '';
  const format = time => new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  return `${format(start)}–${format(end)}`;
}
export function resolveWorkshop(details, now = new Date()) {
  const scheduleMode = details.scheduleMode || 'specific';
  const date = scheduleMode === 'weekly' ? saturdayDate(now) : scheduleMode === 'none' ? null : details.date;
  return { ...details, scheduleMode, date, time: date ? workshopTimeLabel(details.startTime, details.endTime) || details.time || '' : '',
    occurrenceId: date ? `featured:${date}` : null, nextDate: scheduleMode === 'weekly' ? addWorkshopDays(date, 7) : null };
}
