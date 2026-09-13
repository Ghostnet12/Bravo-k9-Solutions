import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const clientId = 'bbbbbbbbbbbbbbbbbbbbbbbb', staffId = 'aaaaaaaaaaaaaaaaaaaaaaaa', bookingId = 'cccccccccccccccccccccccc';
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const roleName of ['member', 'staff', 'administrator', 'owner']) {
        const role = roleName === 'administrator' ? 'owner' : roleName;
        const context = await browser.newContext({ viewport: { width: roleName === 'owner' ? 1440 : 390, height: 844 } }), page = await context.newPage();
        await page.clock.setFixedTime(new Date('2026-09-08T13:00:00Z'));
        let beforeEnd = '2026-09-11T05:00:00.000Z', afterEnd = '2026-09-16T05:00:00.000Z', visits = [], saved;
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname; let json = {};
          if (path === '/api/config') json = { connected: true, services: SERVICES };
          else if (path === '/api/auth/me') json = { user: { id: role === 'member' ? clientId : staffId, role, name: roleName, isPrimaryOwner: roleName === 'owner' }, services: ['training'], membership: { active: true } };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/team') json = { team: [{ _id: staffId, name: 'Trainer', role: 'staff' }] };
          else if (path === '/api/client-schedule') json = {
            client: { id: clientId, name: 'Credited client' }, terms: [{ stripeId: 'grant:calendar', bookingId, serviceIds: ['training'], status: 'active', source: 'grant', creditedDays: 5, validFrom: '2026-08-11T05:00:00.000Z', validUntil: afterEnd }],
            dayCredits: [{ _id: 'saved-credit', termId: 'grant:calendar', days: 5, reason: 'Rain', beforeEnd, afterEnd, createdAt: '2026-09-08T12:00:00Z' }],
            trainingBookings: [{ _id: bookingId, dogName: 'Gunner', staffId, staffIds: [staffId], visits, termStartsAt: '2026-08-11T05:00:00.000Z', termEndsAt: afterEnd, updatedAt: '2026-09-08T12:00:00.000Z' }],
            visits: visits.filter(v => v.date.startsWith(url.searchParams.get('month'))).map(v => ({ ...v, bookingId, dogName: 'Gunner', status: 'confirmed', paymentStatus: 'covered', trainer: 'Trainer', staffId })),
          };
          else if (path === '/api/availability') {
            const first = DateTime.fromISO(url.searchParams.get('from'));
            json = { days: Array.from({ length: first.daysInMonth }, (_,i) => ({ date: first.plus({ days: i }).toISODate(), slots: ['10:00'], businessHours: ['10:00'], workingHours: ['10:00'], reservedTimes: [] })) };
          } else if (path === '/api/client-schedule/changes') { saved = route.request().postDataJSON(); visits = saved.additions.map(v => ({ ...v, service: 'training' })); json = { message: 'Schedule saved.' }; }
          else if (route.request().method() !== 'GET') throw new Error(`Unexpected write: ${path}`);
          await route.fulfill({ json });
        });
        try {
          const path = `/schedule?month=2026-09${role === 'member' ? '' : `&client=${clientId}`}`;
          await page.goto(origin + path);
          const grid = page.locator('.saved-calendar:not(.edit-calendar)');
          await page.getByText('5 credited membership days highlighted this month.', { exact: true }).waitFor();
          assert.equal(await grid.locator('.credited-day').count(), 5); assert.equal(await grid.locator('.has-visits').count(), 0);
          assert.deepEqual(await grid.locator('.credited-day strong').allTextContents(), ['11','12','13','14','15']);
          await grid.getByRole('button', { name: /Fri, Sep 11,.*credited membership day/ }).click();
          await page.getByText('Credited membership day. No visit booked yet', { exact: false }).waitFor();
          await page.screenshot({ path: `test-results/credited-calendar-${engineName}-${roleName}.png`, fullPage: true });
          await page.getByRole('button', { name: 'Add Days and Times', exact: true }).click();
          await page.getByText('Checking available times…').waitFor({ state: 'hidden' });
          const editor = page.locator('.edit-calendar'); assert.equal(await editor.locator('.credited-day').count(), 5);
          await editor.getByRole('button', { name: /Tue, Sep 15,.*credited membership day/ }).click();
          await page.getByRole('button', { name: '10:00 AM', exact: true }).click();
          await page.getByRole('button', { name: 'Save changes', exact: true }).click();
          await page.getByText('Schedule saved.', { exact: true }).waitFor();
          assert.equal(saved.additions[0].date, '2026-09-15');
          await grid.locator('.has-visits').first().waitFor();
          assert.equal(await grid.locator('.has-visits').count(), 1); assert.equal(await grid.locator('.credited-day').count(), 5);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          beforeEnd = '2026-10-01T05:00:00.000Z'; afterEnd = '2026-10-06T05:00:00.000Z'; visits = [];
          await page.reload(); await page.getByRole('button', { name: 'View credited days in October 2026' }).click();
          await page.getByText('5 credited membership days highlighted this month.', { exact: true }).waitFor();
          await grid.getByRole('button', { name: /Thu, Oct 1,.*credited membership day/ }).waitFor();
          assert.deepEqual(await grid.locator('.credited-day strong').allTextContents(), ['1','2','3','4','5']);
          assert.match(page.url(), /month=2026-10/); if (role !== 'member') assert.match(page.url(), new RegExp(`client=${clientId}`));
          assert.deepEqual(errors, []); console.log(`${engineName} ${roleName}: existing credits visible, 10th→15th, final-day booking and next-month navigation passed`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
