import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { schedulePdf } from '../server/schedule-pdf.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const fixtureSchedule = month => ({ client: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture client' }, month, firstTrainingDay: '2026-09-21', terms: [], visits: month === '2026-09' ? [{ bookingId: 'bbbbbbbbbbbbbbbbbbbbbbbb', date: '2026-09-21', time: '10:00', dogName: 'Fixture Dog', service: 'training', status: 'confirmed', paymentStatus: 'paid', trainer: 'Fixture Trainer' }] : [] });
const app = express();
// Browser downloads may bypass Playwright page routing; serve a real PDF response.
app.get('/api/client-schedule', async (req, res) => {
  if (req.query.format === 'pdf') return res.type('application/pdf').set('Content-Disposition', 'attachment; filename="bravo-schedule.pdf"').send(await schedulePdf(fixtureSchedule(req.query.month)));
  res.json(fixtureSchedule(req.query.month));
});
app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700 });
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
          if (url.pathname === '/api/client-schedule' && url.searchParams.get('format') === 'pdf') return route.fulfill({ body: await schedulePdf(json), contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="bravo-schedule.pdf"' } });
          await route.fulfill({ json });
        });
        await page.goto(`${origin}/schedule?month=2026-09`);
        await page.getByRole('heading', { name: 'September 2026' }).waitFor();
        assert.equal(await page.locator('.schedule-visit').count(), 1);
        assert.equal(await page.locator('.saved-calendar button').count(), 30);
        await page.getByRole('button', {name:'Note to staff',exact:true}).click();
        await page.getByLabel('Note to all staff, administrators and owners').fill('Please call me about this visit.');
        await page.getByRole('button', {name:'Keep current visit',exact:true}).click();
        await page.getByRole('button', { name: 'Print schedule', exact: true }).click(); await page.waitForFunction(() => !!window.recordPrint); assert.ok(printed);
        await page.getByText('If the print menu did not open,', { exact: false }).waitFor();
        const monthBox = await page.getByLabel('Schedule month').boundingBox();
        const printBox = await page.getByRole('button', { name: 'Print schedule', exact: true }).boundingBox();
        assert.ok(printBox.y >= monthBox.y + monthBox.height, 'Print button must be below, not overlap, the month field');
        const downloadEvent = page.waitForEvent('download');
        await page.getByRole('link', { name: 'Download PDF', exact: true }).click();
        const download = await downloadEvent; const file = await readFile(await download.path());
        assert.equal(file.subarray(0, 5).toString(), '%PDF-'); assert.ok(file.length > 2000);
        await download.saveAs(`test-results/schedule-${name}-${width}.pdf`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `test-results/schedule-${name}-${width}.png`, fullPage: true });
        await page.emulateMedia({ media: 'print' }); assert.equal(await page.locator('.app-header').isVisible(), false); assert.equal(await page.locator('.schedule-visit').isVisible(), true); await page.screenshot({ path: `test-results/schedule-print-${name}-${width}.png`, fullPage: true }); await page.emulateMedia({ media: 'screen' });
        await page.getByLabel('Schedule month').fill('2026-10'); await page.getByText('No saved visits on this day.', { exact: false }).waitFor();
        if (width < 700) await page.getByRole('button', { name: /Menu/ }).click();
        await page.getByRole('button', { name: /Notifications/ }).filter({ hasText: 'Notifications' }).click();
        await page.getByRole('button', { name: 'Mark read', exact: true }).click();
        await page.getByRole('button', { name: 'Mark read', exact: true }).waitFor({ state: 'detached' });
        assert.ok(read); assert.deepEqual(errors, []);
        await context.close(); console.log(`${name} ${width}: schedule filtering, print, notification read and layout passed`);
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
