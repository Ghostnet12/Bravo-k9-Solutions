import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
import { manualMonthTerm } from '../shared/membership-terms.js';
import { JOINT_TRAINER_ID } from '../shared/trainers.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const david = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'David Northrop', role: 'owner' }, ashley = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Ashley Northrop', role: 'staff' };
const client = { _id: 'cccccccccccccccccccccccc', name: 'Current Client', email: 'current@example.test', role: 'member', dogName: 'Gunner' }, bookingId = 'dddddddddddddddddddddddd';
// Keep two available dates in view and 10 AM in the future regardless of the
// runner's wall clock. Past times must remain unavailable in production.
const now = DateTime.now().setZone('America/Chicago').startOf('month').plus({ days: 10, hours: 8 }), startDate = now.minus({ days: 5 }).toISODate();
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700 }), page = await context.newPage();
        await page.clock.setFixedTime(now.toJSDate());
        let membership = { revision: 0, enabled: false, manual: false }, booking = null, term = null, savedBody, calendarBody;
        const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept());
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname; let json = {};
          if (path === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['10:00'] } };
          else if (path === '/api/auth/me') json = { user: { ...david, isPrimaryOwner: true }, services: [], membership: { active: false } };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/admin') json = { role: 'owner', team: [david, ashley], bookings: [], inbox: [], blocks: [], settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['10:00'] } };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/membership-status') json = { remindersConfigured: true, automaticPlans: 0 };
          else if (path === '/api/admin/users') json = { users: [client] };
          else if (path === '/api/admin/memberships') json = { memberships: { [client._id]: membership } };
          else if (path === `/api/admin/memberships/${client._id}/training-setup`) {
            const repair = route.request().postDataJSON(); assert.equal(repair.trainingDogCount, 2); assert.equal(repair.startDate, undefined);
            booking = { _id: bookingId, dogName: 'Gunner', dogCount: repair.trainingDogCount, staffId: null, staffIds: [], visits: [], updatedAt: now.toISO(), termStartsAt: membership.startsAt, termEndsAt: membership.endsAt };
            json = { message: 'Training enabled for the saved membership dates.' };
          }
          else if (path === `/api/admin/memberships/${client._id}`) {
            savedBody = route.request().postDataJSON(); const dates = manualMonthTerm(savedBody.startDate);
            membership = { revision: membership.revision + 1, enabled: true, manual: true, startsAt: dates.validFrom.toISOString(), endsAt: dates.validUntil.toISOString(), trainingDogCount: savedBody.trainingDogCount, trainingBookingId: bookingId };
            term = { ...dates, stripeId: 'fixture-grant', serviceIds: ['training'], status: 'active', dogCount: savedBody.trainingDogCount };
            booking ||= { _id: bookingId, dogName: 'Gunner', staffId: null, staffIds: [], visits: [], updatedAt: now.toISO() };
            booking = { ...booking, dogCount: savedBody.trainingDogCount, termStartsAt: membership.startsAt, termEndsAt: membership.endsAt };
            json = { membership, message: 'Membership and covered training saved.' };
          } else if (path === '/api/team') json = { team: [david, ashley] };
          else if (path.endsWith('/assignment')) {
            assert.equal(route.request().postDataJSON().staffId, JOINT_TRAINER_ID);
            booking = { ...booking, staffId: david.id, staffIds: [david.id, ashley.id], trainerAcceptanceRequired: true }; json = { ok: true };
          } else if (path === '/api/availability') {
            const day = DateTime.fromISO(`${now.toFormat('yyyy-MM')}-01`);
            json = { enabled: true, days: Array.from({ length: day.daysInMonth }, (_, i) => ({ date: day.plus({ days: i }).toISODate(), slots: ['09:00', '10:00', '11:00', '14:00'], businessHours: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'], workingHours: ['09:00', '10:00', '11:00', '12:00', '14:00'], reservedTimes: ['12:00'] })) };
          } else if (path === '/api/client-schedule/changes') {
            calendarBody = route.request().postDataJSON(); booking = { ...booking, visits: calendarBody.additions.map(v => ({ ...v, service: 'training' })) }; json = { ok: true, message: 'Schedule saved. The client and Bravo team have been notified.' };
          } else if (path === '/api/client-schedule') json = { client: { id: client._id, name: client.name }, month: url.searchParams.get('month'), terms: term ? [term] : [], visits: (booking?.visits || []).map(v => ({ ...v, bookingId, dogName: 'Gunner', status: 'requested', paymentStatus: 'covered', trainer: 'David and Ashley' })), trainingBookings: booking ? [booking] : [] };
          return route.fulfill({ json });
        });
        try {
          // Expand using the disclosure area; the row also contains a removal button.
          await page.goto(`${origin}/admin?tab=people`); await page.locator('.owner-person > summary').click({ position: { x: 8, y: 20 } });
          const access = page.getByRole('region', { name: 'Member access for Current Client', exact: true });
          await access.getByLabel('Membership start date', { exact: true }).fill(startDate);
          await access.getByLabel('Dogs covered by this training membership', { exact: true }).fill('2');
          await access.getByRole('button', { name: 'Make Member', exact: true }).click();
          const setup = page.getByRole('region', { name: 'Training setup for Current Client', exact: true });
          const trainer = setup.getByLabel('Assigned trainer', { exact: true });
          await trainer.locator(`option[value="${JOINT_TRAINER_ID}"]`).waitFor({ state: 'attached' });
          assert.equal(savedBody.startDate, startDate); assert.equal(savedBody.trainingDogCount, 2);
          assert.deepEqual(await trainer.locator('option').allTextContents(), ['David Northrop', 'Ashley Northrop', 'David and Ashley']);
          await trainer.selectOption(JOINT_TRAINER_ID); await setup.getByRole('button', { name: 'Assign trainer', exact: true }).click();
          await setup.getByText('Trainer assigned. Each assigned trainer can now accept from their staff profile.', { exact: true }).waitFor();
          await setup.getByRole('button', { name: 'Add or Cancel Date', exact: true }).click();
          await setup.getByText('Checking available times…', { exact: true }).waitFor({ state: 'hidden' });
          await setup.getByRole('checkbox', { name: 'Open the selected weekend times when saving', exact: true }).uncheck();
          const available = setup.locator('.edit-calendar button:not([disabled])');
          assert.ok(await available.count() >= 2); await available.nth(0).click(); await available.nth(1).click();
          const ten = setup.getByRole('button', { name: '10:00 AM', exact: true });
          assert.equal(await ten.isEnabled(), true);
          assert.equal(await setup.getByRole('button', { name: '12:00 PM', exact: true }).isDisabled(), true);
          assert.equal(await setup.getByRole('button', { name: '1:00 PM', exact: true }).isDisabled(), true);
          await ten.click();
          await setup.getByLabel('Note to the client', { exact: true }).fill('Training days confirmed with the client.');
          await setup.getByRole('button', { name: 'Save changes', exact: true }).click();
          await setup.getByText('Schedule saved. The client and Bravo team have been notified.', { exact: true }).waitFor();
          assert.equal(calendarBody.bookingId, bookingId); assert.equal(calendarBody.additions.length, 2); assert.ok(calendarBody.additions.some(v => v.time === '10:00'));
          await setup.locator('.saved-calendar button.has-visits').first().waitFor();
          assert.equal(await setup.locator('.saved-calendar button.has-visits').count(), 2);
          await page.reload(); await page.locator('.owner-person > summary').click({ position: { x: 8, y: 20 } });
          await page.getByRole('region', { name: 'Training setup for Current Client', exact: true }).getByRole('button', { name: 'Add or Cancel Date', exact: true }).waitFor();
          assert.equal(await access.getByLabel('Dogs covered by this training membership', { exact: true }).inputValue(), '2');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
          await page.screenshot({ path: `test-results/make-member-${engineName}-${width}.png`, fullPage: true });
          booking = null;
          await page.goto(`${origin}/schedule?client=${client._id}`);
          await page.getByRole('heading', { name: 'Finish this client’s training setup' }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Add or Cancel Date', exact: true }).count(), 0);
          await page.getByLabel('Dogs covered', { exact: true }).fill('2');
          await page.getByRole('button', { name: 'Enable training & scheduling', exact: true }).click();
          await page.getByText('Assign trainer & accept client', { exact: true }).click();
          const recoveredTrainer = page.getByLabel('Assigned trainer', { exact: true });
          await recoveredTrainer.locator(`option[value="${JOINT_TRAINER_ID}"]`).waitFor({ state: 'attached' });
          await recoveredTrainer.selectOption(JOINT_TRAINER_ID);
          await page.getByRole('button', { name: 'Assign trainer', exact: true }).click();
          await page.getByText('Trainer assigned. Each assigned trainer can now accept from their staff profile.', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Add or Cancel Date', exact: true }).click();
          await page.getByText('Checking available times…', { exact: true }).waitFor({ state: 'hidden' });
          const recoveredDays = page.locator('.edit-calendar button:not([disabled])');
          await recoveredDays.nth(0).click(); await recoveredDays.nth(1).click();
          await page.getByRole('button', { name: '10:00 AM', exact: true }).click();
          await page.getByLabel('Note to the client', { exact: true }).fill('Existing member recovery test.');
          await page.getByRole('button', { name: 'Save changes', exact: true }).click();
          await page.getByText('Schedule saved. The client and Bravo team have been notified.', { exact: true }).waitFor();
          assert.equal(calendarBody.additions.length, 2); assert.deepEqual(errors, []);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          console.log(`${engineName} ${width}: legacy online-only schedule → recovered dates/dogs → joint trainer → saved calendar passed`);
          console.log(`${engineName} ${width}: Make Member → dates/dogs → joint trainer → batch calendar → saved schedule and reload passed`);
        } catch (error) {
          await page.screenshot({ path: `test-results/make-member-failure-${engineName}-${width}.png`, fullPage: true }); console.log(await page.locator('body').innerText()); throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
