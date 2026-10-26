import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { issueLiveNetwork, liveRelayStatus, LIVE_TURN_TTL_SECONDS } from '../server/live-network.js';
const secret = randomBytes(32).toString('hex');
const own = { BRAVO_TURN_URLS: JSON.stringify(['turn:relay.example:3478?transport=udp', 'turns:relay.example:443?transport=tcp']), BRAVO_TURN_SHARED_SECRET: secret };
const cloud = { BRAVO_TURN_KEY_ID: 'fixture-key-id', BRAVO_TURN_API_TOKEN: randomBytes(32).toString('hex') };
const now = Date.parse('2026-10-11T08:00:00Z');

test('unconfigured live networking stays direct and never claims an activated relay', async () => {
  assert.equal(liveRelayStatus({}), 'not-configured');
  const network = await issueLiveNetwork({ env: {}, fetcher: () => { throw new Error('unexpected provider request'); } });
  assert.equal(network.relayConfigured, false); assert.equal(network.expiresAt, null);
  assert.deepEqual(network.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
});
test('coturn credentials are temporary, opaque and derived without disclosing the master secret', async () => {
  const first = await issueLiveNetwork({ env: own, now }), second = await issueLiveNetwork({ env: own, now });
  assert.equal(liveRelayStatus(own), 'configured');
  const relay = first.iceServers[1];
  assert.equal(first.expiresAt, new Date(now + LIVE_TURN_TTL_SECONDS * 1000).toISOString());
  assert.equal(Number(relay.username.split(':')[0]), now / 1000 + LIVE_TURN_TTL_SECONDS);
  assert.equal(relay.credential, createHmac('sha1', secret).update(relay.username).digest('base64'));
  assert.notEqual(second.iceServers[1].username, relay.username);
  assert.ok(!JSON.stringify(first).includes(secret));
});
test('partial, mixed, unsafe and non-TLS production configurations fail clearly instead of downgrading', async () => {
  for (const env of [{ BRAVO_TURN_KEY_ID: 'fixture-key-id' }, { BRAVO_TURN_SHARED_SECRET: secret }, { ...own, ...cloud }, { ...cloud, BRAVO_TURN_KEY_ID: '../escape' }, { ...cloud, BRAVO_TURN_API_TOKEN: 'bad\nheader' }, { ...own, BRAVO_TURN_URLS: 'not-json' }, { ...own, BRAVO_TURN_URLS: JSON.stringify(['https://attacker.example']) }, { ...own, BRAVO_TURN_URLS: JSON.stringify(['turn:relay.example:3478?transport=udp']) }, { ...own, BRAVO_TURN_URLS: JSON.stringify(['turns:relay.example:443?transport=udp']) }, { ...own, BRAVO_TURN_SHARED_SECRET: 'short' }]) {
    assert.equal(liveRelayStatus(env), 'misconfigured');
    await assert.rejects(issueLiveNetwork({ env }), error => error.status === 503 && error.code === 'LIVE_RELAY_CONFIGURATION');
  }
});
test('Cloudflare requests use a fixed HTTPS origin and hand out only short-lived filtered ICE credentials', async () => {
  let called = 0;
  const network = await issueLiveNetwork({ env: cloud, now, fetcher: async (url, options) => {
    called++; assert.equal(url, 'https://rtc.live.cloudflare.com/v1/turn/keys/fixture-key-id/credentials/generate-ice-servers');
    assert.equal(options.headers.Authorization, 'Bearer ' + cloud.BRAVO_TURN_API_TOKEN);
    assert.equal(options.redirect, 'error'); assert.equal(JSON.parse(options.body).ttl, LIVE_TURN_TTL_SECONDS);
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:53'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:attacker.example:3478', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'temporary-user', credential: 'temporary-password', masterToken: 'must-not-pass-through' }] }) };
  } });
  assert.equal(called, 1); assert.equal(network.relayConfigured, true);
  assert.deepEqual(network.iceServers[1].urls, ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp']);
  for (const value of [cloud.BRAVO_TURN_API_TOKEN, 'masterToken', 'attacker.example', ':53']) assert.ok(!JSON.stringify(network).includes(value));
});
test('provider errors, malformed responses and missing TLS fallback are redacted and do not masquerade as success', async () => {
  for (const fetcher of [async () => { throw new Error('Secret provider detail ' + cloud.BRAVO_TURN_API_TOKEN); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ iceServers: null }) }), async () => ({ ok: true, json: async () => ({ iceServers: [{ urls: 'turn:turn.cloudflare.com:3478?transport=udp', username: 'x', credential: 'y' }] }) })]) {
    await assert.rejects(issueLiveNetwork({ env: cloud, fetcher }), error => error.status === 503 && error.code === 'LIVE_RELAY_UNAVAILABLE' && !error.message.includes(cloud.BRAVO_TURN_API_TOKEN));
  }
});
