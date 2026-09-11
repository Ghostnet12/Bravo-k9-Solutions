import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleVisitSelection, chatScope } from '../shared/selection-state.js';
import { api } from '../client/src/api.js';

test('a second date tap removes its visit even if availability has since disappeared', () => {
  const day = { date: '2026-10-01', slots: ['09:00', '10:00'] };
  const selected = toggleVisitSelection([], day, 'training');
  assert.equal(selected.length, 1);
  assert.deepEqual(toggleVisitSelection(selected, { ...day, slots: [] }, 'training'), []);
});
test('manual selections are not capped at four and never collide with another service', () => {
  let visits = [];
  for (let index = 1; index <= 8; index++) visits = toggleVisitSelection(visits, { date: `2026-10-${String(index).padStart(2, '0')}`, slots: ['09:00'] }, 'training');
  assert.equal(visits.length, 8);
  const day = { date: '2026-10-01', slots: ['09:00', '10:00'] };
  visits = toggleVisitSelection(visits, day, 'walking');
  assert.equal(visits.find(visit => visit.service === 'walking').time, '10:00');
  visits = toggleVisitSelection(visits, day, 'training');
  assert.equal(visits.filter(visit => visit.date === day.date).length, 1);
  assert.equal(visits.find(visit => visit.date === day.date).service, 'walking');
});
test('chat clear targets only the selected conversation', () => {
  assert.deepEqual(chatScope('/community'), { scope: 'room' });
  assert.deepEqual(chatScope('/direct'), { scope: 'direct' });
  assert.deepEqual(chatScope('/direct?memberId=aaaaaaaaaaaaaaaaaaaaaaaa'), { scope: 'direct', targetId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.deepEqual(chatScope('/groups/bbbbbbbbbbbbbbbbbbbbbbbb/messages'), { scope: 'group', targetId: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.throws(() => chatScope('/admin'), /Choose a conversation/);
});
test('API refreshes bypass browser cache without changing session credentials', async () => {
  const original = globalThis.fetch;
  let options;
  globalThis.fetch = async (_url, input) => { options = input; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  try { await api('/community'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin'); }
  finally { globalThis.fetch = original; }
});
