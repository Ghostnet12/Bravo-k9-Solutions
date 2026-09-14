import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
import { manualMonthTerm } from '../shared/membership-terms.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const david = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'David Northrop', role: 'owner' }, ashley = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Ashley Northrop', role: 'staff' };
const clientId = 'cccccccccccccccccccccccc', bookingId = 'dddddddddddddddddddddddd', now = DateTime.now().setZone('America/Chicago');
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700 }), page = await context.newPage();
        let client, membership, booking, term, createdBody, calendarBody; const errors = [];
        page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept());
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname, method = route.request().method(); let json = {};
          if (path === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['09:00', '10:00'] } };
          else if (path === '/api/auth/me') json = { user: { ...david, isPrimaryOwner: true }, services: [], membership: { active: false } };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/admin') json = { role: 'owner', team: [david, ashley], bookings: [], inbox: [], blocks: [], settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['09:00', '10:00'] } };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/membership-status') json = { remindersConfigured: true, automaticPlans: 0 };
          else if (path === '/api/admin/memberships') json = { memberships: client ? { [clientId]: membership } : {} };
          else if (path === '/api/admin/users' && method === 'POST') {
            createdBody = route.request().postDataJSON(); const dates = manualMonthTerm(now.toISODate());
            client = { id: clientId, _id: clientId, name: createdBody.name, dogName: createdBody.dogName, phone: '', address: '', role: 'member', mustChangePassword: true };
            membership = { revision: 1, active: true, enabled: true, manual: true, startsAt: dates.validFrom.toISOString(), endsAt: dates.validUntil.toISOString(), trainingDogCount: 1, trainingBookingId: bookingId };
            term = { ...dates, stripeId: 'fixture-grant', serviceIds: ['training'], status: 'active', dogCount: 1 };
            booking = { _id: bookingId, dogName: client.dogName, dogCount: 1, staffId: null, staffIds: [], visits: [], updatedAt: now.toISO(), termStartsAt: membership.startsAt, termEndsAt: membership.endsAt };
            json = { user: client, membership, temporaryPassword: 'Isolated-temporary-browser-fixture!', temporaryPasswordExpiresAt: now.plus({days:7}).toISO() };
          } else if (path === '/api/admin/users') json = { users: client ? [client] : [] };
          else if (path === `/api/admin/users/${clientId}` && method === 'PATCH') { client = { ...client, ...route.request().postDataJSON() }; json = { user: client }; }
          else if (path === '/api/team') json = { team: [david, ashley] };
          else if (path.endsWith('/assignment')) {
            assert.equal(route.request().postDataJSON().staffId, david.id); booking = { ...booking, staffId: david.id, staffIds: [david.id], trainerAcceptanceRequired: true }; json = { ok: true };
          } else if (path === '/api/availability') {
            const day = DateTime.fromISO(`${url.searchParams.get('from').slice(0, 7)}-01`);
            json = { enabled: true, days: Array.from({ length: day.daysInMonth }, (_, i) => ({ date: day.plus({ days: i }).toISODate(), slots: ['09:00', '10:00'], businessHours: ['09:00', '10:00'], workingHours: ['09:00', '10:00'], reservedTimes: [] })) };
          } else if (path === '/api/client-schedule/changes') {
            calendarBody = route.request().postDataJSON(); booking = { ...booking, visits: calendarBody.additions.map(v => ({ ...v, service: 'training' })) }; json = { ok: true, message: 'Schedule saved.' };
          } else if (path === '/api/client-schedule') json = { client: { id: clientId, name: client?.name }, month: url.searchParams.get('month'), terms: term ? [term] : [], visits: (booking?.visits || []).map(v => ({ ...v, bookingId, dogName: client.dogName, status: 'requested', paymentStatus: 'covered', trainer: david.name })), trainingBookings: booking ? [booking] : [] };
          await route.fulfill({ json });
        });
        try {
          await page.goto(`${origin}/admin?tab=people`); await page.locator('.add-client-panel > summary').click();
          const panel = page.locator('.add-client-panel');
          assert.deepEqual(await panel.locator('form input:required').evaluateAll(inputs => inputs.map(input => input.name)), ['name', 'dogName']);
          await panel.getByLabel('Client name', { exact: true }).fill('Imported client'); await panel.getByLabel('Dog’s name', { exact: true }).fill('Gunner');
          await panel.getByRole('button', { name: 'Create client & member', exact: true }).click();
          await panel.getByRole('heading', { name: 'Client account created.', exact: true }).waitFor();
          assert.equal(createdBody.email, ''); assert.equal(createdBody.phone, ''); assert.equal(createdBody.address, ''); assert.equal(createdBody.membershipStartDate, '');
          assert.equal(await panel.getByLabel('Temporary password', { exact: true }).count(), 1);
          const setup = panel.getByRole('region', { name: 'Training setup for Imported client', exact: true }), trainer = setup.getByLabel('Assigned trainer', { exact: true });
          await trainer.locator(`option[value="${david.id}"]`).waitFor({ state: 'attached' });
          await trainer.selectOption(david.id); await setup.getByRole('button', { name: 'Assign trainer', exact: true }).click();
          await setup.getByText('Trainer assigned. Each assigned trainer can now accept from their staff profile.', { exact: true }).waitFor();
          await setup.getByRole('button', { name: 'Add or Cancel Date', exact: true }).click();
          await setup.getByText('Checking available times…', { exact: true }).waitFor({ state: 'hidden' });
          await setup.getByRole('checkbox', { name: 'Open the selected weekend times when saving', exact: true }).uncheck();
          await setup.locator('.edit-calendar button:not([disabled])').first().click();
          await setup.getByRole('button', { name: '10:00 AM', exact: true }).click();
          await setup.getByLabel('Note to the client', { exact: true }).fill('Agreed training time.'); await setup.getByRole('button', { name: 'Save changes', exact: true }).click();
          await setup.getByText('Schedule saved.', { exact: true }).waitFor(); assert.equal(calendarBody.additions[0].time, '10:00');
          await setup.locator('.saved-calendar button.has-visits').first().waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/simple-client-${engineName}-${width}.png`, fullPage: true });
          await page.reload(); await page.locator('.owner-person > summary').click({ position: { x: 8, y: 20 } });
          const person = page.locator('.owner-person'); assert.match(await person.locator(':scope > summary').innerText(), /MEMBER/);
          assert.equal(await person.getByRole('button', { name: 'Make Member', exact: true }).count(), 0);
          const email = person.getByLabel('Email', { exact: true }); assert.equal(await email.isEnabled(), true); await email.fill('later@example.test');
          await person.getByRole('button', { name: 'Save profile & access', exact: true }).click();
          await person.getByText('Profile and access saved.', { exact: false }).waitFor();
          assert.equal(client.email, 'later@example.test'); await person.getByRole('button', { name: 'Create new temporary password', exact: true }).waitFor();
          assert.deepEqual(errors, []); console.log(`${engineName} ${width}: two required names → member → trainer → 10 AM schedule → later email passed`);
        } catch (error) {
          await page.screenshot({ path: `test-results/simple-client-failure-${engineName}-${width}.png`, fullPage: true }); console.log(await page.locator('body').innerText()); throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
