// Real TURN allocations/media on isolated loopback. No provider, production
// accounts, microphones, or real broadcasts. Direct candidates are forbidden.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium } from 'playwright';
await mkdir('test-results', { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'bravo-relay-'));
const secret = randomBytes(32).toString('hex'), port = 3478;
const config = path.join(temporary, 'turnserver.conf');
await writeFile(config, `listening-ip=127.0.0.1
relay-ip=127.0.0.1
listening-port=${port}
min-port=49200
max-port=49300
realm=bravo-isolated-test
use-auth-secret
static-auth-secret=${secret}
no-cli
no-tls
no-dtls
allow-loopback-peers
no-multicast-peers
no-software-attribute
log-file=stdout
pidfile=${temporary}/turn.pid
`, { mode: 0o600 });
const turn = spawn(process.env.TURN_BINARY || 'turnserver', ['-c', config], { stdio: ['ignore', 'pipe', 'pipe'] });
let turnError, turnLogs = ''; turn.on('error', error => { turnError = error; });
for (const stream of [turn.stdout, turn.stderr]) stream.on('data', data => { turnLogs = (turnLogs + data).slice(-4000); });
let replica, server, browser;
const results = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt++) {
    if (turnError) throw turnError;
    ready = await new Promise(resolve => { const socket = createConnection({ host: '127.0.0.1', port }); socket.setTimeout(100); socket.on('connect', () => { socket.destroy(); resolve(true); }); socket.on('error', () => resolve(false)); socket.on('timeout', () => { socket.destroy(); resolve(false); }); });
    if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'isolated coturn server must be reachable');
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'live_relay_browser', BRAVO_TURN_SHARED_SECRET: secret });
  delete process.env.BRAVO_TURN_KEY_ID; delete process.env.BRAVO_TURN_API_TOKEN; delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, LiveSession, LivePeer } = await import('../server/models.js');
  await connectDb();
  const trainer = await User.create({ name: 'Relay Test Trainer', role: 'owner', passwordHash: 'fixture-only' });
  process.env.OWNER_USER_ID = String(trainer._id);
  const token = randomBytes(32).toString('hex');
  await Session.create({ userId: trainer._id, tokenHash: createHash('sha256').update(token).digest('hex'), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  async function context(publisher) {
    const value = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await value.route('**/*', route => { const req = route.request(), url = new URL(req.url()); return url.origin === origin ? route.continue() : route.abort(); });
    await value.addInitScript(({ publisher }) => {
      window.fixturePeers = []; window.fixtureCameraRequests = 0;
      const Native = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Native {
        constructor(config) { super(config?.iceServers?.length ? { ...config, iceTransportPolicy: 'relay' } : config); window.fixturePeers.push(this); }
      };
      if (!publisher) navigator.mediaDevices.getUserMedia = async () => { window.fixtureCameraRequests++; throw new Error('Viewers do not grant camera permission'); };
    }, { publisher });
    if (publisher) await value.addCookies([{ name: 'bravo_session', value: token, url: origin }]);
    return value;
  }
  for (const protocol of ['udp', 'tcp']) {
    process.env.BRAVO_TURN_URLS = JSON.stringify([`turn:127.0.0.1:${port}?transport=${protocol}`]);
    const publisher = await context(true), guest = await context(false), errors = [];
    const phone = await publisher.newPage(), viewer = await guest.newPage();
    for (const page of [phone, viewer]) { page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message)); }
    try {
      await phone.goto(origin + '/live/studio', { waitUntil: 'domcontentloaded' });
      await phone.getByLabel('Dog’s name').fill('Relay Fixture Dog');
      await phone.getByRole('radio', { name: /PUBLIC LIVE/ }).check();
      await phone.getByRole('checkbox', { name: /I have permission/ }).check();
      await phone.getByRole('button', { name: 'Enable camera preview', exact: true }).click();
      await phone.getByRole('button', { name: '● Start live', exact: true }).click();
      await phone.getByRole('button', { name: '■ End live session', exact: true }).waitFor();
      const record = await LiveSession.findOne({ open: true }); assert.ok(record);
      await viewer.goto(origin + '/live?session=' + record._id, { waitUntil: 'domcontentloaded' });
      await viewer.getByRole('button', { name: /Watch live/ }).click();
      await viewer.waitForFunction(() => { const v = document.querySelector('.live-video-stage video'); return v?.videoWidth > 0 && !v.paused && v.currentTime > 0.5; }, null, { timeout: 45000 });
      const candidate = await viewer.evaluate(async () => {
        const pc = window.fixturePeers.find(peer => peer.connectionState === 'connected'); if (!pc) return null;
        const stats = await pc.getStats(); const transport = [...stats.values()].find(s => s.type === 'transport' && s.selectedCandidatePairId);
        const pair = transport && stats.get(transport.selectedCandidatePairId);
        const local = pair && stats.get(pair.localCandidateId), remote = pair && stats.get(pair.remoteCandidateId);
        return { local: local?.candidateType, remote: remote?.candidateType, protocol: local?.relayProtocol, policy: pc.getConfiguration().iceTransportPolicy };
      });
      assert.deepEqual(candidate, { local: 'relay', remote: 'relay', protocol, policy: 'relay' }, 'the successful connection must actually pass through TURN');
      assert.equal(await viewer.evaluate(() => window.fixtureCameraRequests), 0);
      assert.equal((await guest.cookies()).some(cookie => cookie.name === 'bravo_session'), false);
      await viewer.getByText('Public session — no account or subscription required', { exact: false }).waitFor();
      const before = await viewer.locator('.live-video-stage video').evaluate(v => v.currentTime);
      await viewer.waitForFunction(time => document.querySelector('.live-video-stage video').currentTime > time + 1, before);
      await phone.getByText('1 viewer', { exact: false }).waitFor();
      await phone.getByRole('button', { name: '■ End live session', exact: true }).click();
      await viewer.getByText('This session has ended or requires client access.', { exact: true }).waitFor();
      assert.equal(await LivePeer.countDocuments({ sessionId: record._id }), 0);
      assert.deepEqual(errors, []);
      results.push({ protocol, ...candidate, guest: true, cameraPermissionRequests: 0, advancingVideo: true, cleanup: true });
      console.log('PASS', protocol, 'TURN-only guest watching, native advancing video, no subscription/login/camera request, cleanup');
    } catch (error) { console.log('VIEWER_STATE', await viewer.locator('main').innerText().catch(() => 'unavailable')); throw error; }
    finally { await guest.close(); await publisher.close(); }
  }
  await writeFile('test-results/live-relay-results.json', JSON.stringify({ results, isolated: true, productionBroadcasts: 0 }, null, 2));
} catch (error) { console.log('TURN_DIAGNOSTIC', turnLogs.replaceAll(secret, '[redacted]')); throw error; }
finally {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await replica?.stop();
  turn.kill('SIGTERM'); await Promise.race([once(turn, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]); if (turn.exitCode === null) turn.kill('SIGKILL');
  await rm(temporary, { recursive: true, force: true });
}
