// Real, existing Bravo media; no mocked playback or overridden media methods.
// Keep this framework-free so browser-runtime failures are distinguishable
// from application lifecycle regressions.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const app = express();
app.use('/assets', express.static(fileURLToPath(new URL('../client/dist/assets/', import.meta.url))));
app.get('/', (_req, res) => res.type('html').send('<!doctype html><title>Bravo media lifecycle verification</title><video src="/assets/bravo-opening-565c14182176.mp4" autoplay muted loop playsinline></video>'));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch(name === 'chromium' ? { channel: 'chrome' } : { headless: process.env.BRAVO_HEADED_WEBKIT !== '1' });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => document.querySelector('video').currentTime > 0.5);
      // A synchronous media call that blocks the renderer must fail promptly.
      await Promise.race([
        page.evaluate(() => document.querySelector('video').pause()),
        new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(`${name}: video pause blocked the renderer`)), 10000); timer.unref(); }),
      ]);
      const paused = await page.locator('video').evaluate(video => ({ paused: video.paused, time: video.currentTime }));
      assert.equal(paused.paused, true);
      await page.locator('video').evaluate(video => video.play());
      await page.waitForFunction(time => document.querySelector('video').currentTime > time + 0.2, paused.time);
      const previousDocument = await page.evaluate(() => performance.timeOrigin);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      assert.notEqual(await page.evaluate(() => performance.timeOrigin), previousDocument);
      await page.waitForFunction(() => document.querySelector('video').currentTime > 0.5);
      console.log(`PASS ${name}: actual video playback, pause, resume and document reload`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
