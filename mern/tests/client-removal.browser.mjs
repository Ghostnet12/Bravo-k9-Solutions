import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const client = { _id: 'cccccccccccccccccccccccc', name: 'Current Client', email: 'current@example.test', role: 'member' };
const colleague = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Fixture Trainer', email: 'trainer@example.test', role: 'staff' };
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) for (const access of ['owner', 'admin', 'staff', 'member']) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700 }), page = await context.newPage();
        const role = access === 'admin' ? 'owner' : access;
        const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Signed In Person', role, isPrimaryOwner: access === 'owner' };
        let removed = false, attempts = 0, accept = false; const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', dialog => { assert.match(dialog.message(), /Remove Current Client\?/); assert.match(dialog.message(), /cancels remaining visits/); return accept ? dialog.accept() : dialog.dismiss(); });
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname; let json = {};
          if (path === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/auth/me') json = { user, services: [], membership: { active: false } };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/admin') json = { role, team: [user, colleague], bookings: [], inbox: [], blocks: [], settings: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/membership-status') json = { remindersConfigured: true, automaticPlans: 0 };
          else if (path === '/api/admin/memberships') json = { memberships: {} };
          else if (path === '/api/admin/users') json = { users: [user, colleague, ...removed ? [] : [client]] };
          else if (path === '/api/admin/clients') json = { clients: removed ? [] : [client] };
          else if (path === `/api/admin/clients/${client._id}` && route.request().method() === 'DELETE') {
            attempts++; assert.deepEqual(route.request().postDataJSON(), { confirmRemoval: true });
            if (attempts === 1) return route.fulfill({ status: 409, json: { error: 'This client changed. Refresh and try again.' } });
            removed = true; json = { ok: true, message: 'Client removed. Account access is disabled and remaining visits are cancelled.' };
          }
          return route.fulfill({ json });
        });
        try {
          await page.goto(`${origin}/admin?tab=people`);
          if (role === 'member') {
            await page.getByRole('heading', { name: 'Team access required.' }).waitFor();
            assert.equal(await page.locator('.client-trash-button').count(), 0);
          } else {
            const button = page.getByRole('button', { name: 'Remove client Current Client', exact: true }); await button.waitFor();
            assert.equal(await page.locator('.client-trash-button').count(), 1);
            assert.equal(await page.getByRole('button', { name: 'Remove client Fixture Trainer', exact: true }).count(), 0);
            const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.screenshot({ path: `test-results/client-trash-${access}-${engineName}-${width}.png`, fullPage: true });
            await button.click(); assert.equal(attempts, 0);
            if (role === 'owner') assert.equal(await page.locator('.owner-person').filter({ has: button }).getAttribute('open'), null);
            accept = true; await button.click(); await page.getByRole('alert').filter({ hasText: 'This client changed.' }).waitFor(); assert.equal(attempts, 1);
            assert.equal(await button.isVisible(), true);
            await button.focus(); await page.keyboard.press('Enter'); await button.waitFor({ state: 'detached' });
            assert.equal(attempts, 2); await page.getByText('Client removed. Account access is disabled and remaining visits are cancelled.', { exact: true }).waitFor();
            await page.reload(); await page.getByRole('heading', { name: role === 'staff' ? 'Clients.' : 'People & permissions.' }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'Remove client Current Client', exact: true }).count(), 0);
          }
          assert.deepEqual(errors, []); console.log(`${engineName} ${width} ${access}: trash visibility, confirmation, error recovery, keyboard removal and reload passed`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
