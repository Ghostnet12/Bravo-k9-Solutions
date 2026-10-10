import { centralDay, workshopDateLabel } from './workshop-schedule.js';
// Announced workshop. Time and location are intentionally unconfirmed.
export const DEFAULT_WORKSHOP = { title: 'Saturday dog-training workshop', date: '2026-10-03', time: '12:00 PM–2:00 PM', location: 'Wylie Park, Aberdeen, SD', duration: '2 hours', cents: 10000, description: 'Two hours of learning with Bravo. Contact the team for the agenda and to confirm whether to bring your dog.', published: true, revision: 0 };
export function workshopPast(event, now = new Date()) { return Boolean(event.date && event.date < centralDay(now)); }

// Keep facts, calls to action and helper text on the same Central-time clock.
export function workshopEnded(event, now = new Date()) {
  if (workshopPast(event, now)) return true;
  if (!event.date || !event.endTime || event.date !== centralDay(now)) return false;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return time >= event.endTime;
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// Shared by the live component and the public HTML; every stored field is escaped.
export function workshopRegistrationLabel(event, now = new Date()) {
  if (!event?.published) return 'Not open — unpublished announcement';
  if (workshopPast(event, now)) return 'Closed — this date has passed';
  if (!event.date) return 'Date to be announced — contact Bravo';
  if (workshopEnded(event, now)) return 'Today’s workshop has ended — ask about the next session';
  return 'Contact Bravo to request a seat';
}
export function workshopMarkup(event, compact = false, now = new Date()) {
  if (!event) return '<p>Call Bravo for current workshop dates, pricing and location. <a href="tel:+16058242767">Ask about the next session.</a></p>';
  const past = workshopEnded(event, now);
  const facts = [
    ...(event.date ? [['Date',workshopDateLabel(event.date)]] : []),
    ...(event.scheduleMode === 'weekly' ? [['Schedule','Every Saturday']] : []),
    ...(event.date && event.time ? [['Time',`${event.time} · Central`]] : []),
    ['Location', event.location || 'Bravo will confirm meeting instructions'],
    ['Duration',event.duration],
    ['Registration', workshopRegistrationLabel(event, now)],
    ['Price',`${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(event.cents/100)} per seat`],
  ];
  const pendingDetails = Boolean(event.date && (!event.time || !event.location));
  return `<p class="cinema-eyebrow">${!event.published ? 'PRIVATE DRAFT' : past ? 'PREVIOUS WORKSHOP' : event.date ? 'NEXT WORKSHOP' : 'WORKSHOP ANNOUNCEMENT'}</p><h3>${escapeHtml(event.title)}</h3><dl class="workshop-facts">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><p class="workshop-description">${escapeHtml(compact && event.description.length > 180 ? event.description.slice(0,177) + '…' : event.description)}</p>${!compact && pendingDetails && !past ? '<p class="helper">Bravo will confirm the workshop time and location directly before the event.</p>' : ''}<div class="goal-actions"><a class="button${compact ? ' button-ghost' : ''}" href="${compact ? '/workshops' : 'tel:+16058242767'}">${compact ? 'Workshop details →' : past ? 'Ask about the next workshop' : 'Call Bravo about a seat'}</a></div>${compact ? '' : `<p class="helper">${past ? (workshopPast(event, now) ? 'This date has passed. Contact Bravo for upcoming dates.' : 'Today’s workshop has ended. Contact Bravo for upcoming dates.') : 'Your seat is confirmed by Bravo directly. This page does not take payment or create a reservation.'}</p>`}`;
}
