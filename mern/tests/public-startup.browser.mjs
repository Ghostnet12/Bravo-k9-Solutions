import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';

const html = await readFile('client/dist/bravo-shell.html', 'utf8');
const publicPaths = new Set(['/team', '/reviews', '/site-images', '/site-content', '/site-music', '/site-banner', '/site-banner/weather', '/workshops', '/program-videos', '/hero-videos', '/hero-carousel', '/proof-videos']);
let measurement;
const app = express();
app.use('/api', async (req, res) => {
  const sample = measurement;
  sample.seen.push(req.path);
  if (publicPaths.has(req.path) && !(sample.booking && req.path === '/team')) {
    sample.active += 1; sample.peak = Math.max(sample.peak, sample.active);
    await sample.release; await delay(40);
    sample.active -= 1;
  }
  let body = { images: {}, entries: {}, clips: [], alerts: [], schedules: [], revision: 0 };
  if (req.path === '/config') body = { connected: false, paymentsReady: false, services: SERVICES, schedule: { enabled: false, weekdays: [1, 2, 3, 4, 5], hours: [] } };
  if (req.path === '/auth/me') body = { user: null, services: [], membership: { active: false } };
  if (req.path === '/live') body = { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() };
  if (req.path === '/team') body = { team: [{ id: 'fixture-trainer', name: 'Fixture Trainer', role: 'staff', title: 'Isolated QA trainer', bio: 'Test fixture only.' }] };
  if (req.path === '/reviews') body = { reviews: [], recommendations: DEFAULT_REVIEWS, count: 0, average: 0 };
  if (req.path === '/proof-videos') body = { clips: DEFAULT_PROOF_VIDEOS, nextCursor: null };
  res.json(body);
});
app.use(express.static('client/dist'));
app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        let unblock;
        const sample = { release: new Promise(resolve => { unblock = resolve; }), active: 0, peak: 0, seen: [] };
        measurement = sample;
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(origin, { waitUntil: 'domcontentloaded' });
          const heroBooking = page.locator('.polish-hero-actions').getByRole('link', { name: /^Start My Training Plan$/i });
          await heroBooking.waitFor();
          // Read real server activity while public content is deliberately held.
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline && (!sample.seen.includes('/auth/me') || !sample.seen.includes('/live') || !sample.seen.includes('/config') || sample.active < 2)) await delay(20);
          assert.equal(sample.active, 2, 'only two public reads reach the server while content is slow');
          assert.ok(sample.seen.includes('/auth/me'), 'sign-in readiness is not queued');
          assert.ok(sample.seen.includes('/live'), 'live polling is not queued');
          assert.ok(sample.seen.includes('/config'), 'current catalog and connection state are not queued');
          assert.ok(await heroBooking.isVisible());
          // Enter booking before any background content is released. Its trainer
          // list must not wait behind the unmounted homepage's pending reads.
          sample.booking = true;
          await heroBooking.click();
          await page.getByRole('heading', { name: 'Let’s start with your dog.', exact: true }).waitFor();
          await page.getByLabel('Dog’s name', { exact: true }).fill('Unsent queue fixture');
          await page.getByRole('button', { name: 'Choose a trainer →', exact: true }).click();
          await page.getByRole('button', { name: /Fixture Trainer/ }).waitFor();
          assert.ok(await page.getByRole('button', { name: /Fixture Trainer/ }).isEnabled(), 'booking trainer choice bypasses pending content');
          unblock();
          await page.waitForLoadState('networkidle');
          sample.booking = false;
          await page.getByRole('link', { name: 'Bravo K9 Solutions home', exact: true }).first().click();
          await page.getByRole('heading', { name: 'Fixture Trainer', exact: true }).waitFor();
          await page.getByRole('heading', { name: DEFAULT_PROOF_VIDEOS[0].title, exact: true }).first().waitFor();
          await page.waitForLoadState('networkidle');
          assert.equal(sample.peak, 2, 'public reads remain bounded after the initial responses');
          for (const path of ['/config', '/site-images', '/site-content', '/reviews', '/team', '/proof-videos', '/workshops']) assert.ok(sample.seen.includes(path), `${path} eventually loads`);
          assert.deepEqual(errors, []);
          results.push({ engine: name, width, publicReadPeak: sample.peak, authenticationAndLiveImmediate: true, bookingTrainerWhileContentPending: true });
          console.log(JSON.stringify(results.at(-1)));
        } catch (error) {
          await page.screenshot({ path: `test-results/public-startup-${name}-${width}-failure.png`, fullPage: true });
          throw error;
        } finally { unblock(); await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await writeFile('test-results/public-startup.json', JSON.stringify(results, null, 2));
  server.close();
}
