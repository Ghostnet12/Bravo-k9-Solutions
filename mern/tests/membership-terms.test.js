import test from 'node:test';
import assert from 'node:assert/strict';
import { monthTerm, termActive, reminderPhase } from '../shared/membership-terms.js';
test('calendar months clamp month end and preserve local time across DST', () => {
  const january = monthTerm(new Date('2027-01-31T16:00:00Z'));
  assert.equal(january.validUntil.toISOString(), '2027-02-28T16:00:00.000Z');
  const february = monthTerm(new Date('2027-02-20T16:00:00Z'));
  assert.equal(february.validUntil.toISOString(), '2027-03-20T15:00:00.000Z');
});
test('expiry is exclusive and future paid terms do not grant access early', () => {
  const term = { status: 'active', ...monthTerm(new Date('2026-09-12T16:00:00Z')) };
  assert.equal(termActive(term, new Date('2026-09-12T15:59:59Z')), false);
  assert.equal(termActive(term, term.validFrom), true);
  assert.equal(termActive(term, term.validUntil), false);
});
test('reminders use tomorrow in Aberdeen, not the UTC date', () => {
  assert.equal(reminderPhase('2026-10-02T01:00:00Z', new Date('2026-10-01T01:00:00Z')), 'tomorrow');
  assert.equal(reminderPhase('2026-10-02T01:00:00Z', new Date('2026-10-02T01:00:00Z')), 'expired');
  assert.equal(reminderPhase('2026-10-02T01:00:00Z', new Date('2026-09-30T01:00:00Z')), null);
});
