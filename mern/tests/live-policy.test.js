import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionState, LIVE_FRESH_MS, LIVE_STALE_MS, isLiveAnnouncement } from '../shared/live-policy.js';
test('live freshness has distinct starting, live, reconnecting and ended states with a 20s bound', () => {
  const now = Date.now(), fresh = { open: true, status: 'live', startedAt: new Date(now - 60000), lastPublishedAt: new Date(now), lastSeenAt: new Date(now) };
  assert.equal(sessionState({ ...fresh, startedAt: null, lastPublishedAt: null }, now), 'starting');
  assert.equal(sessionState(fresh, now), 'live');
  assert.equal(sessionState(fresh, now + LIVE_FRESH_MS), 'reconnecting');
  assert.equal(sessionState(fresh, now + LIVE_STALE_MS), 'ended');
  assert.equal(sessionState({ ...fresh, status: 'reconnecting' }, now), 'reconnecting');
  assert.equal(sessionState({ ...fresh, open: false }, now), 'ended');
  assert.equal(sessionState({ ...fresh, lastSeenAt: new Date(now - LIVE_STALE_MS) }, now), 'ended');
});
test('unconditional live-now notices are removed without removing ordinary training announcements', () => {
  assert.equal(isLiveAnnouncement('Bravo is live now under live cams in menu on upper right-hand corner. Top of website.'), true);
  assert.equal(isLiveAnnouncement('Training live now — watch Bravo'), true);
  assert.equal(isLiveAnnouncement('New Live Cams page available'), false);
  assert.equal(isLiveAnnouncement('We train where you live.'), false);
});
