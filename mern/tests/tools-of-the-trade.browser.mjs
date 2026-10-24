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
const links = ['https://a.co/d/0cWLPuAY','https://a.co/d/07p2Zd9F','https://a.co/d/08SLvEQC','https://a.co/d/08BVVJuV','https://a.co/d/0bMLFa5W'];
await mkdir('test-results', { recursive: true });
try {
  for (const [name,engine] of Object.entries({ chromium, webkit })) {
    if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name))continue;
    const browser = await engine.launch();
    try {
      const raw = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      assert.equal((await raw.goto(origin + '/tools-of-the-trade')).status(), 200);
      assert.equal(await raw.locator('.tool-card').count(), 5);
      assert.match(await raw.locator('.tools-assessment').innerText(), /We only use the tools your dog needs/);
      assert.equal(await raw.locator('.tool-purchase').first().getAttribute('href'), links[0]);
      await raw.goto(origin + '/');
      assert.equal(await raw.locator('.home-tools-card').getAttribute('href'), '/tools-of-the-trade');
      await raw.close();
      for (const width of [1280,1281]) {
        const boundary = await browser.newPage({ viewport: { width, height: 900 } });
        try {
          await boundary.goto(origin + '/tools-of-the-trade');
          assert.equal(await boundary.locator('.menu-toggle').isVisible(), true, 'same menu on both sides of the old desktop breakpoint');
          assert.ok(await boundary.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        } finally { await boundary.close(); }
      }
      for (const width of [360,390,768,1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(origin + '/tools-of-the-trade');
          await page.locator('.tools-assessment').waitFor();
          // Visit every photo: WebKit correctly leaves skipped, offscreen lazy images unloaded.
          for (const photo of await page.locator('.tool-photo img').all()) {
            await photo.scrollIntoViewIfNeeded();
            await photo.evaluate(img => img.decode());
            assert.ok(await photo.evaluate(img => img.complete && img.naturalWidth > 0));
          }
          assert.equal(await page.locator('h1').count(), 1);
          assert.match(await page.locator('.app-page-title').innerText(), /basic through advanced obedience courses and training/);
          assert.match(await page.locator('.tool-card').nth(3).innerText(), /budget-friendly alternative to the Dogtra option/);
          assert.equal(await page.title(), 'Tools of the Trade | Bravo K9 Solutions');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.match(await page.locator('.tools-assessment').innerText(), /Not every dog needs every tool/);
          assert.ok(await page.evaluate(() => document.querySelector('.tools-assessment').getBoundingClientRect().top < document.querySelector('.tool-card').getBoundingClientRect().top));
          assert.equal(await page.locator('.tool-card').count(), 5);
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
          assert.match(await page.locator('.tool-card').last().innerText(), /6-inch hand leash, ask Bravo for the exact item before ordering/);
          const collapsed = await page.locator('.menu-toggle').isVisible();
          assert.equal(await page.locator('#bravo-navigation a[href="/tools-of-the-trade"]').count(), 1);
          assert.equal(await page.locator('footer a[href="/tools-of-the-trade"]').count(), 1);
          const navReviews = page.locator('#bravo-navigation .nav-explore > a[href="/#reviews"]');
          assert.equal(await navReviews.count(), 1);
          assert.equal(await page.locator('.nav-about a[href="/#reviews"]').count(), 0);
          if (collapsed) {
            await page.locator('.menu-toggle').click();
            await navReviews.waitFor({ state: 'visible' });
            await navReviews.focus(); await page.keyboard.press('Escape');
            assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
            assert.ok(await page.locator('.menu-toggle').evaluate(node => node === document.activeElement));
          }
          if (width < 768) {
            await page.locator('[data-navigation-toggle]').click();
            assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
            await navReviews.waitFor({ state: 'visible' });
            await page.screenshot({ path: `test-results/tools-of-the-trade-service-navigation-menu-${name}-${width}.png` });
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
            assert.ok(await page.locator('[data-navigation-toggle]').evaluate(node => node === document.activeElement));
          }
          await page.locator('h1').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/tools-of-the-trade-${name}-${width}.png`, fullPage: true });
          // Direct Reviews navigation works from another page with a keyboard.
          if (collapsed) await page.locator('.menu-toggle').click();
          await navReviews.focus(); await navReviews.press('Enter');
          await page.waitForURL('**/#reviews');
          await page.locator('#reviews').waitFor();
          if (collapsed) assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
          // Stay in the customer navigation flow. A hard reload here tears down
          // the just-mounted homepage's requests and WebKit reports them as errors.
          await page.locator('header a[href="/"]').click();
          await page.waitForURL(origin + '/');
          const homeTools = page.locator('.home-tools-card');
          await homeTools.waitFor({ state: 'visible' });
          assert.equal(await homeTools.getAttribute('href'), '/tools-of-the-trade');
          assert.match(await homeTools.innerText(), /We assess your dog first/);
          assert.ok(await page.locator('.cinema-hero').evaluate(hero => hero.nextElementSibling.classList.contains('conversion-trust') && hero.nextElementSibling.nextElementSibling.id === 'training'));
          const order = await page.evaluate(() => ['#training','#reviews','#training-programs','#team','#method','#results','.home-tools','#first-visit-help','.cinema-close'].map(selector => document.querySelector(selector).getBoundingClientRect().top));
          assert.deepEqual([...order].sort((a,b) => a-b), order, 'membership and reviews lead into shared training choices');
          assert.equal(await page.locator('#results #dogs').count(), 1, 'photos and video share one proof section');
          assert.ok(await page.locator('#workshops').evaluate(node => node.previousElementSibling.classList.contains('home-tools')), 'workshops follow the equipment section without a banner or empty slot');
          assert.ok(await page.locator('.conversion-dog-terms').evaluate(node => {
            const button = node.parentElement.querySelector('.conversion-button');
            return node.getBoundingClientRect().bottom <= button.getBoundingClientRect().top;
          }), 'household pricing and renewal terms appear before the booking action');
          for (const id of ['training','training-programs']) {
            await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
            await page.screenshot({ path: `test-results/tools-of-the-trade-service-navigation-${id}-${name}-${width}.png` });
          }
          if (width < 768) {
            // A customer can jump to Services from another route, then return to
            // the same section again after scrolling, without a hidden heading.
            await page.locator('footer a[href="/tools-of-the-trade"]').click();
            await page.waitForURL('**/tools-of-the-trade');
            await page.locator('.mobile-home-nav a[href="/#training-programs"]').click();
            await page.waitForURL('**/#training-programs');
            await page.waitForFunction(() => {
              const top = document.getElementById('training-programs')?.getBoundingClientRect().top;
              return top >= 74 && top <= 150;
            });
            await page.locator('#method').evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
            await page.locator('.mobile-home-nav a[href="/#training-programs"]').click();
            const target = page.locator('#training-programs');
            assert.ok(await target.evaluate(node => node === document.activeElement));
            const top = await target.evaluate(node => node.getBoundingClientRect().top);
            assert.ok(top >= 74 && top <= 150, `Services anchor clears header: ${top}`);
          }
          await homeTools.scrollIntoViewIfNeeded();
          await homeTools.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
          assert.ok(await homeTools.evaluate(node => node === document.activeElement));
          assert.notEqual(await homeTools.evaluate(link => getComputedStyle(link).outlineStyle), 'none');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/tools-of-the-trade-entry-${name}-${width}.png` });
          await homeTools.press('Enter');
          await page.locator('.tools-assessment').waitFor();
          assert.equal(new URL(page.url()).pathname, '/tools-of-the-trade');
          assert.deepEqual(errors, []);
          console.log(`PASS ${name}/${width}: five products preserved; Tools present in shared menu; direct Reviews; both mobile toggles; membership and reviews first; repeatable Services shortcut; keyboard navigation; responsive layout; no writes.`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(writes, 0);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
