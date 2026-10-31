// Calendar-only helpers: a preview never reserves a time or changes a membership.
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const routineWeekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
export function routineDates(from, to) {
  if (!datePattern.test(from || '') || !datePattern.test(to || '') || from > to) return [];
  const start = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start.toISOString().slice(0, 10) !== from || end.toISOString().slice(0, 10) !== to || (end - start) / 86400000 > 92) return [];
  const result = [];
  for (let current = +start; current <= +end; current += 86400000) result.push(new Date(current).toISOString().slice(0, 10));
  return result;
}
export function previewRoutine({ from, to, pattern, existing = [], canUse, service = 'training' }) {
  const visits = [], conflicts = [], kept = [];
  for (const date of routineDates(from, to)) {
    const time = pattern?.[routineWeekday(date)];
    if (!timePattern.test(time || '')) continue;
    // Never silently replace an existing visit, even when its time differs.
    const saved = existing.filter(visit => visit.date === date && visit.service === service);
    if (saved.length) { kept.push(...saved); continue; }
    const reason = canUse(date, time);
    if (reason === true) visits.push({ date, time, service });
    else conflicts.push({ date, time, reason: typeof reason === 'string' ? reason : 'This time is unavailable.' });
  }
  return { visits, conflicts, kept };
}
export function usualRoutine(visits = []) {
  const training = visits.filter(visit => visit.service === 'training' && !visit.cancelled && datePattern.test(visit.date || '') && timePattern.test(visit.time || '')).sort((a, b) => a.date.localeCompare(b.date));
  if (!training.length) return {};
  const latest = Date.parse(`${training.at(-1).date}T12:00:00Z`), counts = new Map();
  for (const visit of training) {
    if (latest - Date.parse(`${visit.date}T12:00:00Z`) > 35 * 86400000) continue;
    const weekday = routineWeekday(visit.date);
    // Weekends always require an explicit choice; copying never enables them.
    if (weekday === 0 || weekday === 6) continue;
    const day = counts.get(weekday) || new Map();
    const prior = day.get(visit.time);
    day.set(visit.time, { count: (prior?.count || 0) + 1, latest: visit.date }); counts.set(weekday, day);
  }
  return Object.fromEntries([...counts].map(([weekday, times]) => [weekday, [...times].sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest) || a[0].localeCompare(b[0]))[0][0]]));
}
