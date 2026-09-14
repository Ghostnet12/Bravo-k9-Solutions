import test from 'node:test';
import assert from 'node:assert/strict';
import { creditedEnd, remainingDays, creditableTerm } from '../shared/day-credits.js';
import { termActive } from '../shared/membership-terms.js';

test('credits add calendar days across DST and year boundaries without changing local time', () => {
  assert.equal(creditedEnd('2026-03-08T06:00:00Z', 1).toISOString(), '2026-03-09T05:00:00.000Z');
  assert.equal(creditedEnd('2026-11-01T05:00:00Z', 1).toISOString(), '2026-11-02T06:00:00.000Z');
  assert.equal(creditedEnd('2026-12-31T16:00:00Z', 2).toISOString(), '2027-01-02T16:00:00.000Z');
  const now = new Date('2026-03-02T06:00:00Z'), end = '2026-03-08T06:00:00Z';
  assert.equal(remainingDays(end, now), 6); assert.equal(remainingDays(creditedEnd(end, 1), now), 7);
  assert.equal(remainingDays('2026-01-01', now), 0);
  for (const value of [0, -1, 1.5, 32, NaN]) assert.throws(() => creditedEnd(end, value));
});

test('only dated training terms with protected paid status are creditable', () => {
  const term = { stripeId: 'manual:fixture', serviceIds: ['training'], status: 'active', validFrom: '2026-09-01', validUntil: '2026-10-01' };
  assert.equal(creditableTerm(term), true);
  for (const status of ['refunded', 'revoked', 'past_due', 'unpaid']) assert.equal(creditableTerm({ ...term, status }), false);
  assert.equal(creditableTerm({ ...term, serviceIds: ['online'] }), false);
  assert.equal(creditableTerm({ ...term, stripeId: 'sub_fixture' }), false);
  assert.equal(creditableTerm({ ...term, stripeId: 'sub_fixture', autoPayDisabled: true }), true);
  assert.equal(creditableTerm({ ...term, validUntil: '2026-08-01' }), false);
  assert.equal(termActive({ ...term, status: 'canceled', creditedUntil: '2026-10-01' }, new Date('2026-09-15')), true);
  assert.equal(termActive({ ...term, status: 'canceled' }, new Date('2026-09-15')), false);
});

test('calendar highlights five new dates after a last covered day of the 10th', async () => {
  const { creditedCalendarDates, lastCoveredDay } = await import('../shared/day-credits.js');
  const term = { stripeId: 'training', serviceIds: ['training'], status: 'active', validFrom: '2026-08-11T05:00:00Z', validUntil: '2026-09-16T05:00:00Z' };
  const credit = { termId: term.stripeId, beforeEnd: '2026-09-11T05:00:00Z', afterEnd: term.validUntil, days: 5 };
  assert.equal(lastCoveredDay(credit.beforeEnd), '2026-09-10');
  assert.equal(lastCoveredDay(term.validUntil), '2026-09-15');
  assert.deepEqual(creditedCalendarDates([term], [credit]), ['2026-09-11','2026-09-12','2026-09-13','2026-09-14','2026-09-15']);
  assert.deepEqual(creditedCalendarDates([term], [credit, credit]), creditedCalendarDates([term], [credit]));
  assert.deepEqual(creditedCalendarDates([{ ...term, status: 'refunded' }], [credit]), []);
  assert.deepEqual(creditedCalendarDates([term], [{ ...credit, termId: 'other' }]), []);
  assert.deepEqual(creditedCalendarDates([{ ...term, validUntil: '2026-09-13T05:00:00Z' }], [credit]), ['2026-09-11','2026-09-12']);
});

test('credited dates cross months and DST with no extra day at the exclusive cutoff', async () => {
  const { creditedCalendarDates } = await import('../shared/day-credits.js');
  for (const [beforeEnd, days, expected] of [
    ['2026-10-01T05:00:00Z', 5, ['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05']],
    ['2026-11-01T05:00:00Z', 2, ['2026-11-01','2026-11-02']],
    ['2026-12-31T16:00:00Z', 2, ['2027-01-01','2027-01-02']],
  ]) {
    const afterEnd = creditedEnd(beforeEnd, days).toISOString();
    const term = { stripeId: 'term', serviceIds: ['training'], status: 'active', validFrom: '2026-01-01T06:00:00Z', validUntil: afterEnd };
    assert.deepEqual(creditedCalendarDates([term], [{ termId: 'term', beforeEnd, afterEnd, days }]), expected);
  }
});

test('calendar credit resolves the selected request and date without guessing another membership', async () => {
  const { termForDayCredit } = await import('../shared/day-credits.js');
  const term = { stripeId: 'manual:first', bookingId: 'request', serviceIds: ['training'], status: 'active', validFrom: '2026-09-01T05:00:00Z', validUntil: '2026-10-01T05:00:00Z' };
  const booking = { _id: 'request', termStartsAt: term.validFrom, termEndsAt: term.validUntil };
  const other = { ...term, stripeId: 'manual:other', bookingId: 'other' };
  assert.equal(termForDayCredit([other,term], booking, '2026-09-14'), term);
  assert.equal(termForDayCredit([term], booking, '2026-08-31'), null);
  assert.equal(termForDayCredit([term], booking, '2026-10-01'), null);
  assert.equal(termForDayCredit([term], booking, '2026-09-31'), null);
  assert.equal(termForDayCredit([{ ...term, status: 'refunded' }], booking, '2026-09-14'), null);
  const legacy = { _id: 'old-request' };
  assert.equal(termForDayCredit([term], legacy, '2026-09-14'), term);
  assert.equal(termForDayCredit([term,other], legacy, '2026-09-14'), null);
  assert.equal(termForDayCredit([term], { ...booking, _id: 'exact-period' }, '2026-09-14'), term);
  assert.equal(termForDayCredit([term,other], { ...booking, _id: 'exact-period' }, '2026-09-14'), null);
  assert.equal(termForDayCredit([term], { ...booking, _id: 'different-period', termEndsAt: '2026-09-20' }, '2026-09-14'), null);
});
