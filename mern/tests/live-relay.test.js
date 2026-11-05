import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { liveConnectionConfig, relayConfiguration, validTurnURL, RELAY_TTL_SECONDS } from '../server/live-relay.js';
const secret = randomBytes(32).toString('hex');
const local = { BRAVO_TURN_PROVIDER: 'coturn', BRAVO_TURN_URLS: 'turn:127.0.0.1:3478?transport=tcp,turns:relay.example.test:443?transport=tcp', BRAVO_TURN_SHARED_SECRET: secret };
const cloud = { BRAVO_TURN_PROVIDER: 'cloudflare', CLOUDFLARE_TURN_KEY_ID: 'fixture-key', CLOUDFLARE_TURN_API_TOKEN: randomBytes(32).toString('hex') };
const answer = { iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'expiring-user', credential: 'expiring-credential' }] };

test('an unconfigured relay retains existing direct connections and reports the limitation', async () => {
  const config = await liveConnectionConfig({ env: {} });
  assert.equal(config.relayConfigured, false); assert.equal(config.iceTransportPolicy, 'all'); assert.equal(config.expiresAt, null);
  assert.deepEqual(config.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
});
test('incomplete or unknown relay setup fails closed without echoing environment secrets', async () => {
  for (const env of [{ BRAVO_TURN_PROVIDER: 'unknown' }, { ...cloud, CLOUDFLARE_TURN_API_TOKEN: '' }, { ...cloud, CLOUDFLARE_TURN_KEY_ID: '../bad' }, { ...local, BRAVO_TURN_SHARED_SECRET: 'short' }, { ...local, BRAVO_TURN_URLS: 'https://relay.example.test' }]) {
    assert.equal(relayConfiguration(env).configured, false);
    await assert.rejects(liveConnectionConfig({ env }), e => e.status === 503 && !e.message.includes(secret));
  }
});
test('TURN URLs are transport-specific and cannot become redirects or executable content', () => {
  for (const url of ['turn:relay.example.test:3478?transport=udp', 'turns:relay.example.test:443?transport=tcp', 'turn:[::1]:3478?transport=tcp']) assert.ok(validTurnURL(url));
  for (const url of ['https://relay.example.test', 'javascript:bad', 'turn:user:pass@relay.example.test:3478', 'turns:relay.example.test:443?transport=udp', 'turn:relay.example.test:99999', 'turn:relay.example.test:0', 'turn:relay.example.test:3478/path', 'turn:relay.example.test:3478\n']) assert.equal(validTurnURL(url), false, url);
});
test('coturn credentials use random per-call identity, HMAC expiry, and never expose the shared secret', async () => {
  const now = Date.now();
  const a = await liveConnectionConfig({ env: local, now }); const b = await liveConnectionConfig({ env: { ...local, BRAVO_LIVE_ICE_POLICY: 'relay' }, now });
  const issued = a.iceServers[1];
  assert.equal(Number(issued.username.split(':')[0]), Math.floor(now / 1000) + RELAY_TTL_SECONDS);
  assert.equal(issued.credential, createHmac('sha1', secret).update(issued.username).digest('base64'));
  assert.notEqual(issued.username, b.iceServers[1].username); assert.equal(b.iceTransportPolicy, 'relay');
  assert.ok(!JSON.stringify(a).includes(secret)); assert.equal(Date.parse(a.expiresAt), now + RELAY_TTL_SECONDS * 1000);
});
test('Cloudflare credentials are minted server-side and retain UDP, TCP and TLS 443 alternatives', async () => {
  let called = 0;
  const config = await liveConnectionConfig({ env: cloud, fetcher: async (url, options) => {
    called++; assert.equal(url, 'https://rtc.live.cloudflare.com/v1/turn/keys/fixture-key/credentials/generate-ice-servers');
    assert.equal(options.headers.Authorization, 'Bearer ' + cloud.CLOUDFLARE_TURN_API_TOKEN);
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error'); assert.equal(JSON.parse(options.body).ttl, RELAY_TTL_SECONDS);
    return { ok: true, json: async () => answer };
  } });
  assert.equal(called, 1); assert.equal(config.relayConfigured, true);
  assert.ok(config.iceServers[1].urls.includes('turns:turn.cloudflare.com:443?transport=tcp'));
  assert.ok(!JSON.stringify(config).includes(cloud.CLOUDFLARE_TURN_API_TOKEN));
});
test('provider errors and invalid ICE responses never become successful relay configuration', async () => {
  for (const value of [null, {}, { iceServers: [{ urls: 'turn:other.example:3478', username: 'u', credential: 'p' }] }, { iceServers: [{ urls: 'turn:turn.cloudflare.com:3478?transport=udp', username: 'u', credential: 'p' }] }]) {
    await assert.rejects(liveConnectionConfig({ env: cloud, fetcher: async () => ({ ok: true, json: async () => value }) }), e => e.status === 503);
  }
  await assert.rejects(liveConnectionConfig({ env: cloud, fetcher: async () => { throw new Error(secret); } }), e => e.status === 503 && !e.message.includes(secret));
});
