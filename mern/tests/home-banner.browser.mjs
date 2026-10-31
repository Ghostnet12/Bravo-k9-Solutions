import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
        let role = null;
        const errors = [], bannerRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname;
          let json = { services: [], team: [], images: {}, reviews: [], schedules: [], clips: [], count: 0 };
          if (path === '/api/auth/me') json = { user: role ? { id: 'fixture', role, name: 'Fixture' } : null, services: [] };
          if (path === '/api/live') json = { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() };
          if (path.startsWith('/api/site-banner')) {
            bannerRequests.push(path);
            // Previously published settings must not bring the removed strip back.
            json = path.endsWith('/weather')
              ? { weather: { temperature: 63, description: 'Cloudy', observedAt: new Date().toISOString() } }
              : { revision: 1, alerts: ['Bravo fixture announcement'], settings: { motion: 'always' } };
          }
          await route.fulfill({ json });
        });
        try {
          for (const visitorRole of [null, 'member', 'staff', 'owner']) {
            role = visitorRole;
            await page.goto(origin); await page.waitForLoadState('networkidle');
            assert.equal(await page.locator('.home-status-banner, .home-routine-updates, .banner-digest').count(), 0, 'banner and updates panel stay removed for every visitor role');
            assert.equal(await page.getByText('Read every Bravo update', { exact: true }).count(), 0);
            assert.equal(await page.getByText('Bravo fixture announcement', { exact: true }).count(), 0);
            assert.ok(await page.locator('#workshops').evaluate(node => node.previousElementSibling.matches('.home-tools') && node.previousElementSibling.previousElementSibling.id === 'results'), 'results flow through Tools of the Trade into workshops with no empty banner slot');
            assert.equal(await page.locator('.conversion-trust a').count(), 4, 'hero navigation stays intact');
            assert.equal(await page.locator('#method .journey-tab').count(), 3, 'all training approach choices stay intact');
            assert.equal(await page.locator('#method .journey-panel').count(), 3, 'all three training steps remain available');
            assert.match(await page.locator('#training').innerText(), /\$200/, 'training pricing stays intact');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'removing the banner preserves the responsive layout');
            if (visitorRole === null) {
              await page.locator('#workshops').scrollIntoViewIfNeeded();
              await page.screenshot({ path: `test-results/banner-removed-${engineName}-${width}.png` });
            }
          }
          assert.deepEqual(bannerRequests, [], 'homepage no longer fetches banner announcements or weather');
          assert.deepEqual(errors, []);
          console.log(`PASS ${engineName} ${width}: no banner, updates panel or banner requests; adjacent sections, pricing, icons and approach preserved`);
        } catch (error) {
          await page.screenshot({ path: `test-results/banner-failure-${engineName}-${width}.png`, fullPage: true });
          await writeFile(`test-results/banner-failure-${engineName}-${width}.json`, JSON.stringify({ error: error.message, errors, bannerRequests, text: await page.locator('body').innerText() }, null, 2));
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
