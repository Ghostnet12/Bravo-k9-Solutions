// Keep availability independent of selection. A second tap removes the visit,
// even if that opening has become unavailable since it was selected.
export function toggleVisit(current, day, service) {
  if (current.some(visit => visit.date === day.date && visit.service === service)) {
    return current.filter(visit => visit.date !== day.date || visit.service !== service);
  }
  const time = day.slots.find(slot => !current.some(visit => visit.date === day.date && visit.time === slot));
  if (!time) return current;
  return [...current, { date: day.date, time, service }].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
