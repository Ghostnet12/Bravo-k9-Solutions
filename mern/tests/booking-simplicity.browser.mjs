// Synthetic same-origin APIs only: no real accounts, appointments or payments.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const trainerA = '111111111111111111111111', trainerB = '222222222222222222222222';
const team = [
  { id: trainerA, name: 'Fixture Trainer A', title: 'Private trainer', role: 'staff' },
  { id: trainerB, name: 'Fixture Trainer B', title: 'Private trainer', role: 'staff' },
];
let fixture;
const dayAfter = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const app = express(); app.use(express.json());
app.use('/api', (req, res) => {
  const path = req.path;
  if (req.method !== 'GET') fixture.writes.push({ path, body: req.body });
  let data = { images: {}, entries: {}, reviews: [], recommendations: [], count: 0, clips: [], items: [], alerts: [], revision: 0, bookings: [] };
  if (path === '/config') data = { connected: true, paymentsReady: false, services: SERVICES, lessonLibrary: { open: false }, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['09:00','10:00','14:00'] } };
  if (path === '/auth/me') data = { user: fixture.user, services: [], membership: { active: false } };
  // Account rendering can run between authentication and the booking handoff.
  // Match the real endpoint contract even when this fixture has no memberships.
  if (path === '/membership-terms') data = { terms: [] };
  if (path === '/team') data = { team };
  if (path === '/trainers') data = { trainers: team.map(person => ({ ...person, full: false, limit: 5, spotsRemaining: 5 })) };
  if (path === '/availability') {
    fixture.start ||= req.query.from;
    const slots = req.query.staffId === trainerB ? ['14:00'] : ['10:00', '09:00'];
    // Unavailable days and unordered results must not become the next opening.
    data = { days: [2, 0, 1].map(offset => ({ date: dayAfter(fixture.start, offset), slots: !offset || fixture.stale ? [] : slots })).filter(day => day.date >= req.query.from && day.date <= req.query.to) };
  }
  if (path === '/auth/register') {
    fixture.user = { id: 'fixture-client', role: 'member', name: req.body.name, phone: '6055550199', address: 'Old profile address' };
    data = { user: fixture.user };
  }
  if (path === '/auth/login') {
    fixture.user = { id: 'fixture-client', role: 'member', name: 'Fixture Client', phone: '6055550199', address: 'Saved profile address' };
    data = { user: fixture.user };
  }
  if (path === '/bookings' && req.method === 'POST') {
    data = { booking: { ...req.body, _id: 'fixture-booking', status: 'requested', paymentStatus: 'unpaid', quote: { dueNowCents: 20000 } } };
  }
  res.json(data);
});
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try { for (const width of [390, 1440]) {
      fixture = { user: null, writes: [], stale: false, start: null };
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
      const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      try {
        await page.goto(`${origin}/portal?program=training`);
        await page.getByLabel('Dog’s name', { exact: true }).fill('Quick Start Dog');
        await page.getByRole('button', { name: 'Choose a trainer →', exact: true }).click();
        await page.locator('.guided-trainer-cards button').filter({ hasText: 'Fixture Trainer A' }).click();
        await page.getByRole('heading', { name: 'Choose your first visit', exact: true }).waitFor();
        const opening = page.locator('.guided-next-opening');
        await opening.getByRole('button', { name: 'Use this time & review →', exact: true }).waitFor();
        assert.match(await opening.innerText(), /9:00 AM Central/);
        assert.equal(await page.locator('.date-grid button[aria-pressed=true]').count(), 0, 'an opening is offered, never silently selected');
        await fits(); await page.screenshot({ path: `test-results/simple-opening-${engineName}-${width}.png`, fullPage: true });
        await opening.getByRole('button', { name: 'Use this time & review →', exact: true }).click();
        await page.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
        assert.match(await page.locator('.guided-visit-summary').innerText(), /Fixture Trainer A[\s\S]*9:00 AM/);
        assert.equal(await page.getByRole('button', { name: 'Send my request • no charge', exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Create account & continue →', exact: true }).click();
        assert.equal(new URL(page.url()).pathname, '/portal', 'contact details are required before account handoff');
        await page.getByLabel('Contact phone', { exact: true }).fill('6055550100');
        await page.getByLabel('Visit address', { exact: true }).fill('123 Current Visit Street');
        await fits(); await page.screenshot({ path: `test-results/simple-review-${engineName}-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Create account & continue →', exact: true }).click();
        await page.getByLabel('Your name', { exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('mode'), 'register');
        assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).getAttribute('aria-pressed'), 'true', 'the selected account path is already open');
        assert.deepEqual(fixture.writes, [], 'choosing a visit and entering details creates no account or booking');
        await page.getByLabel('Your name', { exact: true }).fill('Fixture Client');
        await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
        await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
        await page.getByRole('button', { name: 'Create my account', exact: true }).click();
        await page.getByRole('button', { name: 'Send my request • no charge', exact: true }).waitFor();
        assert.equal(await page.getByLabel('Contact phone', { exact: true }).inputValue(), '6055550100');
        assert.equal(await page.getByLabel('Visit address', { exact: true }).inputValue(), '123 Current Visit Street', 'draft contact details win over old profile values');
        assert.deepEqual(fixture.writes.map(item => item.path), ['/auth/register'], 'registration does not submit the request');
        fixture.stale = true;
        await page.getByRole('button', { name: 'Send my request • no charge', exact: true }).click();
        await page.getByText('A selected time is no longer available.', { exact: false }).waitFor();
        assert.equal(fixture.writes.filter(item => item.path === '/bookings').length, 0, 'shortcut appointments receive the same fresh availability check');
        fixture.stale = false;
        await page.getByRole('navigation', { name: 'First visit steps', exact: true }).getByRole('button', { name: '2. Trainer', exact: true }).click();
        await page.locator('.guided-trainer-cards button').filter({ hasText: 'Fixture Trainer B' }).click();
        await opening.getByText(/2:00 PM Central/).waitFor();
        await opening.getByRole('button', { name: 'Use this time & review →', exact: true }).click();
        await page.getByRole('button', { name: 'Send my request • no charge', exact: true }).click();
        await page.getByText('Your appointment request has been submitted.', { exact: false }).waitFor();
        const bookings = fixture.writes.filter(item => item.path === '/bookings');
        assert.equal(bookings.length, 1);
        assert.equal(bookings[0].body.preferredTrainerId, trainerB);
        assert.deepEqual(bookings[0].body.visits, [{ date: dayAfter(fixture.start, 1), time: '14:00', service: 'training' }]);
        assert.equal(bookings[0].body.address, '123 Current Visit Street');
        assert.deepEqual(fixture.writes.map(item => item.path), ['/auth/register', '/quote', '/bookings']);
        // Returning customers can sign in with empty contact fields and use their profile.
        fixture = { user: null, writes: [], stale: false, start: null };
        await context.clearCookies();
        await page.evaluate(() => sessionStorage.clear());
        await page.goto(`${origin}/portal?program=training`);
        await page.getByLabel('Dog’s name', { exact: true }).fill('Returning Dog');
        await page.getByRole('button', { name: 'Choose a trainer →', exact: true }).click();
        await page.locator('.guided-trainer-cards button').filter({ hasText: 'Fixture Trainer A' }).click();
        await opening.getByRole('button', { name: 'Use this time & review →', exact: true }).click();
        assert.equal(await page.getByLabel('Contact phone', { exact: true }).inputValue(), '');
        await page.getByRole('button', { name: 'I have an account — sign in →', exact: true }).click();
        await page.getByLabel('Name or email', { exact: true }).fill('Fixture Client');
        assert.equal(new URL(page.url()).searchParams.get('mode'), 'login');
        await page.getByLabel('Password', { exact: true }).fill('fixture-only-password');
        await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.getByRole('button', { name: 'Send my request • no charge', exact: true }).waitFor();
        assert.equal(await page.getByLabel('Contact phone', { exact: true }).inputValue(), '6055550199');
        assert.equal(await page.getByLabel('Visit address', { exact: true }).inputValue(), 'Saved profile address');
        assert.equal(await page.getByLabel('Dog’s name', { exact: true }).inputValue(), 'Returning Dog');
        assert.deepEqual(fixture.writes.map(item => item.path), ['/auth/login'], 'sign-in uses saved details without submitting a request');
        // Keep the account mounted long enough to exercise its asynchronous
        // reads; a malformed fixture must not be hidden by a quick handoff.
        await page.goto(`${origin}/account`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('heading', { name: 'Welcome, Fixture.', exact: true }).waitFor();
        await page.getByText('No paid monthly membership yet.', { exact: true }).waitFor();
        assert.deepEqual(errors, []);
        console.log(`PASS ${engineName}/${width}: two explicit selection actions, guest contact details, direct registration, preserved draft, stale-time rejection, changed-trainer opening, one request, returning-customer saved details and no charge`);
      } catch (error) {
        await page.screenshot({ path: `test-results/simple-failure-${engineName}-${width}.png`, fullPage: true });
        throw error;
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
