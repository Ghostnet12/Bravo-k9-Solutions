// Read-only synthetic APIs. No production credentials, purchases or messages.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/tools-of-the-trade.html`, 'utf8');
const home = await readFile(`${dist}/bravo-shell.html`, 'utf8');
let writes = 0;
const app = express();
app.use('/api', (req, res) => {
  if (req.method !== 'GET') { writes++; return res.status(405).end(); }
  const fixtures = {
    '/config': { connected: true, services: SERVICES, paymentsReady: false },
    '/auth/me': { user: null, services: [] },
    '/live': { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() },
    '/site-content': { entries: {} }, '/site-images': { images: {} },
    '/team': { team: [] }, '/reviews': { reviews: [], recommendations: [], count: 0 },
    '/proof-videos': { clips: [] }, '/hero-videos': { clips: [] },
  };
  res.json(fixtures[req.path] || {});
});
app.get('/tools-of-the-trade', (_req,res) => res.type('html').send(html));
app.get('/', (_req,res) => res.type('html').send(home));
app.use(express.static(dist));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const links = ['https://a.co/d/0cWLPuAY','https://a.co/d/08SLvEQC','https://a.co/d/07p2Zd9F','https://a.co/d/0bMLFa5W'];
await mkdir('test-results', { recursive: true });
try {
  for (const [name,engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      const raw = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      assert.equal((await raw.goto(origin + '/tools-of-the-trade')).status(), 200);
      assert.equal(await raw.locator('.tool-card').count(), 4);
      assert.match(await raw.locator('.tools-assessment').innerText(), /We only use the tools your dog needs/);
      assert.equal(await raw.locator('.tool-purchase').first().getAttribute('href'), links[0]);
      await raw.close();
      for (const width of [360,390,768,1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(origin + '/tools-of-the-trade');
          await page.locator('.tools-assessment').waitFor();
          await page.locator('.tool-card').last().scrollIntoViewIfNeeded();
          await page.waitForFunction(() => [...document.querySelectorAll('.tool-photo img')].every(img => img.complete && img.naturalWidth > 0));
          assert.equal(await page.locator('h1').count(), 1);
          assert.equal(await page.title(), 'Tools of the Trade | Bravo K9 Solutions');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.match(await page.locator('.tools-assessment').innerText(), /Not every dog needs every tool/);
          assert.ok(await page.evaluate(() => document.querySelector('.tools-assessment').getBoundingClientRect().top < document.querySelector('.tool-card').getBoundingClientRect().top));
          assert.equal(await page.locator('.tool-card').count(), 4);
          for (const [i,card] of (await page.locator('.tool-card').all()).entries()) {
            const image = card.locator('img'), link = card.locator('.tool-purchase');
            assert.ok((await image.getAttribute('alt')).length > 15);
            assert.equal(await image.evaluate(img => getComputedStyle(img).objectFit), 'contain');
            assert.equal(await link.getAttribute('href'), links[i]);
            assert.equal(await link.getAttribute('target'), '_blank');
            assert.match(await link.getAttribute('rel'), /noopener/);
            await link.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
            assert.equal(await link.evaluate(node => node === document.activeElement), true);
            assert.notEqual(await link.evaluate(node => getComputedStyle(node).outlineStyle), 'none');
          }
          assert.match(await page.locator('.tool-card').last().innerText(), /12.inch|12 in/);
          assert.doesNotMatch(await page.locator('.tool-card').last().innerText(), /6.inch/);
          if (width < 1101) await page.locator('.menu-toggle').click();
          await page.locator('.nav-about > summary').press('Enter');
          await page.locator('.nav-about a[href="/tools-of-the-trade"]').waitFor({ state: 'visible' });
          await page.locator('.nav-about > summary').press('Escape');
          if (width < 1101) { await page.keyboard.press('Escape'); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false'); }
          if (width < 768) {
            await page.locator('[data-navigation-toggle]').click();
            assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
            await page.locator('.nav-about > summary').press('Enter');
            await page.locator('.nav-about a[href="/tools-of-the-trade"]').press('Enter');
            assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
          }
          await page.locator('h1').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/tools-of-the-trade-${name}-${width}.png`, fullPage: true });
          assert.deepEqual(errors, []);
          console.log(`PASS ${name}/${width}: assessment above products; four verified links and photos; keyboard; responsive layout; both mobile navigation controls where present; no writes.`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(writes, 0);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
