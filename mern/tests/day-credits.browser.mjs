import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
import { creditedEnd } from '../shared/day-credits.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const staffId = 'aaaaaaaaaaaaaaaaaaaaaaaa', clientId = 'bbbbbbbbbbbbbbbbbbbbbbbb', bookingId = 'cccccccccccccccccccccccc';
const now = DateTime.now().setZone('America/Chicago').startOf('month').plus({ days: 10, hours: 8 });
const end = now.plus({ days: 6 }), start = now.minus({ days: 24 }), missed = now.plus({ days: 1 }).toISODate();
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const [roleName, width] of [['staff', 320], ['admin', 390], ['owner', 1440]]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } }), page = await context.newPage();
        await page.clock.setFixedTime(now.toJSDate());
        let role = roleName === 'staff' ? 'staff' : 'owner', savedBody, changesBody, credits = [];
        let term = { stripeId: 'grant:browser', serviceIds: ['training'], source: 'grant', status: 'active', autoPayDisabled: true, dogCount: 1, bookingId, validFrom: start.toUTC().toISO(), validUntil: end.toUTC().toISO() };
        let booking = { _id: bookingId, dogName: 'Gunner', visits: [{ date: missed, time: '10:00', service: 'training' }], cancelledVisits: [], staffId, staffIds: [staffId], termStartsAt: term.validFrom, termEndsAt: term.validUntil, updatedAt: now.toUTC().toISO() };
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname; let json = {};
          const person = { _id: staffId, id: staffId, role, name: 'Trainer', isPrimaryOwner: roleName === 'owner' };
          if (path === '/api/auth/me') json = { user: role === 'member' ? { id: clientId, role, name: 'Current client' } : person, services: ['training'], membership: { active: true } };
          else if (path === '/api/config') json = { connected: true, services: SERVICES, schedule: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['10:00', '11:00'] } };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/team') json = { team: [person] };
          else if (path === '/api/admin') json = { role, settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['10:00'] }, team: [person], bookings: [], blocks: [], inbox: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === `/api/admin/trainers/${staffId}/clients`) json = { clients: [] };
          else if (path === '/api/admin/clients') json = { clients: [{ _id: clientId, name: 'Current client', dogName: 'Gunner' }] };
          else if (path === '/api/client-schedule/credits') {
            savedBody = route.request().postDataJSON();
            const afterEnd = creditedEnd(term.validUntil, savedBody.days).toISOString();
            credits = [{ _id: 'credit-fixture', days: savedBody.days, termId: term.stripeId, reason: savedBody.reason, note: savedBody.note, missedDate: savedBody.missedDate, beforeEnd: term.validUntil, afterEnd, createdAt: now.toISO() }];
            term = { ...term, validUntil: afterEnd, creditedDays: savedBody.days };
            booking = { ...booking, termEndsAt: afterEnd, visits: [], cancelledVisits: booking.visits, updatedAt: now.plus({ seconds: 1 }).toUTC().toISO() };
            json = { ok: true, message: '1 day credited. The membership end date and client schedule are updated. No charge was made.' };
          } else if (path === '/api/client-schedule/changes') {
            changesBody = route.request().postDataJSON(); booking.visits = changesBody.additions.map(visit => ({ ...visit, service: 'training' })); json = { ok: true, message: 'Schedule saved.' };
          } else if (path === '/api/client-schedule') json = { client: { id: clientId, name: 'Current client' }, terms: [term], dayCredits: credits, trainingBookings: [booking], visits: [...booking.visits.map(v => ({ ...v, status: 'confirmed' })), ...booking.cancelledVisits.map(v => ({ ...v, status: 'cancelled' }))].map(v => ({ ...v, bookingId, dogName: 'Gunner', paymentStatus: 'covered', trainer: 'Trainer', staffId })) };
          else if (path === '/api/availability') {
            const first = DateTime.fromISO(url.searchParams.get('from'));
            json = { days: Array.from({ length: first.daysInMonth }, (_, i) => ({ date: first.plus({ days: i }).toISODate(), slots: ['10:00', '11:00'], businessHours: ['10:00', '11:00'], workingHours: ['10:00', '11:00'], reservedTimes: [] })) };
          }
          await route.fulfill({ json });
        });
        try {
          await page.goto(`${origin}/admin?tab=schedule`);
          const desk = page.locator('.staff-day-credits'); await desk.locator(':scope > summary').click();
          await desk.getByLabel('Client name or email').fill('Current'); await desk.getByRole('button', { name: 'Find client for credit' }).click();
          await desk.getByLabel('Client to credit').selectOption(clientId);
          const form = desk.locator('.membership-day-credits');
          await form.getByText('6 → 7 days remaining', { exact: false }).waitFor();
          await form.getByLabel('Missed training date (optional)').selectOption(missed);
          const note = form.getByLabel('Note to the client (optional)'); assert.equal(await note.getAttribute('required'), null);
          await form.getByRole('button', { name: 'Credit 1 day', exact: true }).click();
          await desk.getByText('1 day credited.', { exact: false }).waitFor();
          assert.equal(savedBody.days, 1); assert.equal(savedBody.note, ''); assert.equal(savedBody.missedDate, missed); assert.match(savedBody.requestKey, /^[a-f\d-]{36}$/);
          await desk.getByRole('link', { name: 'Open Current client’s schedule' }).click();
          await page.getByText('7 days remaining', { exact: true }).waitFor();
          assert.equal(await page.locator('.membership-day-credits').count(), 1);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/day-credits-${engineName}-${roleName}.png`, fullPage: true });
          role = 'member'; await page.goto(`${origin}/schedule`);
          await page.getByText('7 days remaining', { exact: true }).waitFor();
          assert.equal(await page.locator('.membership-day-credits').count(), 0);
          await page.getByText('Credited days history', { exact: true }).click(); await page.getByText('+1 day · Rain', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Add Days and Times', exact: true }).click();
          await page.getByText('Checking available times…').waitFor({ state: 'hidden' });
          const target = page.locator('.edit-calendar').getByRole('button', { name: new RegExp(`^${end.toFormat('ccc, LLL d')},`) });
          await target.click(); await page.getByRole('button', { name: '10:00 AM', exact: true }).click();
          await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('Schedule saved.', { exact: true }).waitFor();
          assert.equal(changesBody.additions[0].date, end.toISODate()); assert.equal(changesBody.note, ''); assert.deepEqual(errors, []);
          console.log(`${engineName} ${roleName}: credit without note, 6→7, client visibility, extra-day booking passed`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
