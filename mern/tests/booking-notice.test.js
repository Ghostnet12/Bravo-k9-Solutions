import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingRequestNotice } from '../shared/booking-notice.js';

test('one visit receives the correct appointment-request confirmation', () => {
  assert.equal(bookingRequestNotice({ serviceIds: ['training'], visits: [{ date: '2026-10-19', time: '10:00' }] }), 'Your appointment request has been submitted. Bravo will confirm your selected date and time. No card has been charged.');
});

test('multiple selected visits do not imply only one appointment', () => {
  assert.equal(bookingRequestNotice({ serviceIds: ['training'], visits: [{ date: '2026-10-19' }, { date: '2026-10-20' }, { date: '2026-10-21' }] }), 'Your request for 3 visits has been submitted. Bravo will confirm your requested dates and times. No card has been charged.');
});

test('online-only enrollment does not imply an appointment', () => {
  assert.equal(bookingRequestNotice({ serviceIds: ['online'], visits: [] }), 'Your online training request has been submitted. No appointment was scheduled. No card has been charged.');
});

test('empty and malformed visit lists never claim an appointment', () => {
  const notice = bookingRequestNotice({ serviceIds: ['walking'], visits: null });
  assert.equal(notice, 'Your request has been submitted without scheduled visits. Bravo will review the details. No card has been charged.');
  assert.equal(bookingRequestNotice(), notice);
});
