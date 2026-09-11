// A trainer's working schedule is distinct from appointment occupancy.
export const TRAINER_HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 9).padStart(2, '0')}:00`);
export const TRAINER_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export function personalHours(date, schedule) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!schedule?.enabled || weekday < 1 || weekday > 5) return [];
  const override = schedule.overrides?.find(day => day.date === date);
  const hours = override ? override.hours : schedule.weekdays.includes(weekday) ? schedule.hours : [];
  return [...new Set(hours)].filter(time => TRAINER_HOURS.includes(time)).sort();
}
export function workingHours(date, personal, team) {
  const limits = personalHours(date, { ...team, overrides: [] });
  if (!personal) return limits;
  const own = new Set(personalHours(date, personal));
  return limits.filter(time => own.has(time));
}
export function restrictTrainerDays(days, personal, team) {
  return days.map(day => { const hours = new Set(workingHours(day.date, personal, team)); return { ...day, slots: day.slots.filter(time => hours.has(time)) }; });
}
export function startTimeLabel(time) {
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
}
export function startTimeRanges(hours) {
  if (!hours.length) return 'Off';
  const groups = [];
  for (const time of [...new Set(hours)].sort()) {
    const current = groups.at(-1);
    if (current && Number(time.slice(0, 2)) === Number(current.at(-1).slice(0, 2)) + 1) current.push(time);
    else groups.push([time]);
  }
  return groups.map(group => group.length === 1 ? startTimeLabel(group[0]) : `${startTimeLabel(group[0])}–${startTimeLabel(group.at(-1))}`).join(' · ');
}
