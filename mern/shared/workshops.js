// Announced workshop. Time and location are intentionally unconfirmed.
export const DEFAULT_WORKSHOP = { title: 'Saturday dog-training workshop', date: '2026-10-03', time: '12:00 PM–2:00 PM', location: 'Wylie Park, Aberdeen, SD', duration: '2 hours', cents: 10000, description: 'Two hours of learning with Bravo. Contact the team for the agenda and to confirm whether to bring your dog.', published: true, revision: 0 };
export function workshopPast(event, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const day = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  return Boolean(event.date && event.date < day);
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Shared by the live component and the public HTML; every stored field is escaped.
export function workshopMarkup(event, compact = false) {
  if (!event) return '<p>Call Bravo for current workshop dates, pricing and location. <a href="tel:+16058242767">Ask about the next session.</a></p>';
  const past = workshopPast(event);
  const facts = [
    ['Date',new Date(`${event.date}T12:00:00Z`).toLocaleDateString('en-US',{ timeZone:'America/Chicago',weekday:'long',month:'long',day:'numeric',year:'numeric' })],
    ...(event.time ? [['Time',`${event.time} · Central`]] : []),
    ...(event.location ? [['Location',event.location]] : []),
    ['Duration',event.duration],
    ['Price',`${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(event.cents/100)} per seat`],
  ];
  const pendingDetails = !event.time || !event.location;
  return `<p class="cinema-eyebrow">${!event.published ? 'PRIVATE DRAFT' : past ? 'PREVIOUS WORKSHOP' : 'NEXT WORKSHOP'}</p><h3>${escapeHtml(event.title)}</h3><dl class="workshop-facts">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${compact ? '' : `<p class="workshop-description">${escapeHtml(event.description)}</p>`}${!compact && pendingDetails && !past ? '<p class="helper">Bravo will confirm the workshop time and location directly before the event.</p>' : ''}<div class="goal-actions"><a class="button${compact ? ' button-ghost' : ''}" href="${compact ? '/workshops' : 'tel:+16058242767'}">${compact ? 'Workshop details →' : past ? 'Ask about the next workshop' : 'Call Bravo about a seat'}</a></div>${compact ? '' : `<p class="helper">${past ? 'This date has passed. Contact Bravo for upcoming dates.' : 'Your seat is confirmed by Bravo directly. This page does not take payment or create a reservation.'}</p>`}`;
}
