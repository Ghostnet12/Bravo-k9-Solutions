import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingCalendar } from '../shared/calendar.js';
test('calendar preserves Aberdeen daylight-saving offsets and escapes user text', () => {
  const booking = { _id: 'booking1', status: 'confirmed', dogName: 'Max, Jr;\nNote', address: 'Aberdeen', visits: [{ date: '2026-10-08', time: '09:00', service: 'training' }, { date: '2026-11-09', time: '09:00', service: 'training' }] };
  const text = bookingCalendar(booking);
  assert.match(text, /DTSTART:20261008T140000Z/);
  assert.match(text, /DTSTART:20261109T150000Z/);
  assert.ok(text.includes('Max\\, Jr\\;\\nNote'));
  assert.equal(text.split('BEGIN:VEVENT').length - 1, 2);
  assert.throws(() => bookingCalendar({ ...booking, status: 'requested' }));
  const unicode = bookingCalendar({ ...booking, dogName: '🐕'.repeat(80) });
  for (const line of unicode.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});
