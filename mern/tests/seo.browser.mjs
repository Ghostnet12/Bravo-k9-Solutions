import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import app from '../server/app.js';
import { PAGE_METADATA, publicRoutes, canonicalUrl } from '../shared/page-metadata.js';
import { SERVICES } from '../shared/catalog.js';
const server = express().use(app).listen(0, '127.0.0.1');
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
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', route => {
          const path = new URL(route.request().url()).pathname;
          const fixtures = {
            '/api/config': { connected: true, services: SERVICES }, '/api/auth/me': { user: null, services: [] }, '/api/team': { team: [] },
            '/api/proof-videos': { clips: [], nextCursor: null }, '/api/hero-videos': { clips: [], nextCursor: null },
            '/api/reviews': { reviews: [], average: 0, count: 0 }, '/api/site-images': { images: {} }, '/api/team/schedules': { schedules: [] }, '/api/lessons': { lessons: [] },
          };
          return route.fulfill({ json: fixtures[path] || {} });
        });
        await page.goto(origin);
        const cards = page.locator('.facebook-recommendations article');
        assert.equal(await cards.count(), 6);
        const justine = cards.filter({ hasText: 'Justine Harty West' });
        assert.equal(await justine.count(), 1);
        assert.equal(await justine.locator('small').innerText(), 'Facebook comment');
        assert.equal(await justine.locator('.review-full blockquote p').textContent(), "They do an awesome job! We highly recommend what they did for our adoptive Star girl. We love her. 🥰 Can't thank them enough! ⭐⭐⭐⭐⭐");
        for (const card of await cards.all()) {
          const original = await card.locator('.review-full blockquote').textContent();
          assert.equal(await card.locator('.review-full blockquote').isVisible(), false);
          await card.getByText('Read full review', { exact: true }).click();
          await card.locator('.review-excerpt').waitFor({state:'hidden'});
          assert.equal((await card.locator('.review-full blockquote').innerText()).trim(), original.trim());
          await card.getByText('Show less', { exact: true }).click();
          assert.ok(await card.locator('.review-excerpt').isVisible());
        }
        if (width === 390) {
          await page.goto(origin);
          const price = page.locator('.cinema-training-card .cinema-price');
          await price.waitFor();
          assert.match(await price.innerText(), /\$200/);
          assert.match(await page.locator('.cinema-hero .cinema-eyebrow').innerText(), /Aberdeen/i);
          const cta = page.locator('.cinema-hero').getByRole('link', { name: /Book training/ });
          const box = await cta.boundingBox();
          assert.ok(box && box.y >= 0 && box.y + box.height <= 900, 'booking action fits in initial mobile viewport');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/mobile-home-polish-${name}.png` });
        }
        await page.goto(`${origin}/dog-training?utm_source=fixture`);
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
        assert.equal((await page.goto(origin + '/missing-bravo-page')).status(), 404);
        await page.getByRole('heading', { level: 1, name: 'That page wandered off.' }).waitFor();
        assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`PASS ${name} ${width}: readable HTML, mobile layout, FAQs, booking links, navigation and metadata`);
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
