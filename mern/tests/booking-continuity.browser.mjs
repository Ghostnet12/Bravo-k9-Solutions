// Only synthetic, same-origin APIs. Never contacts Bravo, Stripe or recipients.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const trainerId = '111111111111111111111111';
let actor = null, writes = [], availabilityReads = 0, stale = false;
const fixtureUser = { id: 'client-a', name: 'Fixture Client', role: 'member', phone: '6055550100', address: 'Fixture address' };
const app = express(); app.use(express.json());
app.use('/api', (req, res) => {
  const path = req.path;
  let data = { services: [], images: {}, entries: {}, team: [], schedules: [], reviews: [], recommendations: [], count: 0, clips: [], bookings: [], terms: [], items: [], alerts: [], revision: 0 };
  if (req.method !== 'GET') writes.push({ path, body: req.body });
  if (path === '/config') data = { connected: true, paymentsReady: false, services: SERVICES, lessonLibrary: { open: false }, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['09:00','10:00'] } };
  if (path === '/auth/me') data = { user: actor, services: [], membership: { active: false } };
  if (path === '/auth/login') { actor = fixtureUser; data = { user: actor }; }
  if (path === '/auth/logout') { actor = null; data = { ok: true }; }
  if (path === '/team') data = { team: [{ id: trainerId, name: 'Fixture Trainer', title: 'Private dog trainer', role: 'staff' }] };
  if (path === '/trainers') data = { trainers: [{ id: trainerId, name: 'Fixture Trainer', limit: 5, spotsRemaining: 4, full: false }] };
  if (path === '/availability') {
    availabilityReads++;
    data = { days: Array.from({length:14}, (_,i) => ({ date: new Date(Date.parse(`${req.query.from}T12:00:00Z`) + i * 86400000).toISOString().slice(0,10), slots: stale ? [] : ['09:00','10:00'] })) };
  }
  if (path === '/live') data = { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() };
  if (path === '/bookings' && req.method === 'POST') data = { booking: { _id: 'fixture-booking', status: 'requested', paymentStatus: 'unpaid', quote: { dueNowCents: 20000 } } };
  res.json(data);
});
app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name,engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch({ ...(name === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    try { for (const width of (process.env.BRAVO_REPRODUCE ? [390] : [360,390,768,1440])) {
      actor = null; writes = []; availabilityReads = 0; stale = false;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`${origin}/portal?program=training`);
        await page.getByLabel('Dog’s name', {exact:true}).fill('Biscuit');
        await page.getByLabel('Anything you’d like your trainer to know? (optional)', {exact:true}).fill('Keep this draft through navigation.');
        await page.getByRole('button', {name:'Choose a trainer →',exact:true}).click();
        await page.locator('.guided-trainer-cards button').first().click();
        await page.getByRole('button', {name:'Choose a date & time →',exact:true}).click();
        await page.locator('.date-grid button').first().click();
        await page.locator('.bulk-times').getByRole('button', {name:/10:00/}).click();
        await page.getByRole('button', {name:'Review my request →',exact:true}).click();
        await page.getByRole('link', {name:'Sign in or create your account',exact:true}).click();
        await page.getByLabel('Name or email', {exact:true}).waitFor();
        await page.getByRole('button', {name:'Back',exact:true}).click();
        await page.waitForLoadState('networkidle');
        assert.equal(await page.getByRole('heading', {name:'Review your first visit.',exact:true}).count(), 1, 'Back from account must retain the request review, not reset to an empty dog form');
        assert.match(await page.locator('.guided-booking-price').innerText(), /Biscuit/);
        assert.match(await page.locator('.guided-visit-summary').innerText(), /10:00 AM/);
        assert.deepEqual(writes, [], 'guest planning never writes a booking');
        assert.deepEqual(errors, []);
        console.log(`PASS ${name}/${width}: Back from account retains dog, trainer, date and time.`);
      } catch (error) {
        await page.screenshot({path:`test-results/booking-continuity-${name}-${width}-failure.png`,fullPage:true});
        throw error;
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { server.close(); }
