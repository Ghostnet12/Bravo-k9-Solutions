import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname;
          let json = { user: null, services: [], team: [], images: {}, reviews: [], schedules: [], alerts: [], revision: 0 };
          if (path === '/api/proof-videos') json = { clips: Array.from({ length: 4 }, (_, i) => ({ id: `fixture-${i}`, title: `Training ${i + 1}`, description: 'Real-world training fixture', order: i, revision: 0, src: i === 0 ? '/fixture-video.mp4' : null, facebookUrl: i === 0 ? null : 'https://www.facebook.com/reel/1850999522754029', poster: '/images/obedience-real-world.webp' })), nextCursor: null };
          await route.fulfill({ json });
        });
        try {
          await page.goto(origin); const rail = page.getByRole('region', { name: 'Training video carousel' });
          await page.locator('[data-proof-video]').first().waitFor(); await rail.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0);
          await page.waitForTimeout(1000); const initial = await rail.evaluate(el => el.scrollLeft);
          await page.waitForTimeout(4700); const moved = await rail.evaluate(el => el.scrollLeft);
          assert.ok(moved > initial + 20, `${name}/${width}: advances left after five seconds`);
          await page.getByRole('button', { name: 'Pause videos', exact: true }).click(); await page.mouse.move(0, 0);
          const stopped = await rail.evaluate(el => el.scrollLeft); await page.waitForTimeout(5500);
          assert.ok(Math.abs((await rail.evaluate(el => el.scrollLeft)) - stopped) < 2);
          await page.getByRole('button', { name: 'Next video', exact: true }).click(); await page.waitForTimeout(700);
          assert.ok((await rail.evaluate(el => el.scrollLeft)) > stopped + 10);
          await page.screenshot({ path: `test-results/proof-carousel-${name}-${width}.png` });
          // A playing native video blocks the timer, independent of pointer/focus.
          await page.locator('video').first().evaluate(video => { Object.defineProperty(video, 'paused', { configurable: true, get: () => false }); });
          await page.getByRole('button', { name: 'Resume videos', exact: true }).click();
          await page.getByRole('heading', { name: 'Training you can actually see.' }).evaluate(el => { el.tabIndex = -1; });
          await page.locator('#main-content').focus(); await rail.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0);
          const playingPosition = await rail.evaluate(el => el.scrollLeft); await page.waitForTimeout(5500);
          assert.ok(Math.abs((await rail.evaluate(el => el.scrollLeft)) - playingPosition) < 2);
          await page.locator('video').first().evaluate(video => { delete video.paused; });
          await page.emulateMedia({ reducedMotion: 'reduce' }); const reducedPosition = await rail.evaluate(el => el.scrollLeft); await page.waitForTimeout(5500);
          assert.ok(Math.abs((await rail.evaluate(el => el.scrollLeft)) - reducedPosition) < 2);
          const reel = page.getByRole('link', { name: 'Watch Training 2 on Facebook', exact: true });
          assert.equal(await reel.getAttribute('href'), 'https://www.facebook.com/reel/1850999522754029'); assert.equal(await reel.getAttribute('target'), null);
          assert.deepEqual(errors, []); console.log(`PASS ${name} ${width}: five-second advance, pause, arrows, playing-video guard, reduced motion and same-tab Facebook link`);
        } catch (error) { await page.screenshot({ path: `test-results/proof-carousel-failure-${name}-${width}.png`, fullPage: true }); await writeFile(`test-results/proof-carousel-failure-${name}-${width}.json`, JSON.stringify({ error: error.message, errors })); throw error; }
        finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
