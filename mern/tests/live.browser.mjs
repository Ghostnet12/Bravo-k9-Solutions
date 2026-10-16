import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'live_browser', BRAVO_LIVE_ENABLED: 'true' });
delete process.env.STRIPE_SECRET_KEY;
let server, healthTimer;
await mkdir('test-results', { recursive: true });
try {
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, Booking, LiveSession } = await import('../server/models.js');
  await connectDb();
  const trainer = await User.create({ name: 'David', role: 'owner', passwordHash: 'fixture-only' });
  const client = await User.create({ name: 'Private client fixture', role: 'member', passwordHash: 'fixture-only' });
  process.env.OWNER_USER_ID = String(trainer._id);
  await Booking.create({ userId: client._id, staffId: trainer._id, dogName: 'Gunner', status: 'confirmed', visits: [] });
  const token = randomBytes(32).toString('hex');
  await Session.create({ userId: trainer._id, tokenHash: createHash('sha256').update(token).digest('hex'), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  const row = { _id: 'f49a2019-e01f-4db7-b15a-508fd74e2bea', trainerId: trainer._id, trainerName: 'David', credentialVersion: 0, clientId: client._id, dogName: 'Gunner', audience: 'public', transport: 'direct', roomName: 'browser-fixture', publisherIdentity: 'test-publisher', open: true, status: 'live', startedAt: new Date(Date.now() - 123000), lastSeenAt: new Date(), lastPublishedAt: new Date() };
  healthTimer = setInterval(() => LiveSession.updateMany({ open: true }, { $set: { lastSeenAt: new Date(), lastPublishedAt: new Date() } }).catch(() => {}), 1500);
  healthTimer.unref();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch(engineName === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : {});
    try { for (const width of [390, 1440]) {
      process.env.BRAVO_LIVE_ENABLED = 'true';
      await LiveSession.deleteMany({}); await LiveSession.create({ ...row, lastSeenAt: new Date(), lastPublishedAt: new Date() });
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage(), errors = [], navigationDiagnostics = [];
      let navigating = false;
      page.on('pageerror', error => {
        // Playwright WebKit also emits handled, navigation-canceled fetches as
        // pageerror (#43120). Only the observed public reads during an explicit
        // document replacement are diagnostics; native uncaught errors still fail.
        if (engineName === 'webkit' && navigating && ['live', 'site-content', 'site-images'].some(path => error.message.endsWith(`${new URL(origin).host}/api/${path} due to access control checks.`))) navigationDiagnostics.push({ message: error.message, url: page.url() });
        else errors.push(error.message);
      });
      await page.exposeFunction('recordLiveRuntimeError', message => errors.push(message));
      await page.addInitScript(() => {
        window.addEventListener('error', event => { if (event instanceof ErrorEvent) void window.recordLiveRuntimeError(event.error?.stack || event.message).catch(() => {}); });
        window.addEventListener('unhandledrejection', event => { void window.recordLiveRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {}); });
      });
      const navigate = async url => {
        // These scenarios switch fixture audiences/accounts, so finish the old
        // document's queued reads before changing documents. Mid-load booking
        // remains covered separately by public-startup.browser.mjs.
        await page.waitForLoadState('networkidle');
        navigating = true;
        try { if (url) await page.goto(url); else await page.reload(); }
        finally { navigating = false; }
        // The destination must still permit both reads. Real CORS/CSP failures
        // cannot be hidden by classifying the previous document's cancellation.
        const result = await page.evaluate(async () => {
          const content = await fetch('/api/site-content', { credentials: 'same-origin', cache: 'no-store' });
          const contentData = await content.json();
          const images = await fetch('/api/site-images', { credentials: 'same-origin', cache: 'no-store' });
          const imageData = await images.json();
          const live = await fetch('/api/live', { credentials: 'same-origin', cache: 'no-store' });
          const liveData = await live.json();
          return { content: content.status, entries: !!contentData.entries && typeof contentData.entries === 'object' && !Array.isArray(contentData.entries), images: images.status, imageMap: !!imageData.images && typeof imageData.images === 'object' && !Array.isArray(imageData.images), live: live.status, sessions: Array.isArray(liveData.sessions) };
        });
        assert.deepEqual(result, { content: 200, entries: true, images: 200, imageMap: true, live: 200, sessions: true });
        await page.waitForLoadState('networkidle');
      };
      try {
        await navigate(`${origin}/live`);
        await page.getByRole('heading', { name: 'BRAVO LIVE', exact: true }).waitFor();
        await page.locator('.live-session-row').waitFor();
        assert.equal(await page.locator('.live-session-row').count(), 1);
        assert.match(await page.locator('.live-session-row').innerText(), /David[\s\S]*Gunner/);
        assert.equal(await page.getByText('Private client fixture', { exact: true }).count(), 0);
        assert.ok(await page.getByRole('button', { name: 'Watch live', exact: false }).isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engineName} ${width} viewer overflow`);
        await page.screenshot({ path: `test-results/live-${engineName}-${width}.png`, fullPage: true });
        await navigate(origin);
        await page.locator('.hero-live').waitFor();
        await page.locator('.hero-live').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/live-banner-${engineName}-${width}.png`, fullPage: false });
        await LiveSession.updateOne({ _id: row._id }, { $set: { audience: 'client' } });
        await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/live')), navigate()]);
        // A completed API response can precede React's banner render (and the
        // destination probe also reads this endpoint). Observe the UI first.
        await page.locator('.hero-live').getByText('Client session', { exact: false }).waitFor();
        assert.equal(await page.locator('.hero-live').count(), 1);
        assert.match(await page.locator('.hero-live').innerText(), /Client session/);
        await navigate(`${origin}/live?session=${row._id}`);
        await page.getByRole('heading', { name: 'OUT IN THE FIELD.' }).waitFor();
        assert.equal(await page.locator('.live-session-row').count(), 0);
        await navigate(`${origin}/live/studio`);
        await page.getByRole('heading', { name: 'Trainer sign in required.' }).waitFor();
        await context.addCookies([{ name: 'bravo_session', value: token, domain: '127.0.0.1', path: '/' }]);
        process.env.BRAVO_LIVE_ENABLED = 'false';
        await navigate();
        await page.getByText('Camera preview is available.', { exact: false }).waitFor();
        const selection = page.getByLabel('Dog / scheduled client');
        await selection.selectOption({ label: 'Gunner · Private client fixture' });
        assert.equal(await page.getByRole('radio', { name: /CLIENT ONLY/ }).isChecked(), true);
        assert.equal(await page.getByRole('button', { name: '● Start live' }).isDisabled(), true);
        if (engineName === 'chromium') {
          await page.getByRole('button', { name: 'Enable camera preview' }).click();
          await page.waitForFunction(() => document.querySelector('.live-camera-preview video')?.srcObject?.getVideoTracks().some(track => track.readyState === 'live'));
          await page.getByRole('button', { name: 'Microphone off' }).click();
          await page.getByRole('button', { name: 'Microphone on' }).waitFor();
          await page.getByRole('button', { name: 'Flip camera' }).click();
          await page.locator('.live-camera-preview video.is-mirrored').waitFor();
          await page.evaluate(() => { window.__previewStream = document.querySelector('.live-camera-preview video').srcObject; });
        }
        await page.getByRole('radio', { name: /PUBLIC LIVE/ }).check();
        await page.getByRole('checkbox', { name: /I have permission/ }).check();
        assert.equal(await page.getByRole('button', { name: '● Start live' }).isDisabled(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engineName} ${width} studio overflow`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `test-results/live-studio-${engineName}-${width}.png`, fullPage: true });
        await page.getByRole('link', { name: 'Open the live viewing page →' }).click();
        await page.locator('.bravo-live-page').waitFor();
        if (engineName === 'chromium') await page.waitForFunction(() => window.__previewStream.getTracks().every(track => track.readyState === 'ended'));
        assert.deepEqual(errors, []);
        console.log(`PASS ${engineName} ${width}: live rows, private isolation, banner, studio, preview cleanup`);
      } finally { await writeFile(`test-results/live-diagnostics-${engineName}-${width}.json`, JSON.stringify({ errors, navigationDiagnostics }, null, 2)); await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { clearInterval(healthTimer); if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await replica.stop(); }
