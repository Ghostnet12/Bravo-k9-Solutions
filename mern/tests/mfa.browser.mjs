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
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try { for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } }), page = await context.newPage();
      const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture Owner', email: 'owner@example.test', role: 'owner', mfaEnabled: false };
      let active = true, enabled = false; const errors = [], secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', recovery = '11111111-22222222-33333333-44444444';
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname; let status = 200, json = {};
        if (path === '/api/config') json = { connected: true, services: SERVICES, paymentsReady: false };
        else if (path === '/api/auth/me') json = { user: active ? { ...user, mfaEnabled: enabled } : null, services: [], subscriptions: [], membership: { active: false } };
        else if (path === '/api/membership-terms') json = { terms: [] };
        else if (path === '/api/bookings') json = { bookings: [] };
        else if (path === '/api/notifications') json = { items: [] };
        else if (path === '/api/site-images') json = { images: {} };
        else if (path === '/api/auth/mfa') json = { available: true, enabled };
        else if (path === '/api/auth/mfa/enroll') { assert.deepEqual(route.request().postDataJSON(), { currentPassword: 'Fixture-owner-password!' }); json = { secret, token: 'a'.repeat(32), account: user.email }; }
        else if (path === '/api/auth/mfa/confirm') {
          const input = route.request().postDataJSON(); assert.equal(input.token, 'a'.repeat(32)); assert.equal(input.currentPassword, 'Fixture-owner-password!');
          if (input.code !== '123456') { status = 403; json = { error: 'Check the code in your authenticator app and try again.' }; }
          else { enabled = true; json = { recoveryCodes: [recovery] }; }
        } else if (path === '/api/auth/logout') { active = false; json = { ok: true }; }
        else if (path === '/api/auth/login') {
          const input = route.request().postDataJSON(); assert.equal(input.password, 'Fixture-owner-password!');
          if (!input.code) { status = 401; json = { error: 'Enter your authenticator code or a recovery code.', code: 'MFA_REQUIRED' }; }
          else if (input.code !== recovery) { status = 401; json = { error: 'Enter a fresh authenticator code or an unused recovery code.' }; }
          else { active = true; json = { user: { ...user, mfaEnabled: true } }; }
        }
        await route.fulfill({ status, json });
      });
      try {
        await page.goto(`${origin}/account`); await page.waitForLoadState('networkidle');
        const panel = page.getByRole('region', { name: 'Two-step verification' });
        await panel.getByLabel('Current password', { exact: true }).fill('Fixture-owner-password!'); await panel.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
        await panel.getByText(secret, { exact: true }).waitFor(); assert.equal(await panel.getByLabel('Current password', { exact: true }).inputValue(), '');
        await panel.getByLabel('Current password', { exact: true }).fill('Fixture-owner-password!'); await panel.getByLabel('Authenticator code', { exact: true }).fill('000000'); await panel.getByRole('button', { name: 'Confirm and enable' }).click(); await panel.getByRole('alert').waitFor(); assert.equal(enabled, false);
        await panel.getByLabel('Current password', { exact: true }).fill('Fixture-owner-password!'); await panel.getByLabel('Authenticator code', { exact: true }).fill('123456'); await panel.getByRole('button', { name: 'Confirm and enable' }).click();
        await panel.getByRole('heading', { name: 'Save your recovery codes' }).waitFor(); await panel.getByText(recovery, { exact: true }).waitFor(); assert.equal(await panel.getByText(secret, { exact: true }).count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: `test-results/mfa-recovery-${engineName}-${width}.png`, fullPage: true });
        await panel.getByRole('button', { name: 'I saved my recovery codes' }).click(); assert.equal(await panel.getByText(recovery, { exact: true }).count(), 0);
        await page.waitForLoadState('networkidle'); active = false; await page.reload(); await page.waitForLoadState('networkidle');
        await page.getByLabel('Name or email', { exact: true }).fill(user.email); await page.getByLabel('Password', { exact: true }).fill('Fixture-owner-password!'); await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
        const factor = page.getByLabel('Authenticator or recovery code', { exact: true }); await factor.waitFor(); assert.equal(active, false);
        await page.getByLabel('Name or email', { exact: true }).fill('other@example.test'); assert.equal(await factor.count(), 0);
        await page.getByLabel('Name or email', { exact: true }).fill(user.email); await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click(); await factor.waitFor();
        await page.getByRole('button', { name: 'Create account', exact: true }).click(); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); assert.equal(await factor.count(), 0);
        await page.getByLabel('Name or email', { exact: true }).fill(user.email); await page.getByLabel('Password', { exact: true }).fill('Fixture-owner-password!'); await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click(); await factor.waitFor();
        await factor.fill('000000'); await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByText('Enter a fresh authenticator code or an unused recovery code.', { exact: true }).waitFor(); assert.equal(active, false);
        await factor.fill(recovery); await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('heading', { name: 'Welcome, Fixture.' }).waitFor();
        assert.equal(active, true); assert.deepEqual(errors, []); console.log(`PASS MFA ${engineName}/${width}: enrollment, failed code, recovery visibility and two-step sign-in`);
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { server.close(); }
