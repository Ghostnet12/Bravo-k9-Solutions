import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJournal, encodeJournal, journalSummary, navigationPolicy, parseServices, portalUrl, publicLiveSessions, validateEntry } from '../src/domain.ts';

const entry = { id: 'sample-1', dog: 'Gunner', focus: 'Recall', minutes: 15, note: 'Worked in a quiet field.', createdAt: '2026-10-20T03:00:00.000Z' };
test('website session boundary rejects lookalike hosts and executable schemes', () => {
  assert.equal(navigationPolicy('https://bravounleashed.com/account'), 'internal');
  assert.equal(navigationPolicy('https://bravounleashed.com.evil.example/account'), 'external');
  assert.equal(navigationPolicy('https://bravounleashed.com@evil.example'), 'blocked');
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'http://bravounleashed.com', 'intent://app', 'tel:9001234567']) assert.equal(navigationPolicy(value), 'blocked');
  assert.equal(navigationPolicy('tel:+16058242767'), 'contact');
});
test('portal URLs cannot escape the Bravo origin', () => {
  assert.equal(portalUrl('/portal?program=training'), 'https://bravounleashed.com/portal?program=training');
  assert.throws(() => portalUrl('//evil.example/account'));
  assert.throws(() => portalUrl('https://user@bravounleashed.com'));
});
test('disconnected fallback prices are never presented as current', () => {
  assert.throws(() => parseServices({ connected: false, services: [{ id: 'training', cents: 20000 }] }));
  assert.throws(() => parseServices('<html>Service unavailable</html>'));
});
test('disabled or malformed prices are excluded', () => {
  const base = { id: 'training', name: 'Training', description: 'Training plan', interval: 'month', cents: 24500, enabled: true };
  assert.deepEqual(parseServices({ connected: true, services: [base, { ...base, enabled: false }, { ...base, cents: -5 }, { ...base, cents: '20000' }] }), [base]);
});
test('expired, private, or reconnecting streams never display live', () => {
  const base = { id: 'stream', trainerName: 'Bravo trainer', dogName: 'Gunner', audience: 'public', status: 'live', liveUntil: '2026-10-20T03:01:00Z' };
  const data = { availability: 'available', serverTime: '2026-10-20T03:00:00Z', sessions: [base, { ...base, audience: 'client' }, { ...base, status: 'reconnecting' }, { ...base, liveUntil: '2026-10-20T02:59:59Z' }] };
  assert.deepEqual(publicLiveSessions(data), [base]);
  assert.throws(() => publicLiveSessions({ availability: 'unavailable', sessions: [] }));
});
test('journal survives serialization with unicode and multiline notes', () => {
  const value = { ...entry, dog: ' Zoë ', note: 'Recall ✓\nA calm finish.' };
  assert.deepEqual(decodeJournal(encodeJournal([value])), [{ ...value, dog: 'Zoë' }]);
  assert.deepEqual(decodeJournal(null), []);
});
test('corrupt or future-schema journals fail closed rather than resetting data', () => {
  assert.throws(() => decodeJournal('{broken'));
  assert.throws(() => decodeJournal('{"version":2,"entries":[]}'));
  assert.throws(() => decodeJournal(JSON.stringify({ version: 1, entries: [{ ...entry, minutes: -10 }] })));
});
test('practice inputs reject missing dog and impossible durations', () => {
  for (const minutes of [0, -1, 1.5, 241, NaN]) assert.throws(() => validateEntry({ ...entry, minutes }));
  assert.throws(() => validateEntry({ ...entry, dog: '  ' }));
  assert.throws(() => validateEntry({ ...entry, note: 'x'.repeat(2001) }));
});
test('weekly totals exclude old and future entries', () => {
  const now = Date.parse('2026-10-20T03:00:00Z');
  assert.deepEqual(journalSummary([entry, { ...entry, createdAt: '2026-10-01T00:00:00Z' }, { ...entry, createdAt: '2026-10-22T00:00:00Z' }], now), { sessions: 1, minutes: 15 });
});
