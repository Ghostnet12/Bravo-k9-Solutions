import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390 });
        const page = await context.newPage(), errors = []; let printed = false, read = false;
        page.on('pageerror', error => errors.push(error.message));
        await page.exposeFunction('recordPrint', () => { printed = true; });
        await page.addInitScript(() => { window.print = () => window.recordPrint(); });
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()); let json = {};
          if (url.pathname === '/api/config') json = { connected: true, paymentsReady: true };
          else if (url.pathname === '/api/auth/me') json = { user: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture client', role: 'member' }, services: [] };
          else if (url.pathname === '/api/site-images') json = { images: {} };
          else if (url.pathname === '/api/notifications') json = { items: [{ id: 'term:fixture', body: 'Your membership expires tomorrow. Renew manually.', href: '/account', unread: !read }] };
          else if (url.pathname === '/api/notifications/read') { read = true; json = { ok: true }; }
          else if (url.pathname === '/api/client-schedule') { const month = url.searchParams.get('month'); json = { client: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture client' }, month, firstTrainingDay: '2026-09-21', terms: [], visits: month === '2026-09' ? [{ bookingId: 'bbbbbbbbbbbbbbbbbbbbbbbb', date: '2026-09-21', time: '10:00', dogName: 'Fixture Dog', service: 'training', status: 'confirmed', paymentStatus: 'paid', trainer: 'Fixture Trainer' }] : [] }; }
          await route.fulfill({ json });
        });
        await page.goto(`${origin}/schedule?month=2026-09`);
        await page.getByRole('heading', { name: 'September 2026' }).waitFor();
        assert.equal(await page.locator('.schedule-visit').count(), 1);
        await page.getByRole('button', { name: 'Print schedule', exact: true }).click(); await page.waitForFunction(() => !!window.recordPrint); assert.ok(printed);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `test-results/schedule-${name}-${width}.png`, fullPage: true });
        await page.emulateMedia({ media: 'print' }); assert.equal(await page.locator('.app-header').isVisible(), false); assert.equal(await page.locator('.schedule-visit').isVisible(), true); await page.screenshot({ path: `test-results/schedule-print-${name}-${width}.png`, fullPage: true }); await page.emulateMedia({ media: 'screen' });
        await page.getByLabel('Schedule month').fill('2026-10'); await page.getByText('No saved visits in this month.', { exact: false }).waitFor();
        if (width === 390) await page.getByRole('button', { name: /Menu/ }).click();
        await page.getByRole('button', { name: /Notifications/ }).filter({ hasText: 'Notifications' }).click();
        await page.getByRole('button', { name: 'Mark read', exact: true }).click();
        await page.getByRole('button', { name: 'Mark read', exact: true }).waitFor({ state: 'detached' });
        assert.ok(read); assert.deepEqual(errors, []);
        await context.close(); console.log(`${name} ${width}: schedule filtering, print, notification read and layout passed`);
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
