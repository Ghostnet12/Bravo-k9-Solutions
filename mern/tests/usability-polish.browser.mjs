import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const clientId = 'bbbbbbbbbbbbbbbbbbbbbbbb', staffId = 'aaaaaaaaaaaaaaaaaaaaaaaa', bookingId = 'cccccccccccccccccccccccc';
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const access of ['member', 'staff', 'administrator', 'owner']) {
        const role = access === 'administrator' ? 'owner' : access;
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage(); await page.clock.setFixedTime(new Date('2026-09-08T13:00:00Z'));
        let profileWrites = 0;
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        let user = { id: role === 'member' ? clientId : staffId, _id: staffId, name: 'Fixture Person', dogName: 'Gunner', role, isPrimaryOwner: access === 'owner' };
        const trainer = { id: staffId, _id: staffId, name: 'Trainer', role: 'staff' };
        const visit = { date: '2026-09-15', time: '10:00', service: 'training' };
        const booking = { _id: bookingId, dogName: 'Gunner', phone: '', address: '', serviceIds: ['training'], visits: [visit], status: 'confirmed', paymentStatus: 'covered', staffId, updatedAt: '2026-09-08T12:00:00Z', quote: { dueNowCents: 0, monthlyCents: 0, oneTimeCents: 0 }, userId: { _id: clientId, name: 'Fixture Client' } };
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname; let json = {};
          if (path === '/api/config') json = { connected: true, services: SERVICES, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/auth/me') json = { user, services: ['training'], subscriptions: [], membership: { active: true } };
          else if (path === '/api/auth/profile') {
            profileWrites++;
            if (profileWrites === 1) return route.fulfill({ status: 503, json: { error: 'Could not save. Please try again.' } });
            user = { ...user, ...route.request().postDataJSON() }; json = { user };
          }
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/team') json = { team: [trainer] };
          else if (path === '/api/bookings') json = { bookings: [booking] };
          else if (path === '/api/membership-terms') json = { terms: [] };
          else if (path === '/api/reviews/mine') json = { review: null };
          else if (path === '/api/admin') json = { role, bookings: [booking], team: [trainer], inbox: [], blocks: [], settings: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/users') json = { users: [] };
          else if (path === '/api/admin/clients') json = { clients: [{ _id: clientId, name: 'Fixture Client', dogName: 'Gunner' }] };
          else if (path === '/api/admin/membership-status') json = { remindersConfigured: true, automaticPlans: 0 };
          else if (path === '/api/admin/memberships') json = { memberships: {} };
          else if (path.startsWith('/api/admin/trainer-schedules/')) json = { schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'], overrides: [] }, team: { enabled: true }, today: '2026-09-08', maxDate: '2026-12-08' };
          else if (path === '/api/client-schedule') {
            await new Promise(resolve => setTimeout(resolve, 180));
            json = { client: { id: clientId, name: 'Fixture Client' }, terms: [{ stripeId: 'grant:test', serviceIds: ['training'], status: 'active', validFrom: '2026-09-01T05:00:00Z', validUntil: '2026-11-01T05:00:00Z' }], trainingBookings: [booking], visits: visit.date.startsWith(url.searchParams.get('month')) ? [{ ...visit, bookingId, dogName: 'Gunner', status: 'confirmed', paymentStatus: 'covered', trainer: 'Trainer' }] : [] };
          }
          else if (path === '/api/availability') {
            const first = DateTime.fromISO(url.searchParams.get('from')); json = { days: Array.from({ length: first.daysInMonth }, (_,i) => ({ date: first.plus({ days: i }).toISODate(), slots: ['10:00'], businessHours: ['10:00'] })) };
          }
          else if (route.request().method() !== 'GET') throw new Error(`Unexpected write: ${path}`);
          await route.fulfill({ json });
        });
        try {
          await page.goto(`${origin}/account`);
          await page.getByText('Your details', { exact: true }).click();
          const details = page.locator('details').filter({ has: page.getByText('Your details', { exact: true }) });
          await details.getByLabel('Dog’s name', { exact: true }).fill('Gunner updated');
          await details.getByRole('button', { name: 'Save profile', exact: true }).click();
          const feedback = page.getByRole('complementary', { name: 'Action result' });
          await feedback.getByRole('alert').waitFor();
          assert.equal(await details.getByLabel('Dog’s name', { exact: true }).inputValue(), 'Gunner updated');
          let rect = await feedback.boundingBox(); assert.ok(rect.y >= 0 && rect.y + rect.height <= 844);
          await feedback.getByRole('button', { name: 'Dismiss message' }).click();
          await details.getByRole('button', { name: 'Save profile', exact: true }).click();
          await feedback.getByText('Your profile is saved.', { exact: true }).waitFor();
          assert.equal(profileWrites, 2); rect = await feedback.boundingBox(); assert.ok(rect.y + rect.height <= 844);
          await page.screenshot({ path: `test-results/polish-save-${engineName}-${access}.png`, fullPage: false });
          await feedback.getByRole('button', { name: 'Dismiss message' }).click();
          if (role === 'member') {
            await page.getByRole('region', { name: 'Next visit' }).waitFor();
            await page.locator('.account-actions').getByRole('link', { name: 'My schedule', exact: true }).click();
          } else {
            await page.locator('.account-actions').getByRole('link', { name: 'Team schedule', exact: true }).click();
            const tabs = page.getByRole('navigation', { name: 'Desk sections' });
            await tabs.waitFor();
            for (const button of await tabs.getByRole('button').all()) { const r = await button.boundingBox(); assert.ok(r.x >= 0 && r.x + r.width <= 391); }
            await page.getByRole('navigation', { name: 'Schedule shortcuts' }).getByRole('button', { name: 'Credit days', exact: true }).click();
            assert.equal(await page.locator('#credit-client-days').getAttribute('open'), '');
            assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Credit days to a client');
            await page.getByRole('navigation', { name: 'Schedule shortcuts' }).getByRole('button', { name: 'My working hours', exact: true }).click();
            assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'My working schedule.');
            await page.getByRole('link', { name: 'Client schedule & PDF', exact: true }).click();
          }
          await page.locator('.saved-calendar').waitFor();
          await page.evaluate(() => window.scrollTo(0, 300));
          await page.getByLabel('Schedule month', { exact: true }).fill('2026-10');
          await page.getByRole('heading', { name: 'October 2026', exact: true }).waitFor();
          assert.ok(await page.evaluate(() => window.scrollY > 0), 'Month changes should not jump to the page top');
          await page.locator('main').getByRole('button', { name: 'Back', exact: true }).click();
          assert.equal(new URL(page.url()).pathname, role === 'member' ? '/account' : '/admin');
          await page.getByRole('button', { name: 'Menu', exact: true }).click();
          const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
          const workspace = await nav.locator('.nav-workspace').boundingBox(), explore = await nav.locator('.nav-explore').boundingBox();
          assert.ok(workspace.y < explore.y); assert.equal(await nav.getByRole('button').last().innerText(), 'Sign out');
          await page.screenshot({ path: `test-results/polish-menu-${engineName}-${access}.png`, fullPage: false });
          await nav.getByRole('link', { name: 'Account', exact: true }).press('Escape');
          assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'false');
          assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Menu');
          for (const width of [320, 1280, 1440, 1601, 1920]) {
            await page.setViewportSize({ width, height: 900 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}`);
            if (width >= 1601) assert.ok((await page.locator('.app-header').boundingBox()).height <= 90, 'Expanded desktop navigation stays on one row');
          }
          assert.deepEqual(errors, []);
          console.log(`${engineName} ${access}: visible save/error, retry, menu, task shortcuts, month/back navigation and responsive layouts passed`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
