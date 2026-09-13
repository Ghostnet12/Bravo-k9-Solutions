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
