import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { createTransportFixture } from './transport-fixture.mjs';
const fixture = await createTransportFixture(), server = fixture.app.listen(0, '127.0.0.1');
await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        fixture.reset();
        const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage(), errors = [];
        // Install before application timers exist; replacing a running clock
        // leaves native intervals outside Playwright's control.
        await page.clock.install();
        page.on('pageerror', error => errors.push(error.message));
        // Map rendering belongs to OSM. Keep deterministic tests off that service.
        await page.route('https://www.openstreetmap.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Isolated map fixture</p>' }));
        try {
          await page.goto(`${origin}/transport?trip=${fixture.tripId}`);
          await page.getByRole('heading', { name: 'Every mile. Together.' }).waitFor();
          await page.screenshot({ path: `test-results/transport-guest-${engineName}-${width}.png`, fullPage: true });
          await page.getByRole('link', { name: 'Sign in to your trip', exact: true }).click();
          await page.getByRole('heading', { name: 'Your transport account.' }).waitFor();
          await page.getByLabel('Name or email', { exact: true }).fill('fixture@example.test');
          await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
          await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
          await page.getByRole('heading', { name: 'Gunner’s journey', exact: true }).waitFor();
          await page.getByText('Live vehicle location', { exact: true }).waitFor();
          assert.equal(new URL(page.url()).pathname, '/transport');
          assert.equal(new URL(page.url()).searchParams.get('trip'), fixture.tripId);
          assert.equal(await page.getByText('Bravo controls · Breeders & trips', { exact: true }).count(), 0);
          assert.ok(await page.locator('.tp-detail').getByText('Prairie Kennels', { exact: true }).isVisible());
          assert.equal(await page.locator('.tp-map').getAttribute('referrerpolicy'), 'no-referrer');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal overflow');
          await page.screenshot({ path: `test-results/transport-client-${engineName}-${width}.png`, fullPage: true });
          fixture.setMode('stale');
          const staleResponse = page.waitForResponse(response => response.url().endsWith(`/api/transport/trips/${fixture.tripId}`));
          await page.clock.fastForward(31000); await staleResponse;
          await page.getByText('Last reported location', { exact: true }).waitFor();
          assert.equal(await page.getByText('Live vehicle location', { exact: true }).count(), 0);
          fixture.setMode('forbidden');
          const revokedResponse = page.waitForResponse(response => response.url().endsWith(`/api/transport/trips/${fixture.tripId}`) && response.status() === 404);
          await page.clock.fastForward(31000); await revokedResponse;
          await page.getByRole('alert').filter({ hasText: 'Trip not found.' }).waitFor();
          assert.equal(await page.locator('.tp-map').count(), 0);
          assert.equal(await page.getByRole('heading', { name: 'Gunner’s journey', exact: true }).count(), 0);
          assert.deepEqual(errors, []);
        } catch (error) { await writeFile(`test-results/transport-client-failure-${engineName}-${width}.html`, await page.content()).catch(() => {}); await page.screenshot({ path: `test-results/transport-client-failure-${engineName}-${width}.png`, fullPage: true }).catch(() => {}); throw error; } finally { await context.close(); }

        fixture.reset();
        const ownerContext = await browser.newContext({ viewport: { width, height: 900 } });
        await ownerContext.addCookies([{ name: 'fixture-role', value: 'owner', url: origin }]);
        const ownerPage = await ownerContext.newPage(), ownerErrors = [];
        ownerPage.on('pageerror', error => ownerErrors.push(error.message));
        await ownerPage.route('https://www.openstreetmap.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Isolated map fixture</p>' }));
        try {
          await ownerPage.goto(`${origin}/transport`);
          await ownerPage.getByRole('heading', { name: 'Transport desk.' }).waitFor();
          await ownerPage.getByText('Bravo controls · Breeders & trips', { exact: true }).click();
          await ownerPage.getByLabel('Breeder / business name', { exact: true }).fill('North Star Kennels');
          await ownerPage.getByLabel('Breeder’s Bravo account email', { exact: true }).fill('breeder@example.test');
          await ownerPage.getByRole('button', { name: 'Add breeder', exact: true }).click();
          await ownerPage.getByRole('status').filter({ hasText: 'Breeder added.' }).waitFor();
          const form = ownerPage.locator('.tp-management .tp-trip-form');
          await form.getByLabel('Dog’s name', { exact: true }).fill('Biscuit');
          await form.getByRole('combobox', { name: 'Breeder', exact: true }).selectOption({ label: 'North Star Kennels' });
          await form.getByLabel('Client’s Bravo account email').fill('client@example.test');
          await form.getByLabel('Pickup city / state').fill('Aberdeen, SD');
          await form.getByLabel('Destination city / state').fill('Denver, CO');
          await form.getByRole('button', { name: 'Create transport', exact: true }).click();
          await ownerPage.getByRole('heading', { name: 'Biscuit’s journey', exact: true }).waitFor();
          await ownerPage.getByRole('button', { name: 'Update this trip', exact: true }).click();
          const edit = ownerPage.locator('.tp-detail .tp-trip-form');
          await edit.getByRole('combobox', { name: 'Trip status', exact: true }).selectOption('picked_up');
          await edit.getByLabel('Journey update', { exact: true }).fill('Picked up safely.');
          assert.equal(await edit.getByRole('checkbox').isEnabled(), false, 'unconfigured GPS cannot be enabled');
          await edit.getByRole('button', { name: 'Save trip update', exact: true }).click();
          await ownerPage.locator('.tp-status').filter({ hasText: 'Picked up' }).waitFor();
          assert.ok(fixture.writes().some(write => write.dogName === 'Biscuit' && write.clientEmail === 'client@example.test'));
          assert.equal(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await ownerPage.screenshot({ path: `test-results/transport-owner-${engineName}-${width}.png`, fullPage: true });
          assert.deepEqual(ownerErrors, []);
        } catch (error) { await ownerPage.screenshot({ path: `test-results/transport-owner-failure-${engineName}-${width}.png`, fullPage: true }).catch(() => {}); throw error; } finally { await ownerContext.close(); }
        console.log(`Transport guest, client, owner, stale and revoked views passed: ${engineName} ${width}px`);
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
