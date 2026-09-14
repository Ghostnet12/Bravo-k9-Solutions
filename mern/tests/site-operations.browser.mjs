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
    const browser = await engine.launch();
    try {
      for (const access of ['visitor', 'member', 'staff', 'administrator', 'owner', 'privacy']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        if (access === 'privacy') await context.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
        const page = await context.newPage(), events = [], jsErrors = [];
        page.on('pageerror', e => jsErrors.push(e.message));
        const role = access === 'administrator' ? 'owner' : ['visitor', 'privacy'].includes(access) ? null : access;
        const user = role ? { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Fixture person', dogName: 'Fixture dog', phone: '5551234567', role, isPrimaryOwner: access === 'owner' } : null;
        let reportReads = 0, bookingWrites = 0, sentHeaders;
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname; let json = {};
          if (path.startsWith('/api/telemetry/')) { events.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ status: 204 }); }
          if (path === '/api/config') json = { monitoringEnabled: true, connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/auth/me') json = { user, services: [], subscriptions: [], membership: { active: false } };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/team') json = { team: [] };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/trainers') json = { trainers: [] };
          else if (path === '/api/reviews' || path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/availability') json = { days: [] };
          else if (path === '/api/admin') json = { role, bookings: [], team: [], inbox: [], blocks: [], settings: { enabled: true, weekdays: [1,2,3,4,5], hours: ['10:00'] } };
          else if (path === '/api/bookings' && route.request().method() === 'POST') {
            bookingWrites++; sentHeaders = route.request().headers();
            json = { booking: { ...route.request().postDataJSON(), _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', status: 'requested', paymentStatus: 'unpaid', quote: { dueNowCents: 5000 } } };
          } else if (path === '/api/admin/site-health') {
            reportReads++;
            if (reportReads === 1) return route.fulfill({ status: 503, json: { error: 'Temporary reporting issue.' } });
            json = { checkedAt: new Date().toISOString(), totals: { visits: 20, started: 10, saved: 4, paid: 2 }, channels: [{ channel: 'search', visits: 20, started: 10, saved: 4, paid: 2 }], errors: [{ kind: 'request_timeout', area: 'schedule', source: 'browser', count: 2, lastSeen: new Date().toISOString() }] };
          } else if (route.request().method() !== 'GET' && path !== '/api/quote') throw new Error(`Unexpected write ${path}`);
          await route.fulfill({ json });
        });
        const authReady = page.waitForResponse(r => r.url().endsWith('/api/auth/me'));
        await page.goto(`${origin}/`);
        await page.getByRole('button', { name: 'Menu', exact: true }).waitFor();
        await authReady;
        // Let initial media/notification requests finish before this test forces
        // a full document navigation; WebKit cancels intercepted requests on unload.
        await page.waitForLoadState('networkidle');
        if (['visitor', 'member'].includes(access)) {
          await page.waitForFunction(() => !!sessionStorage.getItem('bravo-visit-v1'));
          const first = await page.evaluate(() => JSON.parse(sessionStorage.getItem('bravo-visit-v1')).token);
          await page.goto(`${origin}/portal?program=online&private=email@example.test`);
          await page.getByRole('heading', { name: 'Your visit details', exact: true }).waitFor();
          await page.waitForFunction(() => !!sessionStorage.getItem('bravo-visit-v1'));
          assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('bravo-visit-v1')).token), first);
          if (access === 'member') {
            await page.getByRole('button', { name: 'Save request • no charge', exact: true }).click();
            await page.getByRole('button', { name: 'Request saved', exact: true }).waitFor();
            assert.equal(bookingWrites, 1); assert.equal(sentHeaders['x-bravo-visit'], first);
          }
          assert.ok(events.some(e => e.body.stage === 'booking_started'));
          assert.equal(events.filter(e => /paid|saved/.test(e.body.stage || '')).length, 0);
          assert.doesNotMatch(JSON.stringify(events), /email@example|Fixture dog|5551234567|password/);
        } else {
          assert.equal(events.filter(e => e.path.endsWith('/visit')).length, 0);
          assert.equal(await page.evaluate(() => sessionStorage.getItem('bravo-visit-v1')), null);
        }
        if (access === 'owner') {
          await page.goto(`${origin}/admin?tab=health`);
          await page.getByText(/Temporary reporting issue/).waitFor();
          await page.getByRole('button', { name: 'Refresh report', exact: true }).click();
          await page.getByRole('heading', { name: 'Recent website errors', exact: true }).waitFor();
          await page.getByText('20.0%', { exact: true }).first().waitFor();
          assert.ok(await page.getByRole('button', { name: 'Website health', exact: true }).getAttribute('aria-pressed') === 'true');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: `test-results/site-health-${engineName}.png`, fullPage: true });
        }
        await page.waitForLoadState('networkidle');
        assert.deepEqual(jsErrors, [], `${engineName} ${access}`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
  console.log('Website monitoring mobile and conversion browser checks passed.');
} finally { server.close(); }
