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
            '/api/reviews': { reviews: [], average: 0, count: 0 }, '/api/site-images': { images: {} }, '/api/team/schedules': { schedules: [] }, '/api/lessons': { lessons: [] },
          };
          return route.fulfill({ json: fixtures[path] || {} });
        });
        await page.goto(`${origin}/dog-training?utm_source=fixture`);
        await page.getByRole('heading', { level: 1, name: 'Dog training in Aberdeen, SD.' }).waitFor();
        await page.getByText('Do you come to my home?', { exact: true }).click();
        assert.ok(await page.getByText('Yes. Bravo provides private mobile training', { exact: false }).isVisible());
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonicalUrl('/dog-training'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `test-results/seo-training-${name}-${width}.png`, fullPage: true });
        await page.getByRole('link', { name: 'two-trainer behavior assessment' }).click();
        await page.getByRole('heading', { level: 1, name: 'Dog behavior assessments in Aberdeen.' }).waitFor();
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
