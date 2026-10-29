// Shared-browser privacy regression. Synthetic accounts and APIs only.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const first = { id: '111111111111111111111111', name: 'First Fixture', role: 'member', phone: '6055550101', address: 'FIRST_PRIVATE_ADDRESS' };
const second = { id: '222222222222222222222222', name: 'Second Fixture', role: 'member', phone: '6055550102', address: 'Second address' };
const privateDog = 'FIRST_PRIVATE_DOG', privateReview = 'FIRST_PRIVATE_REVIEW';
const booking = { _id: '333333333333333333333333', dogName: privateDog, serviceIds: ['training'], visits: [{ date: '2026-11-02', time: '09:00', service: 'training' }], status: 'requested', paymentStatus: 'covered', quote: { dueNowCents: 0 } };
let user = first;
const app = express(); app.use(express.json());
app.use('/api', (req, res) => {
  let json = { images: {}, entries: {}, reviews: [], recommendations: [], clips: [], items: [], team: [], terms: [], visits: [], revision: 0 };
  if (req.path === '/config') json = { connected: true, monitoringEnabled: false, paymentsReady: false, services: SERVICES, lessonLibrary: { open: false }, schedule: { enabled: false } };
  if (req.path === '/auth/me') json = { user, services: [], membership: { active: false } };
  if (req.path === '/auth/logout') { user = null; json = { ok: true }; }
  if (req.path === '/auth/login') { user = second; json = { user }; }
  if (req.path === '/bookings') {
    // Failure must not leave the previous customer's records on screen.
    if (user === second) return res.status(503).json({ error: 'Fixture account data unavailable.' });
    json = { bookings: user === first ? [booking] : [] };
  }
  if (req.path === '/reviews/mine') json = { review: user === first ? { rating: 4, body: privateReview } : null };
  if (req.path === '/live') json = { availability: 'available', sessions: [], announcements: [], serverTime: new Date().toISOString() };
  res.json(json);
});
app.use(express.static('client/dist'));
const html = await readFile('client/dist/bravo-shell.html', 'utf8');
app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try { for (const width of [390, 1440]) {
      user = first;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(`${origin}/account`);
        await page.locator('.booking-record').filter({ hasText: privateDog }).waitFor();
        assert.equal(await page.locator('#your-review textarea').inputValue(), privateReview);
        await page.locator('.menu-toggle').click();
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.getByLabel('Name or email', { exact: true }).fill('second@example.test');
        await page.getByLabel('Password', { exact: true }).fill('fixture-password-only');
        await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.getByRole('heading', { name: 'Welcome, Second.', exact: true }).waitFor();
        await page.getByText('Fixture account data unavailable.', { exact: true }).waitFor();
        assert.ok(!(await page.locator('body').textContent()).includes(privateDog), 'previous customer bookings must not survive account switching');
        assert.equal(await page.locator('#your-review textarea').inputValue(), '', 'previous customer review draft must be cleared');
        await page.getByText('Your details', { exact: true }).click();
        assert.equal(await page.getByLabel('Visit address', { exact: true }).inputValue(), second.address);
        assert.deepEqual(errors, []);
        console.log(`PASS ${name}/${width}: sign-out and second sign-in clear private records even when the new load fails`);
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
