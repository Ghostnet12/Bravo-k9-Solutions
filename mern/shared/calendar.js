import { DateTime } from 'luxon';
const escapeText = value => String(value || '').replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '').replaceAll(';', '\\;').replaceAll(',', '\\,');
const stamp = date => date.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
// Fold by UTF-8 octets, without splitting a Unicode character (RFC 5545).
function fold(line) {
  let output = '', row = '', bytes = 0;
  for (const c of line) {
    const size = new TextEncoder().encode(c).length;
    if (bytes + size > 75) { output += row + '\r\n'; row = ' '; bytes = 1; }
    row += c; bytes += size;
  }
  return output + row;
}
export function bookingCalendar(booking, now = DateTime.utc()) {
  if (booking.status !== 'confirmed') throw new Error('Only confirmed visits can be added to a calendar.');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bravo K9 Solutions//Visits//EN', 'CALSCALE:GREGORIAN'];
  for (const visit of booking.visits) {
    const start = DateTime.fromISO(`${visit.date}T${visit.time}`, { zone: 'America/Chicago' });
    if (!start.isValid) throw new Error('Invalid appointment date.');
    lines.push('BEGIN:VEVENT', `UID:${escapeText(booking._id)}-${visit.date}-${visit.time.replace(':', '')}@bravo-k9`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `SUMMARY:${escapeText(`Bravo K9: ${visit.service} for ${booking.dogName}`)}`, `LOCATION:${escapeText(booking.address)}`, 'DESCRIPTION:Confirmed Bravo visit. Call (605) 824-2767 for changes. This calendar entry does not update automatically.', 'STATUS:CONFIRMED', 'END:VEVENT');
  }
  return lines.map(fold).join('\r\n') + '\r\n';
}
