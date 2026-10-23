import { readFile } from 'node:fs/promises';
import { renderSiteContent } from '../server/content-html.js';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import app from '../server/app.js';
import { PAGE_METADATA, publicRoutes, canonicalUrl } from '../shared/page-metadata.js';
import { SERVICES } from '../shared/catalog.js';
const home = renderSiteContent(await readFile(new URL('../client/dist/bravo-shell.html',import.meta.url),'utf8'), {}, undefined, undefined, DEFAULT_REVIEWS);
const server = express().get('/',(_req,res)=>res.type('html').send(home))
  .get('/api/live', (_req, res) => res.json({ sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() }))
  .use(app).listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try {
      const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      const raw = await plain.newPage();
      for (const [route] of publicRoutes()) {
        assert.equal((await raw.goto(origin + route)).status(), 200);
        assert.equal(await raw.locator('h1').count(), 1, route);
        assert.ok((await raw.locator('main').innerText()).length > 300, `${route} has useful text without JavaScript`);
        assert.equal(await raw.locator('link[rel="canonical"]').getAttribute('href'), canonicalUrl(route));
        if (route === '/') {
          const review = raw.locator('.facebook-recommendations article').first();
          await review.getByText('Read full review', { exact: true }).click();
          assert.ok(await review.locator('.review-full blockquote').isVisible(), 'full review expands without JavaScript');
          await review.getByText('Show less', { exact: true }).click();
          assert.equal(await review.locator('.review-full blockquote').isVisible(), false);
        }
      }
      await plain.close();
      for (const width of [390, 1348, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        const page = await context.newPage(), errors = [], navigationDiagnostics = [];
        let navigating = false;
        try {
        page.on('pageerror', error => {
          // Playwright #43120: WebKit reports a canceled same-origin poll as an
          // access-control diagnostic during document replacement. The failure
          // trace placed this 19ms after goto began. Keep that exact diagnostic
          // only during hard navigation; actual DOM errors/rejections still fail.
          if (name === 'webkit' && navigating && error.message.endsWith(`${new URL(origin).host}/api/live due to access control checks.`)) navigationDiagnostics.push({ message: error.message, url: page.url() });
          else errors.push(error.message);
        });
        await page.exposeFunction('recordSeoRuntimeError', message => errors.push(message));
        await page.addInitScript(() => {
          window.addEventListener('error', event => { if (event instanceof ErrorEvent) void window.recordSeoRuntimeError(event.error?.stack || event.message).catch(() => {}); });
          window.addEventListener('unhandledrejection', event => { void window.recordSeoRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {}); });
        });
        const navigate = async url => {
          let response;
          navigating = true;
          try { response = await page.goto(url); } finally { navigating = false; }
          const live = await page.evaluate(async () => {
            const result = await fetch('/api/live', { credentials: 'same-origin', cache: 'no-store' });
            const data = await result.json();
            return { status: result.status, sessions: Array.isArray(data.sessions), announcements: Array.isArray(data.announcements) };
          });
          assert.deepEqual(live, { status: 200, sessions: true, announcements: true });
          return response;
        };
        // Polling uses a real same-origin HTTP fixture, including on the new
        // document, rather than fulfilling an intercepted request at teardown.
        await page.route(/\/api\/(?!live(?:[/?]|$))/, route => {
          const path = new URL(route.request().url()).pathname;
          const fixtures = {
            '/api/config': { connected: true, services: SERVICES }, '/api/auth/me': { user: null, services: [] }, '/api/team': { team: [] },
            '/api/proof-videos': { clips: [], nextCursor: null }, '/api/hero-videos': { clips: [], nextCursor: null },
            '/api/reviews': { reviews: [], average: 0, count: 0, recommendations: DEFAULT_REVIEWS }, '/api/site-images': { images: {} }, '/api/team/schedules': { schedules: [] }, '/api/lessons': { lessons: [] },
          };
          return route.fulfill({ json: fixtures[path] || {} });
        });
        await navigate(origin);
        const cards = page.locator('.facebook-recommendations article');
        assert.equal(await cards.count(), 7);
        await page.locator('.facebook-recommendations-more > summary').click();
        // Reach the partly clipped last card directly, without visiting the
        // intervening cards. A single activation must not be undone by snapping.
        const last = cards.last();
        await last.getByText('Read full review', { exact: true }).click();
        await last.locator('.review-excerpt').waitFor({ state: 'hidden' });
        await last.getByText('Show less', { exact: true }).click();
        await last.locator('.review-excerpt').waitFor({ state: 'visible' });
        await last.locator('summary').press('Enter');
        await last.locator('.review-excerpt').waitFor({ state: 'hidden' });
        await last.locator('summary').press('Space');
        await last.locator('.review-excerpt').waitFor({ state: 'visible' });
        const justine = cards.filter({ hasText: 'Justine Harty West' });
        assert.equal(await justine.count(), 1);
        assert.equal(await justine.locator('small').innerText(), 'Facebook comment');
        assert.equal(await justine.locator('.review-full blockquote p').textContent(), "They do an awesome job! We highly recommend what they did for our adoptive Star girl. We love her. 🥰 Can't thank them enough! ⭐⭐⭐⭐⭐");
        for (const card of await cards.all()) {
          const original = await card.locator('.review-full blockquote').textContent();
          assert.equal(await card.locator('.review-full blockquote').isVisible(), false);
          await card.getByText('Read full review', { exact: true }).click();
          try {
            await card.locator('.review-excerpt').waitFor({state:'hidden'});
          } catch (error) {
            console.log('Review expansion diagnostic', await card.evaluate(node => ({
              author: node.querySelector('strong')?.textContent,
              open: node.querySelector('details')?.open,
              excerptDisplay: getComputedStyle(node.querySelector('.review-excerpt')).display,
              card: node.getBoundingClientRect().toJSON(),
              summary: node.querySelector('summary')?.getBoundingClientRect().toJSON(),
              railScroll: node.parentElement.scrollLeft,
              active: document.activeElement?.outerHTML,
            })));
            throw error;
          }
          assert.equal((await card.locator('.review-full blockquote').innerText()).trim(), original.trim());
          await card.getByText('Show less', { exact: true }).click();
          assert.ok(await card.locator('.review-excerpt').isVisible());
        }
        if (width === 390) {
          await navigate(origin);
          const price = page.locator('.conversion-price');
          await price.waitFor();
          assert.match(await price.innerText(), /\$200/);
          assert.equal(await page.locator('.cinema-hero .cinema-eyebrow').innerText(), 'TRUST. TRAIN. DEPLOY.');
          const cta = page.locator('.cinema-hero').getByRole('link', { name: /Book your first session/i });
          const box = await cta.boundingBox();
          assert.ok(box && box.y >= 0 && box.y + box.height <= 900, 'booking action fits in initial mobile viewport');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/mobile-home-polish-${name}.png` });
        }
        await navigate(`${origin}/dog-training?utm_source=fixture`);
        await page.getByRole('heading', { level: 1, name: 'Dog training in Aberdeen, SD.' }).waitFor();
        await page.getByText('Do you come to my home?', { exact: true }).click();
        assert.ok(await page.getByText('Yes. Bravo provides private mobile training', { exact: false }).isVisible());
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonicalUrl('/dog-training'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `test-results/seo-training-${name}-${width}.png`, fullPage: true });
        await page.getByRole('link', { name: 'two-trainer behavior assessment' }).click();
        await page.getByRole('heading', { level: 1, name: 'Dog behavior assessments in Aberdeen.' }).waitFor();
        await page.waitForFunction(expected => document.title === expected, PAGE_METADATA['/behavior-assessment'].title);
        assert.equal(await page.title(), PAGE_METADATA['/behavior-assessment'].title);
        const service = await page.locator('#bravo-structured-data').textContent();
        assert.ok(JSON.parse(service)['@graph'].some(item => item['@type'] === 'Service' && item.url === canonicalUrl('/behavior-assessment')));
        assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
        assert.equal(await page.getByRole('link', { name: 'Request a behavior assessment', exact: true }).getAttribute('href'), '/portal?program=aggression');
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await page.getByRole('heading', { level: 1, name: 'Dog training in Aberdeen, SD.' }).waitFor();
        await page.locator('footer').getByRole('link', { name: 'Your account', exact: true }).click();
        await page.waitForURL('**/account');
        await page.locator('meta[name="robots"][content*="noindex"]').waitFor({ state: 'attached' });
        assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
        assert.equal(await page.locator('#bravo-structured-data').count(), 0);
        assert.equal((await navigate(origin + '/missing-bravo-page')).status(), 404);
        await page.getByRole('heading', { level: 1, name: 'That page wandered off.' }).waitFor();
        assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS ${name} ${width}: readable HTML, mobile layout, FAQs, booking links, navigation and metadata`);
        } catch (error) {
          await page.screenshot({ path: `test-results/seo-failure-${name}-${width}.png`, fullPage: true });
          await context.tracing.stop({ path: `test-results/seo-failure-${name}-${width}.zip` });
          throw error;
        } finally {
          await writeFile(`test-results/seo-diagnostics-${name}-${width}.json`, JSON.stringify({ errors, navigationDiagnostics }, null, 2));
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
