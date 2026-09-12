// Deterministic cold-load regression. Uses only local public-media fixtures:
// no production sessions, customer records, saved edits, or external APIs.
import assert from 'node:assert/strict';
import express from 'express';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createHomepageHandler } from '../server/homepage.js';
const engines = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const hero = { revision: 13, src: '/api/site-images/home-hero/image?v=13', alt: 'Bravo team fixture', fit: 'contain', x: 13, y: 19.5, zoom: 1.36, framed: true, canUndo: true };
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/index.html`, 'utf8');
const app = express();
app.get('/', createHomepageHandler({ loadTemplate: async () => html, loadHero: async () => hero }));
app.get('/api/site-images/home-hero/image', (_req, res) => res.sendFile(`${dist}/images/hero-bravo-launch.webp`));
app.get('/api/config', (_req, res) => res.json({ connected: true }));
app.get('/api/team', (_req, res) => res.json({ team: [] }));
app.get('/api/team/schedules', (_req, res) => res.json({ schedules: [], checkedAt: new Date().toISOString() }));
app.get('/api/reviews', (_req, res) => res.json({ reviews: [], average: 0, count: 0 }));
app.use(express.static(dist));
app.get('/{*path}', (req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Fixture endpoint missing' }) : res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
const results = [];
try {
  for (const name of ['chromium', 'webkit']) {
    const browser = await engines[name].launch({ headless: true });
    try {
      for (const width of [390, 1440]) for (const owner of [false, true]) {
        const label = `${name}-${width}-${owner ? 'administrator' : 'visitor'}`;
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390, deviceScaleFactor: 1 });
        const page = await context.newPage(), errors = [], photoRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/hero-bravo-launch|site-images\/home-hero\/image/.test(request.url())) photoRequests.push(request.url()); });
        await page.route('**/api/auth/me', async route => {
          await new Promise(resolve => setTimeout(resolve, 900));
          await route.fulfill({ json: { user: owner ? { id: 'fixture-owner', role: 'owner', name: 'Fixture administrator' } : null, services: [] } });
        });
        await page.route('**/api/site-images', async route => {
          await new Promise(resolve => setTimeout(resolve, 1500));
          await route.fulfill({ json: { images: { 'home-hero': hero } } });
        });
        await page.addInitScript(() => {
          window.heroFrames = [];
          const sample = () => {
            const image = document.querySelector('.home-hero-image'), section = document.querySelector('.home-hero');
            if (image && section) {
              const style = getComputedStyle(image), box = section.getBoundingClientRect();
              window.heroFrames.push({ src: image.getAttribute('src'), fit: style.objectFit, position: style.objectPosition, transform: style.transform, height: box.height, top: box.top + scrollY, width: box.width, visible: style.visibility, opacity: style.opacity, loaded: image.complete && image.naturalWidth > 0 });
            }
            if (!window.stopHeroSampling) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        try {
          await page.goto(origin, { waitUntil: 'domcontentloaded' });
          await page.locator('.home-hero-image').waitFor({ state: 'visible' });
          // Observe across font loading, media fetch, and delayed auth/remount.
          await page.waitForTimeout(3200);
          await page.evaluate(() => { window.stopHeroSampling = true; });
          const frames = await page.evaluate(() => window.heroFrames);
          assert.ok(frames.length > 5, `${label}: capture first frames`);
          assert.equal(await page.locator('.home-hero-image').count(), 1);
          assert.deepEqual([...new Set(frames.map(frame => frame.src))], [hero.src], `${label}: must never flash the old hero`);
          assert.deepEqual([...new Set(frames.map(frame => frame.fit))], ['contain']);
          assert.deepEqual([...new Set(frames.map(frame => frame.position))], ['13% 19.5%']);
          assert.equal(new Set(frames.map(frame => frame.transform)).size, 1, `${label}: no late zoom`);
          for (const key of ['height', 'top', 'width']) assert.ok(Math.max(...frames.map(frame => frame[key])) - Math.min(...frames.map(frame => frame[key])) < 1, `${label}: ${key} changed: ${JSON.stringify(frames.filter((frame, i) => !i || frames[i - 1][key] !== frame[key]))}`);
          assert.ok(frames.every(frame => frame.visible === 'visible' && frame.opacity === '1'), `${label}: no hide-until-loaded guard`);
          assert.ok(frames.some(frame => frame.loaded), `${label}: image decoded`);
          assert.ok(photoRequests.length > 0 && photoRequests.every(url => url.includes(hero.src)), `${label}: only published photo requested`);
          assert.deepEqual(errors, [], `${label}: no runtime errors`);
          await page.screenshot({ path: `test-results/${label}.png` });
          if (owner) {
            const button = page.getByRole('button', { name: 'Edit photos & videos', exact: true });
            assert.ok(await button.isVisible(), `${label}: editor retained`);
            const toolsTop = await button.evaluate(element => element.getBoundingClientRect().top + scrollY);
            assert.ok(toolsTop >= frames.at(-1).top + frames.at(-1).height, `${label}: toolbar is below hero`);
            await page.locator('.home-hero-image').focus(); await page.keyboard.press('F2');
            await page.getByRole('dialog').waitFor({ state: 'visible' });
            assert.equal(await page.locator('[data-field="fit"]').inputValue(), 'contain');
            assert.equal(await page.locator('[data-field="zoom"]').inputValue(), '1.36');
            await page.getByRole('button', { name: 'Close media editor' }).click();
          }
          // Browser Back / an SPA remount must retain the same published crop.
          await page.evaluate(() => { history.pushState({}, '', '/contact'); dispatchEvent(new PopStateEvent('popstate')); });
          await page.getByText('Contact & visit help', { exact: true }).first().waitFor();
          await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
          await page.locator('.home-hero-image').waitFor({ state: 'visible' });
          assert.equal(await page.locator('.home-hero-image').getAttribute('src'), hero.src);
          assert.equal(await page.locator('.home-hero-image').evaluate(image => getComputedStyle(image).objectFit), 'contain');
          results.push({ label, frames: frames.length, height: frames[0].height, top: frames[0].top, sourceChanges: 0, framingChanges: 0, errors });
          console.log(`PASS ${label}: ${frames.length} frames, stable ${frames[0].height}px hero, no source/crop changes`);
        } catch (error) {
          await page.screenshot({ path: `test-results/FAILED-${label}.png` });
          await writeFile(`test-results/FAILED-${label}.json`, JSON.stringify({ error: error.message, frames: await page.evaluate(() => window.heroFrames), errors }, null, 2));
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await writeFile('test-results/hero-results.json', JSON.stringify(results, null, 2));
  await new Promise(resolve => server.close(resolve));
}
