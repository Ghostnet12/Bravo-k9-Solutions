import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = [], writes = [];
        page.on('pageerror', error => errors.push(error.message));
        const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture Owner', role: 'owner', isPrimaryOwner: true };
        let client = { _id: 'cccccccccccccccccccccccc', name: 'Fixture Client', email: 'client@example.test', role: 'member', blocked: false };
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname; let json = {};
          if (path === '/api/config') json = { connected: true, services: SERVICES, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/auth/me') json = { user, services: [], membership: { active: false } };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/admin') json = { role: 'owner', team: [], bookings: [], inbox: [], blocks: [], settings: { weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/admin/users') json = { users: [client] };
          else if (path === '/api/admin/memberships') json = { memberships: {} };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === `/api/admin/users/${client._id}` && route.request().method() === 'PATCH') {
            const body = route.request().postDataJSON(); writes.push(body);
            if (body.role && body.currentPassword !== 'Owner-fixture-password-2026!') return route.fulfill({ status: 403, json: { error: 'Confirm your current owner password.' } });
            const { currentPassword, confirmOwnerAccess, ...fields } = body;
            client = { ...client, ...fields }; json = { user: client };
          }
          return route.fulfill({ json });
        });
        try {
          await page.goto(`${origin}/admin?tab=people`);
          const card = page.locator('.owner-person').filter({ hasText: 'Fixture Client' });
          await card.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
          await card.getByLabel('Phone', { exact: true }).fill('6055550100');
          await card.getByRole('button', { name: 'Save profile & access', exact: true }).click();
          await card.getByText(/Profile and access saved/).waitFor();
          assert.equal(writes.length, 1); assert.equal(writes[0].currentPassword, undefined);
          await card.getByLabel(/^Work permissions/).selectOption('staff');
          await card.getByRole('button', { name: 'Save profile & access', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Confirm access change: Fixture Client', exact: true });
          await dialog.waitFor(); assert.equal(writes.length, 1);
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          assert.equal(writes.length, 1);
          await card.getByRole('button', { name: 'Save profile & access', exact: true }).click();
          const input = dialog.getByLabel('Your current owner password', { exact: true });
          assert.equal(await input.getAttribute('type'), 'password');
          await input.fill('wrong-fixture-password'); await input.press('Enter');
          await dialog.getByRole('alert').waitFor(); assert.equal(client.role, 'member');
          assert.equal(await input.inputValue(), '');
          assert.ok(await dialog.evaluate(el => el.getBoundingClientRect().width <= innerWidth));
          await page.screenshot({ path: `test-results/access-confirm-${engineName}-${width}.png`, fullPage: true });
          await input.fill('Owner-fixture-password-2026!'); await input.press('Enter');
          await dialog.waitFor({ state: 'hidden' });
          await card.getByText(/Profile and access saved/).waitFor();
          assert.equal(client.role, 'staff'); assert.equal(writes.length, 3);
          assert.equal(await page.locator('dialog[aria-label="Confirm access change: Fixture Client"] input[name="currentPassword"]').inputValue(), '');
          assert.deepEqual(errors, []);
          console.log(`${engineName}/${width}: profile edit, cancellation, denied confirmation, cleared password and successful promotion passed`);
        } catch (error) { await page.screenshot({path:'test-results/access-debug.png',fullPage:true}); throw error; } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
