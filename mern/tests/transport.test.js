import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { transportLocationState, transportMapUrl } from '../shared/transport.js';
import { verifyGpsSignature, gpsInput } from '../server/transport-portal.js';

test('location freshness uses observation time, and closed/paused trips never appear live', () => {
  const now = Date.now(), trip = { status: 'in_transit', sharingEnabled: true, location: { observedAt: new Date(now - 1000).toISOString() } };
  assert.equal(transportLocationState(trip, now), 'live');
  assert.equal(transportLocationState(trip, now + 120000), 'stale');
  assert.equal(transportLocationState({ ...trip, sharingEnabled: false }, now), 'paused');
  assert.equal(transportLocationState({ ...trip, status: 'delivered' }, now), 'ended');
  assert.equal(transportLocationState({ ...trip, status: 'scheduled' }, now), 'paused');
  assert.equal(transportLocationState({ ...trip, location: null }, now), 'waiting');
  assert.equal(transportLocationState({ ...trip, location: { observedAt: new Date(now + 1000) } }, now), 'stale');
});
test('map addresses accept only bounded numeric coordinates', () => {
  assert.equal(transportMapUrl({ latitude: 'javascript:alert(1)', longitude: 0 }), null);
  assert.equal(transportMapUrl({ latitude: 91, longitude: 0 }), null);
  assert.equal(transportMapUrl({ latitude: NaN, longitude: 0 }), null);
  const url = new URL(transportMapUrl({ latitude: 45.46, longitude: -98.48 }));
  assert.equal(url.origin, 'https://www.openstreetmap.org');
  assert.equal(url.searchParams.get('marker'), '45.46,-98.48');
});
test('GPS signatures bind exact bytes and timestamp; missing, stale, modified and weak signatures fail', () => {
  const now = Date.now(), timestamp = String(Math.floor(now / 1000)), secret = 'test-secret-'.repeat(4), body = Buffer.from('{"deviceId":"test"}');
  const signature = createHmac('sha256', secret).update(timestamp + '.').update(body).digest('hex');
  assert.equal(verifyGpsSignature(body, timestamp, signature, secret, now), true);
  assert.equal(verifyGpsSignature(Buffer.from('{}'), timestamp, signature, secret, now), false);
  assert.equal(verifyGpsSignature(body, timestamp, signature, secret, now + 301000), false);
  assert.equal(verifyGpsSignature(body, timestamp, 'x', secret, now), false);
  assert.equal(verifyGpsSignature(body, timestamp, signature, 'short', now), false);
  assert.equal(verifyGpsSignature(body, timestamp, signature, undefined, now), false);
  assert.equal(gpsInput.safeParse({ deviceId: 'test', latitude: 91, longitude: 0, observedAt: new Date().toISOString() }).success, false);
});
