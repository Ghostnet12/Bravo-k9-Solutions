import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const reviews = [
  { _id: 'review-1', authorName: 'Bravo Client One', rating: 5, body: 'Our walks are calmer and our home finally has clear boundaries.' },
  { _id: 'review-2', authorName: 'Bravo Client Two', rating: 5, body: 'The private sessions helped us understand what our dog needed.' },
  { _id: 'review-3', authorName: 'Bravo Client Three', rating: 5, body: 'Practical training that carried into everyday life.' },
];
const team = [
  { id: 'david', name: 'David Northrop', role: 'owner', title: 'Owner & Lead Trainer', bio: 'Fixture profile.' },
  { id: 'ashley', name: 'Ashley Northrop', role: 'staff', title: 'Trainer & Pitbull Specialist', bio: 'Fixture profile.' },
];
const app = express();
app.get('/api/proof-videos', (_req, res) => res.json({ clips: DEFAULT_PROOF_VIDEOS, nextCursor: null }));
app.get('/api/config', (_req, res) => res.json({ connected: false, paymentsReady: false, services: SERVICES, schedule: { enabled: false, weekdays: [1,2,3,4,5], hours: [] } }));
app.get('/api/auth/me', (_req, res) => res.json({ user: null, services: [], membership: { active: false } }));
app.get('/api/site-images', (_req, res) => res.json({ images: {} }));
app.get('/api/team', (_req, res) => res.json({ team }));
app.get('/api/team/schedules', (_req, res) => res.json({ schedules: [], checkedAt: new Date().toISOString() }));
app.get('/api/reviews', (_req, res) => res.json({ reviews, average: 5, count: reviews.length }));
app.use(express.static(dist));
app.get('/{*path}', (req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Fixture endpoint missing.' }) : res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });

try {
  const engines = process.env.BROWSER_ENGINE ? { [process.env.BROWSER_ENGINE]: { chromium, webkit }[process.env.BROWSER_ENGINE] } : { chromium, webkit };
  for (const [engineName, engine] of Object.entries(engines)) {
    if (!engine) throw new Error(`Unsupported BROWSER_ENGINE: ${engineName}`);
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, isMobile: width === 390 });
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'Real clients. Real progress.' }).waitFor();
        const proofTop = await page.locator('#reviews').evaluate(element => element.offsetTop);
        const trainingTop = await page.locator('#training').evaluate(element => element.offsetTop);
        assert.ok(proofTop < trainingTop, `${engineName}-${width}: proof must precede training`);
        assert.equal(await page.locator('.home-proof-reviews article').count(), 3);
        assert.equal(await page.locator('.home-work-proof-grid article').count(), 3);
        // Exercise the mobile/desktop outbound action without relying on Facebook
        // availability in CI. Real video playback is checked separately on live pages.
        const reelIds = ['1850999522754029', '1068433732560103', '1079472767813329'];
        await context.route('https://www.facebook.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Original video destination</title><p>Facebook destination fixture</p>' }));
        for (const reelId of reelIds) {
          const card = page.locator(`[data-facebook-reel="${reelId}"]`);
          const watch = card.getByRole('link', { name: /^Watch .+ on Facebook \(opens in a new tab\)$/ });
          const originalUrl = `https://www.facebook.com/reel/${reelId}/`;
          assert.equal(await watch.getAttribute('href'), originalUrl);
          assert.equal(await watch.getAttribute('target'), '_blank');
          assert.equal(await watch.getAttribute('rel'), 'noopener noreferrer');
          assert.equal(await card.getByRole('link', { name: /^View original/ }).getAttribute('href'), originalUrl);
          const destinationPromise = context.waitForEvent('page');
          await watch.click();
          const destination = await destinationPromise;
          await destination.waitForURL(originalUrl);
          await destination.getByText('Facebook destination fixture').waitFor();
          await destination.close();
          assert.equal(await card.locator('iframe').count(), 0);
          assert.equal(await watch.isVisible(), true, `${engineName}-${width}: proof poster must remain visible after opening a video`);
        }
        assert.equal(await page.locator('.home-proof-team').getByText('David Northrop', { exact: true }).count(), 1);
        assert.equal(await page.locator('.home-training-offer').getByRole('link', { name: /Start with private training/ }).getAttribute('href'), '/portal?program=training');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${engineName}-${width}: homepage overflow`);
        assert.deepEqual(errors, [], `${engineName}-${width}: homepage runtime errors`);
        await page.screenshot({ path: `test-results/home-conversion-${engineName}-${width}.png`, fullPage: true });
        if (width === 390) {
          await page.goto(`${origin}/portal?program=training`, { waitUntil: 'networkidle' });
          const booking = await page.locator('.mobile-booking-bar').boundingBox();
          const access = await page.locator('.accessibility-tools').boundingBox();
          assert.ok(booking && access && access.y + access.height <= booking.y, `${engineName}: accessibility control overlaps booking bar`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${engineName}: booking overflow`);
          assert.deepEqual(errors, [], `${engineName}: booking runtime errors`);
          await page.screenshot({ path: `test-results/booking-controls-${engineName}-390.png`, fullPage: false });
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}
