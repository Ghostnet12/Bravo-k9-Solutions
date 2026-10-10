import test from 'node:test';
import assert from 'node:assert/strict';
import { currentTrainingTerm } from '../shared/customer-journey.js';
import { termActive } from '../shared/membership-terms.js';
import { liveConnectionState, livePlayerStatus } from '../shared/live-presentation.js';
import { DEFAULT_WORKSHOP, workshopEnded, workshopMarkup } from '../shared/workshops.js';
const now = new Date('2026-10-10T19:00:00Z');
const term = { serviceIds: ['training'], status: 'active', validFrom: '2026-10-01T05:00:00Z', validUntil: '2026-11-01T05:00:00Z' };

test('overview uses the same cancellation/credited-access rule as scheduling', () => {
  for (const variant of [term, { ...term, status: 'trialing' }, { ...term, status: 'canceled' }, { ...term, status: 'canceled', creditedUntil: '2026-10-09T05:00:00Z' }, { ...term, status: 'canceled', creditedUntil: '2026-10-20T05:00:00Z' }, { ...term, validFrom: '2026-10-12T05:00:00Z' }, { ...term, validUntil: '2026-10-09T05:00:00Z' }]) {
    assert.equal(Boolean(currentTrainingTerm([variant], now.getTime())), termActive(variant, now), JSON.stringify(variant));
  }
});
test('overview supports legacy starts without inventing dates and ignores unrelated services', () => {
  assert.ok(currentTrainingTerm([{ ...term, validFrom: undefined }], now.getTime()));
  assert.equal(currentTrainingTerm([{ ...term, serviceIds: ['online'] }], now.getTime()), null);
});
test('successful transport polling cannot erase autoplay recovery or invent playback', () => {
  let state = 'blocked';
  for (let poll = 0; poll < 5; poll++) state = liveConnectionState(state, 'watching');
  assert.equal(state, 'blocked');
  assert.equal(livePlayerStatus('live', state), 'Tap to play');
  assert.equal(liveConnectionState('connecting', 'watching'), 'waiting');
  assert.equal(liveConnectionState('waiting', 'watching'), 'waiting');
  assert.equal(liveConnectionState('watching', 'watching'), 'watching');
  assert.equal(liveConnectionState('blocked', 'ended'), 'ended');
});
test('a workshop closing today changes facts, heading, action and helper together', () => {
  const event = { ...DEFAULT_WORKSHOP, date: '2026-10-10', startTime: '12:00', endTime: '14:00' };
  const before = new Date('2026-10-10T18:59:00Z');
  assert.equal(workshopEnded(event, before), false);
  assert.match(workshopMarkup(event, false, before), /Call Bravo about a seat/);
  for (const date of [now, new Date('2026-10-10T20:00:00Z')]) {
    assert.equal(workshopEnded(event, date), true);
    const html = workshopMarkup(event, false, date);
    assert.match(html, /PREVIOUS WORKSHOP/);
    assert.match(html, /Today’s workshop has ended/);
    assert.match(html, /Ask about the next workshop/);
    assert.doesNotMatch(html, /Call Bravo about a seat|Your seat is confirmed/);
  }
});
test('no-date announcements and later workshops do not inherit today’s closed state', () => {
  assert.equal(workshopEnded({ ...DEFAULT_WORKSHOP, date: null, endTime: '14:00' }, now), false);
  assert.equal(workshopEnded({ ...DEFAULT_WORKSHOP, date: '2026-10-17', endTime: '14:00' }, now), false);
});
