import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toggleVisit } from '../client/src/schedule-selection.js';
const day = { date: '2026-09-15', slots: ['09:00', '10:00'] };
test('tap again removes a selected day without changing availability', () => {
  const selected = toggleVisit([], day, 'training');
  assert.deepEqual(selected, [{ date: day.date, time: '09:00', service: 'training' }]);
  assert.deepEqual(toggleVisit(selected, day, 'training'), []);
  assert.deepEqual(day.slots, ['09:00', '10:00']);
});
test('deselection still works when a selected day has no current openings', () => {
  assert.deepEqual(toggleVisit([{ date: day.date, time: '09:00', service: 'training' }], { ...day, slots: [] }, 'training'), []);
});
test('other services are preserved and same-time collisions are avoided', () => {
  const walking = [{ date: day.date, time: '09:00', service: 'walking' }];
  const both = toggleVisit(walking, day, 'training');
  assert.equal(both[1].time, '10:00'); assert.deepEqual(toggleVisit(both, day, 'training'), walking);
  assert.equal(toggleVisit(both, day, 'aggression'), both);
});
test('manual selection has no four-day cap and never mutates the caller', () => {
  const original = []; let visits = original;
  for (let date = 10; date < 25; date++) visits = toggleVisit(visits, { ...day, date: `2026-09-${date}` }, 'training');
  assert.equal(visits.length, 15); assert.deepEqual(original, []);
});
test('all API requests explicitly bypass the browser HTTP cache', () => {
  assert.match(readFileSync(new URL('../client/src/api.js', import.meta.url), 'utf8'), /cache: 'no-store'/);
});
