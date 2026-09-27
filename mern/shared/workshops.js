// Announced workshop. Time and location are intentionally unconfirmed.
export const DEFAULT_WORKSHOP = { title: 'Saturday dog-training workshop', date: '2026-10-03', time: '', location: '', duration: '2 hours', cents: 10000, description: 'Two hours of learning with Bravo. Contact the team for the agenda and to confirm whether to bring your dog.', published: true, revision: 0 };
export function workshopPast(event, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const day = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  return Boolean(event.date && event.date < day);
}
