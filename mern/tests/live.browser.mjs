import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'live_browser', BRAVO_LIVE_ENABLED: 'true' });
delete process.env.STRIPE_SECRET_KEY;
let server;
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
  const healthTimer = setInterval(() => LiveSession.updateMany({ open: true }, { $set: { lastSeenAt: new Date(), lastPublishedAt: new Date() } }).catch(() => {}), 1500);
  healthTimer.unref();
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch(engineName === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : {});
    try { for (const width of [390, 1440]) {
      process.env.BRAVO_LIVE_ENABLED = 'true';
      await LiveSession.deleteMany({}); await LiveSession.create({ ...row, lastSeenAt: new Date() });
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`${origin}/live`);
        await page.getByRole('heading', { name: 'BRAVO LIVE', exact: true }).waitFor();
        await page.locator('.live-session-row').waitFor();
        assert.equal(await page.locator('.live-session-row').count(), 1);
        assert.match(await page.locator('.live-session-row').innerText(), /David[\s\S]*Gunner/);
        assert.equal(await page.getByText('Private client fixture', { exact: true }).count(), 0);
        assert.ok(await page.getByRole('button', { name: 'Watch live', exact: false }).isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engineName} ${width} viewer overflow`);
        await page.screenshot({ path: `test-results/live-${engineName}-${width}.png`, fullPage: true });
        await page.goto(origin);
        await page.locator('.hero-live').waitFor();
        await page.locator('.hero-live').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/live-banner-${engineName}-${width}.png`, fullPage: false });
        await LiveSession.updateOne({ _id: row._id }, { $set: { audience: 'client' } });
        await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/live')), page.reload()]);
        assert.equal(await page.locator('.hero-live').count(), 1);
        assert.match(await page.locator('.hero-live').innerText(), /Client session/);
        await page.goto(`${origin}/live?session=${row._id}`);
        await page.getByRole('heading', { name: 'OUT IN THE FIELD.' }).waitFor();
        assert.equal(await page.locator('.live-session-row').count(), 0);
        await page.goto(`${origin}/live/studio`);
        await page.getByRole('heading', { name: 'Trainer sign in required.' }).waitFor();
        await context.addCookies([{ name: 'bravo_session', value: token, domain: '127.0.0.1', path: '/' }]);
        process.env.BRAVO_LIVE_ENABLED = 'false';
        await page.reload();
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
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await replica.stop(); }
