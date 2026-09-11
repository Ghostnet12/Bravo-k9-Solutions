// Pure calendar transitions: availability and selection are separate state.
export function toggleVisitSelection(visits, day, service) {
  const selected = visits.some(visit => visit.date === day.date && visit.service === service);
  if (selected) return visits.filter(visit => visit.date !== day.date || visit.service !== service);
  const time = day.slots.find(slot => !visits.some(visit => visit.date === day.date && visit.time === slot));
  if (!time) return visits;
  return [...visits, { date: day.date, time, service }].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
export function chatScope(path) {
  if (path === '/community') return { scope: 'room' };
  const [pathname, query = ''] = path.split('?');
  if (pathname === '/direct') {
    const targetId = new URLSearchParams(query).get('memberId');
    return { scope: 'direct', ...(targetId ? { targetId } : {}) };
  }
  const group = /^\/groups\/([a-f\d]{24})\/messages$/i.exec(pathname);
  if (group) return { scope: 'group', targetId: group[1] };
  throw new Error('Choose a conversation before clearing history.');
}
