import { DateTime } from 'luxon';
import { personalHours } from '../shared/trainer-schedule.js';
import { serviceSelection } from '../shared/catalog.js';
export const ZONE = 'America/Chicago';
export const HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 9).padStart(2, '0')}:00`);
export const DEFAULT_SCHEDULE = { weekdays: [1, 2, 3, 4, 5], hours: HOURS, enabled: false };
export function dateTime(date, time = '12:00') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Enter a valid date and time.');
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: ZONE });
  if (!dt.isValid || dt.toISODate() !== date || dt.toFormat('HH:mm') !== time) throw new Error('Enter a valid local date and time.');
  return dt;
}
export function dateRange(from, to) {
  let cursor = dateTime(from).startOf('day');
  const end = dateTime(to).startOf('day');
  if (end < cursor || end.diff(cursor, 'days').days > 92) throw new Error('Choose a date range of up to 93 days.');
  const dates = [];
  while (cursor <= end) { dates.push(cursor.toISODate()); cursor = cursor.plus({ days: 1 }); }
  return dates;
}
export function availability({ from, to, settings = DEFAULT_SCHEDULE, occupied = [], now = DateTime.now() }) {
  const blocked = new Set(occupied);
  return dateRange(from, to).map(date => ({ date, slots: personalHours(date, settings)
    .filter(time => dateTime(date, time) > now && !blocked.has(`${date}|${time}`)) }));
}
export function autoSchedule(days, { count, startDate, startTime = '09:00', endDate, endTime = '21:00', preference = 'any', service = 'training' }) {
  if (!Number.isInteger(count) || count < 1 || count > 31) throw new Error('Choose 1–31 appointments.');
  const start = dateTime(startDate, startTime), end = dateTime(endDate, endTime);
  if (end < start) throw new Error('Return must be after the first arrival.');
  const candidates = days.map(day => ({ ...day, slots: day.slots.filter(time => dateTime(day.date, time) >= start && dateTime(day.date, time) <= end) })).filter(day => day.slots.length);
  if (candidates.length < count) throw new Error(`Only ${candidates.length} days have openings in this window. No partial schedule was selected; change the window or contact Bravo.`);
  const chosen = candidates.slice(0, count);
  if (count > 1 && candidates.at(-1).date === endDate && !chosen.some(d => d.date === endDate)) chosen[count - 1] = candidates.at(-1);
  const result = chosen.map(day => ({ date: day.date, service, time: day.slots.find(time => {
    const hour = Number(time.slice(0, 2));
    return preference === 'any' || (preference === 'morning' && hour < 12) || (preference === 'afternoon' && hour >= 12 && hour < 17) || (preference === 'evening' && hour >= 17);
  }) || day.slots[0] }));
  const uncoveredDates = dateRange(startDate, endDate).filter(date => !result.some(v => v.date === date));
  return { visits: result, uncoveredDates, boundaryWarning: !result.some(v => v.date === startDate) || !result.some(v => v.date === endDate) };
}
export function validateVisits(ids, visits, catalog) {
  const included = new Set(serviceSelection(ids, catalog).flatMap(s => s.includes));
  if (!Array.isArray(visits) || visits.length > 62) throw new Error('Choose up to 62 visits.');
  for (const visit of visits) {
    if (!included.has(visit.service) || visit.service === 'online' || !HOURS.includes(visit.time)) throw new Error('Visit does not match your selected programs or hours.');
    dateTime(visit.date, visit.time);
  }
  const keys = visits.map(v => `${v.date}|${v.time}`);
  if (new Set(keys).size !== keys.length) throw new Error('Two visits cannot use the same time slot.');
  for (const service of included) if (service !== 'online' && !visits.some(v => v.service === service)) throw new Error(`Choose at least one ${service} visit.`);
}
