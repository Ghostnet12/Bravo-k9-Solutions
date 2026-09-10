import { bookingCalendar } from '../../shared/calendar';
export function downloadCalendar(booking) {
  const url = URL.createObjectURL(new Blob([bookingCalendar(booking)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `bravo-visits-${booking._id.slice(-6)}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
