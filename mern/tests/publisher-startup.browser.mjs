// Actual browser encode/decode output. Only HTTP/session data is synthetic.
// No real user sessions, microphones, billing, camera uploads or broadcasts.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
const app = express(), dist = path.resolve('client/dist');
let handleApi = (_req, res) => res.status(503).json({ error: 'No isolated fixture installed.' });
// Serve synthetic API responses over real HTTP: worker and WebKit subresource
// requests must not fall through to the SPA document when interception differs.
app.use('/api', express.json(), (req, res) => handleApi(req, res));
app.use(express.static(dist)); app.get('/{*rest}', (_req, res) => res.sendFile(path.join(dist, 'bravo-shell.html')));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`, evidence = [];
await mkdir('test-results', { recursive: true });
try { for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
  const browser = await engine.launch();
  try { for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => {
      window.fixtureCapturePaused = false; window.fixtureSources = []; window.fixtureClones = []; window.fixtureSelfConnections = 0;
      const nativeClone = MediaStreamTrack.prototype.clone;
      MediaStreamTrack.prototype.clone = function() { const clone = nativeClone.call(this); window.fixtureClones.push(clone); return clone; };
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d'); let frame = 0;
        ctx.fillRect(0, 0, 640, 360);
        const stream = canvas.captureStream(15); window.fixtureSources.push(stream);
        const timer = setInterval(() => {
          if (stream.getVideoTracks()[0].readyState !== 'live') { clearInterval(timer); return; }
          if (!window.fixtureCapturePaused) { ctx.fillStyle = `rgb(${frame++ % 255},80,120)`; ctx.fillRect(0, 0, 640, 360); }
        }, 67);
        return stream;
      };
      const NativePC = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePC {
        constructor(config) {
          if (config?.iceServers?.length === 0) {
            window.fixtureSelfConnections++;
            throw new DOMException('Fixture: same-device WebRTC is unavailable', 'NotSupportedError');
          }
          super(config);
        }
      };
    });
    let createCount = 0, endCount = 0, record, prior, publications = [];
    handleApi = (req, res) => {
      const url = new URL(req.originalUrl, origin);
      let data = { entries: {}, images: {}, ads: [], clips: [], team: [], items: [], alerts: [], bookings: [], notifications: [] };
      if (url.pathname === '/api/config') data = { connected: true, paymentsReady: false, services: SERVICES, lessonLibrary: { open: false } };
      else if (url.pathname === '/api/auth/me') data = { user: { id: 'fixture-owner', name: 'Fixture Trainer', role: 'owner', isPrimaryOwner: true }, services: [], membership: { active: false } };
      else if (url.pathname === '/api/live/studio') data = { configured: true, bookings: [], sessions: record ? [record] : [] };
      else if (url.pathname === '/api/live' && req.method === 'GET') data = { sessions: record?.status === 'live' ? [record] : [], announcements: [], availability: 'available', serverTime: new Date().toISOString() };
      else if (url.pathname === '/api/live' && req.method === 'POST') {
        createCount++; prior = null;
        record = { id: 'fixture-' + createCount, trainerId: 'fixture-owner', trainerName: 'Fixture Trainer', dogName: 'Fixture Dog', audience: 'public', status: 'starting' };
        data = { session: record, transport: 'direct' };
      } else if (url.pathname.endsWith('/heartbeat')) {
        const body = req.body, p = body.publication;
        assert.ok(p && Number.isSafeInteger(p.framesEncoded) && Number.isSafeInteger(p.framesDecoded));
        const advancing = p.framesEncoded > 0 && p.framesDecoded > 0 && (!prior || prior.id !== p.id || p.framesEncoded > prior.framesEncoded && p.framesDecoded > prior.framesDecoded);
        if (body.cameraReady && advancing) { prior = p; record.status = 'live'; record.startedAt ||= new Date().toISOString(); record.liveUntil = new Date(Date.now() + 8000).toISOString(); }
        else record.status = 'reconnecting';
        publications.push({ ...p }); data = { session: record, peers: [], serverTime: new Date().toISOString() };
      } else if (url.pathname.endsWith('/end')) { endCount++; record = null; data = { ended: true }; }
      else assert.ok(['GET','HEAD'].includes(req.method) || url.pathname.includes('telemetry'), 'unexpected application write: ' + url.pathname);
      return res.json(data);
    };
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin || req.resourceType() === 'media') return route.abort();
      return route.continue();
    });
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(18000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().includes('/api/') && !response.headers()['content-type']?.includes('application/json')) console.log('UNEXPECTED_API_RESPONSE', response.url(), response.status(), response.headers()['content-type']); });
    try {
      await page.goto(origin + '/live/studio');
      await page.getByLabel('Dog’s name').fill('Fixture Dog');
      await page.getByRole('radio', { name: /PUBLIC LIVE/ }).check();
      await page.getByRole('checkbox', { name: /I have permission/ }).check();
      await page.getByRole('button', { name: 'Enable camera preview' }).click();
      await page.waitForFunction(() => document.querySelector('.live-camera-preview video')?.videoWidth > 0);
      await page.evaluate(() => { window.fixtureCapturePaused = true; });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '● Start live', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: /fresh camera frames|camera check timed out/ }).waitFor();
      assert.equal(createCount, 0, 'failed camera check never creates a server session');
      assert.equal(await page.getByRole('button', { name: 'Enable camera preview' }).count(), 0, 'healthy camera is kept for retry');
      assert.equal(await page.getByLabel('Dog’s name').inputValue(), 'Fixture Dog');
      assert.equal(await page.evaluate(() => window.fixtureSelfConnections), 0, 'no self-connection is required');
      await page.evaluate(() => { window.fixtureCapturePaused = false; });
      await page.getByRole('button', { name: '● Start live', exact: true }).click();
      await page.getByRole('button', { name: '■ End live session', exact: true }).waitFor();
      assert.equal(createCount, 1); assert.ok(publications[0].framesEncoded >= 2 && publications[0].framesDecoded >= 2);
      await page.waitForTimeout(2600);
      assert.ok(publications.length >= 2 && publications.at(-1).framesDecoded > publications[0].framesDecoded, 'real codec counters continue advancing');
      const oldPublicationId = publications.at(-1).id;
      await page.evaluate(() => { window.fixturePreviousCamera = document.querySelector('.live-camera-preview video').srcObject.getVideoTracks()[0]; });
      await page.getByRole('button', { name: 'Flip camera', exact: true }).click();
      await page.waitForTimeout(3300);
      assert.notEqual(publications.at(-1).id, oldPublicationId, 'camera switch verifies the new track');
      assert.equal(await page.evaluate(() => window.fixturePreviousCamera.readyState), 'ended');
      await page.getByRole('button', { name: '■ End live session', exact: true }).click();
      await page.getByRole('button', { name: 'Enable camera preview' }).waitFor();
      await page.waitForTimeout(700);
      assert.ok(await page.evaluate(() => window.fixtureSources.flatMap(s => s.getTracks()).every(t => t.readyState === 'ended') && window.fixtureClones.every(t => t.readyState === 'ended')), 'end releases original tracks and local clones');
      assert.equal(endCount, 1); assert.deepEqual(errors, []);
      await page.screenshot({ path: `test-results/publisher-startup-${engineName}-${width}.png` });
      evidence.push({ engine: engineName, width, passed: ['fresh-frame requirement', 'no self-connection', 'no server session on failed check', 'retry preserves camera and form', 'real encode/decode counters', 'camera switch', 'cleanup'], applicationRequests: 'isolated fixtures only' });
      console.log('PASS', engineName, width, 'startup without self-ICE, real encoded/decoded frames, failed-start retry and camera cleanup');
    } catch (error) { console.log('DIAGNOSTICS', engineName, width, { createCount, publications, errors, body: (await page.locator('main').innerText()).slice(0,2200) }); await page.screenshot({ path: `test-results/publisher-failure-${engineName}-${width}.png` }); throw error; }
    finally { await context.close(); }
  } } finally { await browser.close(); }
} } finally { await writeFile('test-results/publisher-startup-results.json', JSON.stringify(evidence, null, 2)); await new Promise(resolve => server.close(resolve)); }
