import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import axe from 'axe-core';
import { renderHomepage } from '../server/homepage.js';
import { SERVICES } from '../shared/catalog.js';

const html = renderHomepage(await readFile('client/dist/bravo-shell.html', 'utf8'), null, null);
const app = express();
app.get('/', (_req, res) => res.type('html').send(html));
app.use(express.static('client/dist'));
app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try {
      for (const [width, height] of [[320, 700], [390, 844], [844, 390], [1440, 900]]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 900 });
        let owner = false, saved = null;
        const requests = [], errors = [];
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin !== origin) return route.abort();
          if (!url.pathname.startsWith('/api/')) return route.continue();
          let json = { images: saved ? { 'asset-mobile-bravo-cinematic.webp': saved } : {}, entries: {}, reviews: [], recommendations: [], team: [], schedules: [], clips: [], alerts: [], revision: 0 };
          if (url.pathname === '/api/config') json = { connected: false, services: SERVICES, paymentsReady: false, schedule: { enabled: false, hours: [], weekdays: [1,2,3,4,5] } };
          if (url.pathname === '/api/auth/me') json = { user: owner ? { id: 'fixture-owner', role: 'owner', name: 'Fixture owner' } : null, services: [] };
          if (url.pathname === '/api/live') json = { announcements: [], sessions: [], availability: 'available', serverTime: new Date().toISOString() };
          return route.fulfill({ json });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(new URL(request.url()).pathname));
        try {
          await page.goto(origin, { waitUntil: 'networkidle' });
          const image = page.locator('.cinema-hero-still');
          await image.evaluate(img => img.decode());
          const source = await image.evaluate(img => img.currentSrc);
          assert.ok(source.endsWith(width <= 600 ? 'mobile-bravo-cinematic-600.webp' : width <= 900 ? 'mobile-bravo-cinematic-900.webp' : 'mobile-bravo-cinematic.webp'));
          const heroRequests = requests.filter(path => /\/mobile-bravo-cinematic(?:-\d+)?\.webp$/.test(path));
          assert.equal(new Set(heroRequests).size, 1, 'preload and image choose the same responsive asset');
          assert.ok(!requests.some(path => /\/(ContentEditor|AdEditor|BannerEditor)-.*\.js$/.test(path)), 'public loads exclude editing dialogs');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/refinement-${name}-${width}x${height}.png` });
          if (width === 390) {
            owner = true;
            await page.reload({ waitUntil: 'networkidle' });
            const before = await image.boundingBox();
            await image.press('F2');
            await page.getByRole('dialog', { name: 'Edit this photo', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Close media editor', exact: true }).click();
            // Published custom photos must replace, not compete with, srcset.
            saved = { revision: 1, src: '/images/bravo-client-training.jpeg', alt: 'Isolated published hero', fit: 'contain', x: 50, y: 50, zoom: 1, framed: true };
            await page.reload({ waitUntil: 'networkidle' });
            await page.waitForFunction(() => document.querySelector('.cinema-hero-still')?.getAttribute('src') === '/images/bravo-client-training.jpeg');
            assert.equal(await image.getAttribute('srcset'), null);
            const after = await image.boundingBox();
            assert.ok(Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1, 'published photo retains the reserved hero geometry');
            owner = false;
          }
          await page.goto(`${origin}/portal?program=training`, { waitUntil: 'networkidle' });
          await page.getByRole('heading', { name: 'Let’s start with your dog.' }).waitFor();
          await page.getByRole('button', { name: 'Plan my entire month', exact: true }).click();
          await page.getByRole('heading', { name: 'Build your schedule', exact: true }).waitFor();
          await page.addScriptTag({ content: axe.source });
          const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })));
          assert.deepEqual(violations, [], 'booking automated WCAG checks');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.deepEqual(errors, []);
          console.log(`PASS ${name}/${width}x${height}: responsive preload, deferred editors, hero framing, booking accessibility and overflow`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
