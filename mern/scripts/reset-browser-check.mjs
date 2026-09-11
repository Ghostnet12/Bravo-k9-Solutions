// Run against the exact local production build with synthetic API fixtures.
// Requires a disposable CI install of playwright; never logs in to production.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
const dist = path.resolve('client/dist');
const app = express(); app.use(express.static(dist)); app.get('/{*rest}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-artifacts', { recursive: true });
const ownerId = 'aaaaaaaaaaaaaaaaaaaaaaaa', clientId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const team = [{ _id: ownerId, name: 'Test Trainer', role: 'owner' }];
const settings = { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['09:00', '10:00', '11:00'], revision: 0 };
const client = { _id: clientId, name: 'Test Client', email: 'client@example.test', dogName: 'Test Dog', phone: '6055550100', address: '123 Test Street' };
const oldMessage = { _id: 'cccccccccccccccccccccccc', authorName: 'Test Client', role: 'member', body: 'OLD HISTORY MUST NOT RETURN', createdAt: new Date(Date.now() - 60000).toISOString() };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixtures(page, user = null, state = {}) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), endpoint = url.pathname.slice(4);
    let data = {};
    if (endpoint === '/config') data = { connected: true, paymentsReady: false, services: SERVICES, schedule: settings, timezone: 'America/Chicago' };
    else if (endpoint === '/auth/me') data = { user, services: [], membership: {} };
    else if (endpoint === '/availability') {
      const from = url.searchParams.get('from');
      data = { days: Array.from({ length: 14 }, (_, i) => { const date = new Date(`${from}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i); return { date: date.toISOString().slice(0, 10), slots: ['09:00', '10:00', '11:00', '14:00'] }; }) };
    } else if (endpoint === '/trainers') data = { trainers: [{ id: ownerId, name: 'Test Trainer', spotsRemaining: 5, limit: 5 }] };
    else if (endpoint === '/admin') data = { role: user.role, settings, bookings: [{ _id: 'dddddddddddddddddddddddd', userId: client, dogName: 'Test Dog', phone: client.phone, address: client.address, status: 'requested', paymentStatus: 'unpaid', serviceIds: ['training'], visits: [], dogCount: 1, quote: { dueNowCents: 20000 } }], blocks: [], inbox: [], team };
    else if (endpoint === '/admin/clients') data = { clients: [client] };
    else if (endpoint === '/admin/users') data = { users: [] };
    else if (endpoint === '/admin/memberships') data = { memberships: {} };
    else if (endpoint === '/admin/reviews') data = { reviews: [] };
    else if (endpoint === '/admin/services') data = { services: SERVICES };
    else if (endpoint === '/team') data = { team: [] };
    else if (endpoint === '/community') { data = { messages: state.cleared ? [] : [oldMessage] }; if (state.delay) await sleep(1600); }
    else if (endpoint === '/chat/reset') { state.cleared = true; data = { ok: true, mode: 'clear', clearedAt: new Date().toISOString() }; }
    else if (endpoint.includes('site-image')) data = { images: [], overrides: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 375, 390, 430]) {
        const context = await browser.newContext({ viewport: { width, height: 850 }, isMobile: true, hasTouch: true });
        const page = await context.newPage(); await fixtures(page);
        await page.goto(`${base}/portal`);
        await page.getByRole('button', { name: 'Find available days & times' }).click();
        await page.locator('.date-grid button').first().waitFor();
        for (const fontSize of ['100%', '125%']) {
          await page.evaluate(size => document.documentElement.style.fontSize = size, fontSize);
          const sizes = await page.locator('#choose-dates input[type="date"]').evaluateAll(inputs => inputs.map(input => ({ width: input.getBoundingClientRect().width, parent: input.parentElement.getBoundingClientRect().width })));
          assert.equal(sizes.length, 2);
          for (const size of sizes) assert.ok(size.width <= size.parent + 1, `${name} ${width} ${fontSize}: date field overflow ${JSON.stringify(size)}`);
        }
        await page.evaluate(() => document.documentElement.style.fontSize = '100%');
        const selected = page.locator('.date-grid button[aria-pressed="true"]');
        const first = page.locator('.date-grid button').first();
        await first.click(); assert.equal(await selected.count(), 1);
        await first.click(); assert.equal(await selected.count(), 0);
        for (let i = 0; i < 6; i++) await page.locator('.date-grid button').nth(i).click();
        assert.equal(await selected.count(), 6);
        await page.getByRole('button', { name: 'Reset schedule', exact: true }).click();
        await page.locator('.date-grid button').first().waitFor();
        assert.equal(await selected.count(), 0); assert.equal(await page.locator('.visit-row').count(), 0);
        assert.equal(await page.locator('.date-grid .available').count(), 14);
        await page.getByRole('button', { name: 'Make my schedule', exact: true }).click();
        assert.equal(await selected.count(), 4);
        await page.getByRole('button', { name: 'Reset schedule', exact: true }).click();
        await page.locator('.date-grid button').first().waitFor();
        assert.equal(await selected.count(), 0);
        await page.screenshot({ path: `test-artifacts/${name}-${width}-reset.png`, fullPage: true });
        console.log(`PASS ${name} ${width}px: date widths at 100/125%, tap-toggle, six manual dates, random schedule, reset preserves highlights`);
        await context.close();
      }
      for (const [role, primary] of [['staff', false], ['owner', false], ['owner', true]]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        await fixtures(page, { id: ownerId, name: 'Test Trainer', role, isPrimaryOwner: primary, email: 'trainer@example.test' });
        page.on('dialog', dialog => dialog.accept());
        await page.goto(`${base}/admin`);
        await page.getByLabel('Find a client or dog').fill('old filter');
        await page.locator('.staff-create summary').click();
        await page.getByLabel('Client name or email').fill('Test');
        await page.getByRole('button', { name: 'Find client', exact: true }).click();
        await page.getByLabel('Choose client', { exact: true }).selectOption(clientId);
        await page.getByRole('button', { name: 'Refresh & reset desk', exact: true }).click();
        await page.getByText('Desk selections, filters and unsaved forms reset.', { exact: false }).waitFor();
        assert.equal(await page.getByLabel('Find a client or dog').inputValue(), '');
        assert.equal(await page.getByLabel('Client name or email').inputValue(), '');
        assert.equal(await page.getByLabel('Choose client', { exact: true }).count(), 0);
        assert.equal(await page.locator('.admin-bookings article').count(), 1);
        console.log(`PASS ${name}: ${role}/${primary ? 'primary' : 'non-primary'} desk reset clears fields but preserves saved request`);
        await context.close();
      }
      const context = await browser.newContext({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true });
      const page = await context.newPage(), state = { delay: true, cleared: false };
      await fixtures(page, { id: clientId, name: 'Test Client', role: 'member', email: 'client@example.test' }, state);
      page.on('dialog', dialog => dialog.accept());
      await page.goto(`${base}/community`);
      await page.getByLabel('Your message', { exact: true }).fill('Discard this draft');
      await page.getByRole('button', { name: 'Refresh & clear history', exact: true }).click();
      await page.getByText('History and draft cleared for your account.', { exact: false }).waitFor();
      await sleep(2000);
      assert.equal(await page.getByText(oldMessage.body, { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Your message', { exact: true }).inputValue(), '');
      state.delay = false; await page.reload(); await sleep(400);
      assert.equal(await page.getByText(oldMessage.body, { exact: true }).count(), 0);
      console.log(`PASS ${name}: delayed pre-clear response cannot restore chat history; draft cleared; reload stays clear`);
      await context.close();
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
