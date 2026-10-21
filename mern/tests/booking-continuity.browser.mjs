// Only synthetic, same-origin APIs. Never contacts Bravo, Stripe or recipients.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const trainerId = '111111111111111111111111';
let actor = null, writes = [], availabilityReads = 0, stale = false, liveError = false;
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
  if (path === '/live' && liveError) return res.status(503).json({error:'Fixture unavailable'});
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
      actor = null; writes = []; availabilityReads = 0; stale = false; liveError = false;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('dialog', dialog => dialog.accept());
      const assertFit = async label => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits ${width}px`); };
      const assertSteps = async current => { const nav=page.getByRole('navigation',{name:'First visit steps',exact:true}); assert.deepEqual((await nav.getByRole('button').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()),['1. Your dog','2. Trainer','3. Date and time','4. Review']); assert.match(await nav.locator('[aria-current=step]').innerText(),new RegExp(current)); };
      const review = () => page.getByRole('heading',{name:'Review your first visit.',exact:true}).waitFor();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`${origin}/portal?program=training`);
        await page.getByLabel('Dog’s name', {exact:true}).fill('Biscuit');
        await page.getByLabel('Anything you’d like your trainer to know? (optional)', {exact:true}).fill('Keep this draft through navigation.');
        await assertSteps('Your dog'); await assertFit('Your dog');
        await page.getByRole('button', {name:'Choose a trainer →',exact:true}).focus(); await page.keyboard.press('Enter');
        await assertSteps('Trainer'); assert.equal(await page.getByLabel('Choose my trainer',{exact:true}).count(),0,'one trainer picker');
        await page.locator('.guided-trainer-cards button').first().focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.guided-trainer-cards button[aria-pressed=true]').count(),1); await assertFit('Trainer');
        await page.getByRole('button', {name:'Choose a date & time →',exact:true}).click();
        await assertSteps('Date and time'); assert.equal(await page.locator('#choose-dates .step-heading>span').innerText(),'03');
        await page.locator('.date-grid button').first().focus(); await page.keyboard.press('Enter');
        await page.locator('.bulk-times').getByRole('button', {name:/10:00/}).click();
        await assertFit('Date and time');
        const proximity=await page.evaluate(()=>{const dates=document.querySelector('.date-grid').getBoundingClientRect();const times=document.querySelector('.bulk-times').getBoundingClientRect();return times.top-dates.bottom;});assert.ok(proximity<150,'times stay close to dates');
        await page.screenshot({path:`test-results/booking-dates-${name}-${width}.png`,fullPage:true});
        await page.getByRole('button', {name:'Review my request →',exact:true}).click();
        await assertSteps('Review'); assert.equal(await page.locator('#visit-details .step-heading>span').innerText(),'04');
        await page.getByRole('link', {name:'Sign in or create your account',exact:true}).click();
        await page.getByLabel('Name or email', {exact:true}).waitFor();
        assert.match(await page.getByRole('region',{name:'Your unsent request'}).innerText(),/Biscuit[\s\S]*Fixture Trainer[\s\S]*10:00 AM/);
        assert.equal(await page.getByText('Use at least 12 characters to keep your account secure.',{exact:true}).count(),0);
        await page.getByRole('button',{name:'Create account',exact:true}).click(); await page.getByText('Use at least 12 characters to keep your account secure.',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Sign in',exact:true}).first().click();await assertFit('Account');
        await page.screenshot({path:`test-results/booking-account-${name}-${width}.png`,fullPage:true});
        await page.getByRole('button', {name:'Back',exact:true}).click();
        await review();
        assert.equal(await page.getByRole('heading', {name:'Review your first visit.',exact:true}).count(), 1, 'Back from account must retain the request review, not reset to an empty dog form');
        assert.match(await page.locator('.guided-booking-price').innerText(), /Biscuit/);
        assert.match(await page.locator('.guided-visit-summary').innerText(), /10:00 AM/);
        assert.deepEqual(writes, [], 'guest planning never writes a booking');
        await page.reload(); await review(); await assertSteps('Review');
        await page.goForward(); await page.getByLabel('Name or email',{exact:true}).waitFor();
        await page.reload(); await page.getByRole('region',{name:'Your unsent request'}).waitFor();
        await page.getByLabel('Name or email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password-only');
        await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await review();
        assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Biscuit');
        assert.equal(await page.getByLabel('Anything the team should know?',{exact:true}).inputValue(),'Keep this draft through navigation.');
        await page.reload();await review();assert.match(await page.locator('.guided-visit-summary').innerText(),/Fixture Trainer[\s\S]*10:00 AM/);await assertFit('Review');
        await page.screenshot({path:`test-results/booking-review-${name}-${width}.png`,fullPage:true});
        // A request cannot submit using an old availability snapshot.
        stale=true;const before=availabilityReads;await page.getByRole('button',{name:'Send my request • no charge',exact:true}).click();
        await page.getByText('A selected time is no longer available.',{exact:false}).waitFor();assert.ok(availabilityReads>before);assert.equal(writes.filter(w=>w.path==='/bookings').length,0);
        stale=false;await page.reload();await page.locator('.date-grid button').first().click();await page.locator('.date-grid button').first().click();await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();await page.getByRole('button',{name:'Review my request →',exact:true}).click();
        // Explicit resume/discard: a new-program link must never overwrite this draft.
        await page.goto(`${origin}/portal?program=aggression`);await page.getByRole('link',{name:'Resume my request',exact:true}).click();await review();
        assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Biscuit');
        await page.goto(`${origin}/portal?new=1`);await page.getByRole('button',{name:'Discard draft and start again',exact:true}).click();await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).waitFor();assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'');
        await page.reload();assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'');
        // A different authenticated account never sees the first account's input.
        await page.getByLabel('Dog’s name',{exact:true}).fill('Only client A');await page.getByRole('button',{name:'Choose a trainer →',exact:true}).click();await page.getByRole('heading',{name:'Choose your trainer.',exact:true}).waitFor();actor={...fixtureUser,id:'client-b'};await page.reload();assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'');
        await page.goto(origin);await page.locator('.hero-booking-facts').waitFor();assert.match(await page.locator('.hero-booking-facts').innerText(),/\$200[\s\S]*Manual renewal[\s\S]*Aberdeen/);await assertFit('Homepage');
        await page.screenshot({path:`test-results/booking-home-${name}-${width}.png`,fullPage:true});
        await page.goto(`${origin}/how-to#chapter-time`);await page.locator('#chapter-time button').waitFor();assert.equal(await page.locator('.how-to-chapters button').count(),22);await assertFit('How-to guide');
        if (width === 390) {
          await page.goto(`${origin}/live`);await page.getByRole('heading',{name:'OUT IN THE FIELD.',exact:true}).waitFor();
          liveError=true;await page.reload();await page.getByText('Live status is temporarily unavailable. Reconnecting…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'OUT IN THE FIELD.',exact:true}).count(),0,'failed status is never presented as offline');liveError=false;
        }
        assert.equal(writes.filter(w=>w.path==='/bookings'||w.path.includes('checkout')).length,0);assert.deepEqual(errors, []);
        console.log(`PASS ${name}/${width}: four stages; keyboard; date/time proximity; Back/Forward/refresh/auth; resume/discard; account isolation; availability recheck; home and complete guide layouts. No real writes.`);
      } catch (error) {
        await page.screenshot({path:`test-results/booking-continuity-${name}-${width}-failure.png`,fullPage:true});
        await writeFile(`test-results/booking-continuity-${name}-${width}-failure.json`,JSON.stringify({error:error.message,errors,text:await page.locator('body').innerText()},null,2));
        throw error;
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
} finally { server.close(); }
