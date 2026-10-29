import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const app = express(); app.use(express.static(dist));
app.get('/{*path}', async (req, res) => res.type('html').send(await readFile(`${dist}/${req.path === '/fci-support' ? 'fci-support' : 'bravo-shell'}.html`, 'utf8')));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [375, 390, 430, 768, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname;
          let json = { services: [], team: [], images: {}, reviews: [], schedules: [], clips: [], count: 0 };
          if (path === '/api/auth/me') json = { user: null, services: [] };
          if (path === '/api/site-ads') json = { revision: 0, settings: { autoplaySeconds: 7 }, ads: [{ id: 'fci-support-bravo', title: 'FCI Support', src: '/images/fci-official-identity.jpeg', creative: 'fci', link: '/fci-support', enabled: true }] };
          if (path === '/api/fci-updates') json = { items: Array.from({ length: 5 }, (_, index) => ({ title: `Official canine health announcement ${index + 1}`, url: `https://www.fci.be/en/News-${index + 1}.html`, date: '2026-10-06' })).concat([{ title: 'Unsafe link', url: 'javascript:alert(1)' }]), lastSuccessAt: new Date().toISOString(), stale: false };
          if (path === '/api/live') json = { sessions: [], announcements: [], availability: 'available' };
          if (path === '/api/site-banner') json = { revision: 0, alerts: [], settings: {} };
          if (path === '/api/site-content') json = { entries: {} };
          await route.fulfill({ json });
        });
        await page.goto(origin + '/fci-support');
        await page.locator('.fci-news-card').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('.fci-cards>a').count(), 4);
        assert.equal(await page.locator('.fci-cards svg[viewBox="0 0 24 24"][aria-hidden="true"]').count(), 4, 'resource icons remain sharp at any density');
        assert.match(await page.locator('.fci-hero').evaluate(el => getComputedStyle(el, '::before').backgroundImage), /fci-world-hero\.webp/);
        await page.locator('.fci-intro img').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const img = document.querySelector('.fci-intro img'); return img?.complete && img.naturalWidth === 512; });
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.equal(await page.locator('.fci-news-card').count(), 5);
        assert.equal(await page.getByText('Unsafe link').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name} ${width}: no overflow`);
        assert.equal(await page.locator('a a').count(), 0, 'no nested links');
        assert.equal(await page.locator('.fci-footer-address').evaluate(el => el.previousElementSibling.classList.contains('footer-facebook')), true);
        assert.match(await page.locator('.fci-footer-address').innerText(), /Place Albert 1er, 13/);
        const broken = await page.locator('.fci-page img, .fci-ad-creative img').evaluateAll(images => images.filter(i => i.complete && !i.naturalWidth).map(i => i.src));
        assert.deepEqual(broken, []);
        await page.getByRole('button', { name: 'Next FCI announcements' }).click();
        assert.ok(await page.locator('.fci-news-rail').evaluate(el => el.scrollLeft > 0));
        await page.locator('.fci-news-card').first().focus();
        assert.equal(await page.locator('.fci-news-card').first().evaluate(el => document.activeElement === el), true);
        await page.screenshot({ path: `test-results/fci-${name}-${width}.png`, fullPage: true });
        await page.locator('.fci-news-card').first().waitFor();
        await page.getByRole('link', { name: '← Back to Bravo' }).click();
        await page.waitForURL(origin + '/');
        const intro = page.locator('.home-fci-card');
        await intro.waitFor();
        assert.equal(await intro.getAttribute('href'), '/fci-support');
        await intro.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const img = document.querySelector('.home-fci-identity img'); return img?.complete && img.naturalWidth > 0; });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'homepage has no horizontal overflow');
        await page.screenshot({ path: `test-results/fci-home-${name}-${width}.png` });
        await intro.focus(); await page.keyboard.press('Enter');
        await page.waitForURL('**/fci-support');
        await page.locator('.fci-news-card').first().waitFor();
        await page.getByRole('link', { name: '← Back to Bravo' }).click();
        await page.waitForURL(origin + '/');
        const toggle = page.locator('.menu-toggle');
        if (await toggle.isVisible()) await toggle.click();
        const menuLink = page.locator('#bravo-navigation .nav-explore > a[href="/fci-support"]');
        assert.equal(await menuLink.count(), 1, 'one direct FCI menu link');
        await menuLink.click();
        await page.waitForURL('**/fci-support');
        if (await toggle.isVisible()) assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'menu closes after navigation');
        await page.locator('.fci-news-card').first().waitFor();
        await page.getByRole('link', { name: '← Back to Bravo' }).click();
        await page.waitForURL(origin + '/');
        assert.equal(await page.locator('.home-ad-dock').count(),0);
        const introLink = page.locator('.home-fci-card');
        await introLink.waitFor(); await introLink.focus(); await page.keyboard.press('Enter');
        await page.waitForURL('**/fci-support');
        await page.getByRole('heading', { name: 'GLOBAL STANDARDS. STRONGER DOGS.' }).waitFor();
        assert.deepEqual(errors, [], `${name} ${width}: browser errors`);
        console.log(`FCI ${name} ${width}: layout, branding, footer, safe news, keyboard and homepage introduction navigation passed`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
