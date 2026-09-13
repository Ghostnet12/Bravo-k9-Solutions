import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const clientId = 'cccccccccccccccccccccccc', now = DateTime.now().setZone('America/Chicago'), date = now.toISODate();
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) for (const access of ['owner', 'admin', 'staff']) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700 }), page = await context.newPage();
        const operator = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture Operator', role: access === 'staff' ? 'staff' : 'owner', isPrimaryOwner: access === 'owner' };
        let activeUser = operator, client, acceptedReplacement = false, createdBody, lastLogin, replacementCalls = 0, scheduleReads = 0;
        let temporaryPassword = 'Isolated-temporary-password-123!'; const ownPassword = 'Isolated-client-chosen-password-456!';
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', dialog => acceptedReplacement ? dialog.accept() : dialog.dismiss());
        await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.fixtureCopiedText = text; } }, configurable: true }));
        const membership = { active: true, enabled: true, manual: true, revision: 1, startsAt: now.toISO(), endsAt: now.plus({ months: 1 }).toISO() };
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname, method = route.request().method(); let json = {}, status = 200;
          if (path === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['10:00'] } };
          else if (path === '/api/auth/me') json = { user: activeUser, services: activeUser === client && !client.mustChangePassword ? ['training', 'online'] : [], membership: activeUser === client && !client.mustChangePassword ? membership : { active: false } };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/admin') json = { role: operator.role, team: [operator], bookings: [], inbox: [], blocks: [], settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['10:00'] } };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/membership-status') json = { remindersConfigured: true, automaticPlans: 0 };
          else if (path === '/api/admin/memberships') json = { memberships: client ? { [clientId]: membership } : {} };
          else if (path === '/api/admin/users' && method === 'POST') {
            createdBody = route.request().postDataJSON();
            client = { id: clientId, _id: clientId, name: createdBody.name, email: createdBody.email || undefined, dogName: createdBody.dogName, role: 'member', mustChangePassword: true };
            json = { user: client, membership, temporaryPassword, temporaryPasswordExpiresAt: now.plus({ days: 7 }).toISO() };
          } else if (path === '/api/admin/users') json = { users: client ? [client] : [] };
          else if (path === '/api/admin/clients') json = { clients: client ? [client] : [] };
          else if (path.endsWith('/temporary-password')) {
            assert.equal(route.request().postDataJSON().confirmReplacement, true); replacementCalls++;
            temporaryPassword = 'Replacement-temporary-password-789!';
            json = { user: client, temporaryPassword, temporaryPasswordExpiresAt: now.plus({ days: 7 }).toISO() };
          } else if (path === '/api/auth/login') {
            lastLogin = route.request().postDataJSON(); assert.equal(lastLogin.password, temporaryPassword); activeUser = client; json = { user: client };
          } else if (path === '/api/auth/password-setup') {
            assert.deepEqual(route.request().postDataJSON(), { password: ownPassword }); client = { ...client, mustChangePassword: false }; activeUser = client; json = { user: client };
          } else if (path === '/api/auth/logout') { activeUser = null; json = { ok: true }; }
          else if (path === '/api/client-schedule') {
            scheduleReads++; assert.equal(client.mustChangePassword, false, 'No schedule is requested before choosing a password');
            json = { client: { id: clientId, name: client.name }, month: date.slice(0, 7), terms: [{ stripeId: 'fixture', serviceIds: ['training'], validFrom: membership.startsAt, validUntil: membership.endsAt, status: 'active' }], visits: [{ date, time: '10:00', service: 'training', dogName: client.dogName, bookingId: 'dddddddddddddddddddddddd', status: 'confirmed', paymentStatus: 'covered', trainer: 'David' }], trainingBookings: [] };
          } else if (path === '/api/reviews/mine') json = { review: null };
          else if (path === '/api/bookings') json = { bookings: [] };
          await route.fulfill({ status, json });
        });
        try {
          await page.goto(`${origin}/admin?tab=people`);
          await page.getByRole('button', { name: 'People & access', exact: true }).waitFor();
          await page.locator('.add-client-panel > summary').click(); const form = page.locator('.add-client-panel');
          await form.getByLabel('Client name', { exact: true }).fill('New Fixture Client'); await form.getByLabel('Dog’s name', { exact: true }).fill('Gunner');
          if (access === 'admin') await form.getByLabel('Email (optional)', { exact: true }).fill('fixture@example.test');
          await form.getByRole('button', { name: 'Create client & member', exact: true }).click();
          await form.getByLabel('Temporary password', { exact: true }).waitFor();
          assert.equal(createdBody.phone, ''); assert.equal(createdBody.address, '');
          assert.equal(await form.getByLabel('Temporary password', { exact: true }).inputValue(), temporaryPassword);
          await form.getByRole('button', { name: 'Copy temporary password', exact: true }).click();
          await form.getByText('Temporary password copied.', { exact: true }).waitFor(); assert.equal(await page.evaluate(() => window.fixtureCopiedText), temporaryPassword);
          await form.getByRole('button', { name: 'Copy sign-in instructions', exact: true }).click();
          await form.getByText('Sign-in instructions copied.', { exact: false }).waitFor();
          const copied = await page.evaluate(() => window.fixtureCopiedText); assert.match(copied, /New Fixture Client/); assert.match(copied, /bravounleashed.com\/account/); assert.ok(copied.includes(temporaryPassword));
          assert.equal(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]).includes('Isolated-temporary-password')), false);
          await page.reload(); if (access !== 'staff') await page.locator('.owner-person > summary').click({ position: { x: 8, y: 20 } });
          assert.equal(await page.getByLabel('Temporary password', { exact: true }).count(), 0);
          await page.getByRole('button', { name: 'Create new temporary password', exact: true }).click(); assert.equal(replacementCalls, 0);
          acceptedReplacement = true; await page.getByRole('button', { name: 'Create new temporary password', exact: true }).click();
          await page.getByLabel('Temporary password', { exact: true }).waitFor(); assert.equal(replacementCalls, 1);
          assert.equal(await page.getByLabel('Temporary password', { exact: true }).inputValue(), temporaryPassword);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/client-signin-staff-${engineName}-${access}-${width}.png`, fullPage: true });
          activeUser = null; await page.goto(`${origin}/account`);
          await page.getByLabel('Name or email', { exact: true }).fill(client.email || client.name);
          await page.getByLabel('Password', { exact: true }).fill(temporaryPassword);
          await page.locator('.account-auth form').getByRole('button', { name: 'Sign in', exact: true }).click();
          await page.getByRole('heading', { name: 'Create your password.', exact: true }).waitFor(); assert.equal(lastLogin.identifier, client.email || client.name);
          assert.equal(scheduleReads, 0);
          await page.goto(`${origin}/learn`); await page.getByRole('heading', { name: 'Create your password.', exact: true }).waitFor();
          await page.getByLabel('New password', { exact: true }).fill(ownPassword); await page.getByLabel('Confirm new password', { exact: true }).fill('Different-long-password-123!');
          await page.getByRole('button', { name: 'Save password & open schedule', exact: true }).click(); await page.getByText('The passwords do not match.', { exact: true }).waitFor();
          await page.getByLabel('Confirm new password', { exact: true }).fill(ownPassword);
          await page.getByRole('button', { name: 'Save password & open schedule', exact: true }).click();
          await page.getByRole('heading', { name: 'New Fixture Client’s schedule.', exact: true }).waitFor(); assert.ok(scheduleReads > 0);
          await page.locator('.saved-calendar button.has-visits').click(); await page.getByRole('heading', { name: /10:00 AM/ }).waitFor();
          await page.reload(); await page.getByRole('heading', { name: 'New Fixture Client’s schedule.', exact: true }).waitFor();
          assert.equal(await page.getByRole('heading', { name: 'Create your password.', exact: true }).count(), 0);
          activeUser = operator; await page.goto(`${origin}/admin?tab=people`); if (access !== 'staff') await page.locator('.owner-person > summary').click({ position: { x: 8, y: 20 } });
          assert.equal(await page.getByRole('button', { name: 'Create new temporary password', exact: true }).count(), 0);
          assert.deepEqual(errors, []); console.log(`${engineName} ${width} ${access}: create, copy, replace, name/email sign-in, required password setup and saved schedule passed`);
        } catch (error) { await page.screenshot({ path: `test-results/client-signin-failure-${engineName}-${access}-${width}.png`, fullPage: true }); throw error; }
        finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
