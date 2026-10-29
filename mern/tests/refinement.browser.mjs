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
      for (const [width, height, deviceScaleFactor] of [[320, 700, 1], [375, 844, 1], [390, 844, 1], [430, 844, 1], [768, 900, 1], [1024, 900, 1], [390, 844, 3], [844, 390, 1], [1440, 900, 1]]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, isMobile: deviceScaleFactor === 3, reducedMotion: 'reduce', hasTouch: width < 900 });
        let owner = false, saved = null;
        const requests = [], errors = [];
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin !== origin) return route.abort();
          if (!url.pathname.startsWith('/api/')) return route.continue();
          let json = { images: saved ? { 'asset-hero-real-confidence.webp': saved } : {}, entries: {}, reviews: [], recommendations: [], team: [], schedules: [], clips: [], alerts: [], revision: 0 };
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
          const pixels = (width >= 1000 ? 400 : Math.min(width, 460)) * deviceScaleFactor;
          const expectedImage = pixels <= 600 ? 'hero-real-confidence-600.webp' : pixels <= 900 ? 'hero-real-confidence-900.webp' : 'hero-real-confidence.webp';
          assert.ok(source.endsWith(expectedImage), source);
          const heroRequests = requests.filter(path => /\/hero-real-confidence(?:-\d+)?\.webp$/.test(path));
          assert.equal(new Set(heroRequests).size, 1, 'preload and image choose the same responsive asset');
          assert.ok(!requests.some(path => /\/(ContentEditor|AdEditor|BannerEditor)-.*\.js$/.test(path)), 'public loads exclude editing dialogs');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.equal(await page.locator('.mobile-home-nav svg').count(),6,'all quick-navigation icons are stable SVG outlines');
          assert.equal(await page.locator('.cinema-story').count(),0,'duplicate training-photo story is removed');
          assert.equal(await page.locator('.cinema-dog-gallery').count(),1,'editable original photo gallery remains');
          const photoBox = await image.boundingBox();
          const copyBox = await page.locator('.cinema-hero-copy').boundingBox();
          if (width >= 1000) {
            assert.ok(copyBox.x + copyBox.width < photoBox.x, 'desktop message and complete portrait have separate columns');
            const primary = await page.locator('.polish-hero-actions a').first().boundingBox();
            const navigation = await page.locator('.mobile-home-nav').boundingBox();
            assert.ok(primary.y > 74 && primary.y + primary.height < navigation.y, 'desktop booking is above the fixed navigation');
          } else {
            assert.equal(Math.round(photoBox.width), Math.min(width, 460), 'approved phone and tablet photo width is preserved');
            const headlineBox = await page.locator('.cinema-hero-copy h1').boundingBox();
            assert.ok(headlineBox.y > photoBox.y + photoBox.height / 2, 'phone and tablet place the visible headline below the portrait midpoint');
            assert.ok(Math.abs(photoBox.x + photoBox.width / 2 - width / 2) < 2, 'phone and tablet keep the portrait centered');
          }
          const sectionOrder = await page.locator('#main-content').evaluate(main => {
            const sections = [...main.querySelectorAll('#team, #results, [aria-labelledby="booking-title"], #k9-transport, #online')];
            return sections.map(section => section.id || 'booking');
          });
          assert.deepEqual(sectionOrder, ['team', 'results', 'booking', 'k9-transport', 'online'], 'training, proof and booking precede upcoming services in reading order');
          if (height === 390) {
            for (const link of await page.locator('.polish-hero-actions a').all()) {
              await link.scrollIntoViewIfNeeded();
              const box = await link.boundingBox();
              const bottomNav = await page.locator('.mobile-home-nav').boundingBox();
              assert.ok(box.y > 74 && box.y + box.height <= bottomNav.y, 'landscape hero actions scroll into view between the fixed controls');
            }
            assert.equal(await image.evaluate(img => getComputedStyle(img).objectFit), 'contain', 'short landscape preserves the complete photo');
          }
          await page.screenshot({ path: `test-results/refinement-${name}-${width}x${height}-${deviceScaleFactor}x.png` });
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
          console.log(`PASS ${name}/${width}x${height}/${deviceScaleFactor}x: responsive preload, deferred editors, hero framing, booking accessibility and overflow`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
