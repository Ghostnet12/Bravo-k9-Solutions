import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { extendCalendarDays, trainingDaysRemaining, retainPeriodCredits } from '../shared/training-credits.js';
const at = iso => DateTime.fromISO(iso, { zone: 'America/Chicago' }).toJSDate();
test('one credited day changes six remaining calendar days to seven', () => {
  const now = at('2026-09-13T10:00'), end = at('2026-09-19T10:00');
  assert.equal(trainingDaysRemaining(end, now), 6);
  assert.equal(trainingDaysRemaining(extendCalendarDays(end, 1), now), 7);
});
test('calendar days preserve local end time through spring and fall DST and month ends', () => {
  for (const [start, expected, hours] of [['2026-03-07T10:00','2026-03-08T10:00',23],['2026-10-31T10:00','2026-11-01T10:00',25],['2026-12-31T10:00','2027-01-01T10:00',24]]) {
    const end = extendCalendarDays(at(start), 1);
    assert.equal(end.getTime(), at(expected).getTime()); assert.equal((end - at(start))/3600000, hours);
  }
});
test('invalid and negative credit lengths are rejected', () => {
  for (const n of [-1,0,1.5,32,NaN]) assert.throws(() => extendCalendarDays(new Date(), n));
  assert.throws(() => extendCalendarDays('bad-date', 1));
});
test('same-period Stripe updates preserve make-up days; new periods do not duplicate credits', () => {
  const from = at('2026-09-01'), until = at('2026-10-01'), previous = { creditPeriodStart: from, creditedDays: 2 };
  assert.equal(retainPeriodCredits(previous, from, until).validUntil.getTime(), at('2026-10-03').getTime());
  assert.equal(retainPeriodCredits(previous, until, at('2026-11-01')).creditedDays, 0);
});
