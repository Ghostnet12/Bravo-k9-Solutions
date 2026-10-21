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
let actor = null, writes = [], availabilityReads = 0, stale = false, liveError = false, passwordSetup = false;
let recoveredBooking = null, loseBookingResponse = false, hideFirstRecovery = false, bookingCreates = 0;
let handoffFailure = '', failNextAuthRead = false;
const fixtureUser = { id: 'client-a', name: 'Fixture Client', role: 'member', phone: '6055550100', address: 'Fixture address' };
const app = express(); app.use(express.json());
app.use('/api', (req, res) => {
  const path = req.path;
  let data = { services: [], images: {}, entries: {}, team: [], schedules: [], reviews: [], recommendations: [], count: 0, clips: [], bookings: [], terms: [], items: [], alerts: [], revision: 0 };
  if (req.method !== 'GET') writes.push({ path, body: req.body });
  if (path === '/config') data = { connected: true, paymentsReady: false, services: SERVICES, lessonLibrary: { open: false }, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['09:00','10:00'] } };
  if (path === '/auth/me') {
    if (failNextAuthRead) { failNextAuthRead = false; return res.status(503).json({ error: 'Fixture account refresh failed' }); }
    data = { user: actor, services: [], membership: { active: false } };
  }
  if (path === '/auth/login' || path === '/auth/register') {
    actor = { ...fixtureUser, ...(req.body.identifier === 'different@example.test' ? { id: 'client-b', name: 'Different Client' } : {}), mustChangePassword: passwordSetup }; data = { user: actor };
    if (handoffFailure === 'auth-refresh') failNextAuthRead = true;
    if (handoffFailure === 'login-response') return res.status(503).json({ error: 'Fixture sign-in response lost' });
  }
  if (path === '/auth/password-setup') { actor = { ...actor, mustChangePassword: false }; data = { user: actor }; }
  if (path === '/auth/logout') { actor = null; data = { ok: true }; }
  if (path === '/team') data = { team: [{ id: trainerId, name: 'Fixture Trainer', title: 'Private dog trainer', role: 'staff' }] };
  if (path === '/trainers') data = { trainers: [{ id: trainerId, name: 'Fixture Trainer', limit: 5, spotsRemaining: 4, full: false }] };
  if (path === '/availability') {
    availabilityReads++;
    data = { days: Array.from({length:14}, (_,i) => ({ date: new Date(Date.parse(`${req.query.from}T12:00:00Z`) + i * 86400000).toISOString().slice(0,10), slots: stale ? [] : ['09:00','10:00'] })) };
  }
  if (path === '/live' && liveError) return res.status(503).json({error:'Fixture unavailable'});
  if (path === '/live') data = { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() };
  if (path === '/bookings' && req.method === 'GET' && req.query.requestKey) {
    const hidden = recoveredBooking && hideFirstRecovery;
    if (hidden) hideFirstRecovery = false;
    data = { bookings: !hidden && recoveredBooking?.requestKey === req.query.requestKey ? [recoveredBooking] : [] };
  }
  if (path === '/bookings' && req.method === 'POST') {
    if (!recoveredBooking || recoveredBooking.requestKey !== req.body.requestKey) {
      bookingCreates++;
      recoveredBooking = { ...req.body, _id: 'fixture-booking', status: 'requested', paymentStatus: 'unpaid', quote: { dueNowCents: 20000 } };
    }
    data = { booking: recoveredBooking };
    if (loseBookingResponse) {
      loseBookingResponse = false; stale = true;
      return res.status(503).json({ error: 'Fixture response lost after saving' });
    }
  }
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
      actor = null; writes = []; availabilityReads = 0; stale = false; liveError = false; passwordSetup = width === 390;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('dialog', dialog => dialog.accept());
      const assertFit = async label => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits ${width}px`); };
      const assertSteps = async current => { const nav=page.getByRole('navigation',{name:'First visit steps',exact:true}); assert.deepEqual((await nav.getByRole('button').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()),['1. Your dog','2. Trainer','3. Date and time','4. Review']); assert.match(await nav.locator('[aria-current=step]').innerText(),new RegExp(current)); };
      const review = () => page.getByRole('heading',{name:'Review your first visit.',exact:true}).waitFor();
      const errors = [], navigationDiagnostics = []; let navigating = false;
      page.on('pageerror', error => {
        // Playwright WebKit #43120 surfaces handled fetch cancellation on unload.
        // Only the observed same-origin content reads during document replacement
        // are classified; native runtime/rejection events below must still pass.
        if (name === 'webkit' && navigating && ['site-images','site-content'].some(path => error.message.endsWith(`${new URL(origin).host}/api/${path} due to access control checks.`))) navigationDiagnostics.push(error.message);
        else errors.push(error.message);
      });
      await page.exposeFunction('recordBookingRuntimeError', message => errors.push(message));
      await page.addInitScript(() => {
        window.addEventListener('error', event => { if (event instanceof ErrorEvent) void window.recordBookingRuntimeError(event.error?.stack || event.message).catch(() => {}); });
        window.addEventListener('unhandledrejection', event => { void window.recordBookingRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {}); });
      });
      const navigate = async action => {
        await page.waitForLoadState('networkidle'); navigating = true;
        try { await action(); } finally { navigating = false; }
        const reads = await page.evaluate(async () => Promise.all(['/api/site-content','/api/site-images'].map(async url => { const response=await fetch(url,{credentials:'same-origin'});await response.json();return response.status; })));
        assert.deepEqual(reads,[200,200], 'destination permits content reads; actual CORS failures cannot be hidden');
      };
      try {
        await navigate(() => page.goto(`${origin}/portal?program=training`));
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
        await navigate(() => page.reload()); await review(); await assertSteps('Review');
        await navigate(() => page.goForward()); await page.getByLabel('Name or email',{exact:true}).waitFor();
        await navigate(() => page.reload()); await page.getByRole('region',{name:'Your unsent request'}).waitFor();
        await page.getByLabel('Name or email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password-only');
        await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
        if (passwordSetup) {
          await page.getByRole('heading',{name:'Create your password.',exact:true}).waitFor();
          await navigate(() => page.reload());await page.getByRole('heading',{name:'Create your password.',exact:true}).waitFor();
          assert.match(await page.getByRole('region',{name:'Your unsent request'}).innerText(),/Biscuit[\s\S]*Fixture Trainer[\s\S]*10:00 AM/);
          assert.equal(await page.getByRole('heading',{name:'Review your first visit.',exact:true}).count(),0,'password setup still gates the request');
          await assertFit('Password setup');
          await page.getByLabel('New password',{exact:true}).fill('fixture-new-password-only');await page.getByLabel('Confirm new password',{exact:true}).fill('fixture-new-password-only');
          await page.getByRole('button',{name:'Save password & return to request',exact:true}).click();
        }
        await review();
        if (passwordSetup) assert.equal(writes.filter(w=>w.path==='/auth/password-setup').length,1,'one completed password setup returns to the saved review');
        assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Biscuit');
        assert.equal(await page.getByLabel('Anything the team should know?',{exact:true}).inputValue(),'Keep this draft through navigation.');
        await navigate(() => page.reload());await review();assert.match(await page.locator('.guided-visit-summary').innerText(),/Fixture Trainer[\s\S]*10:00 AM/);await assertFit('Review');
        await page.screenshot({path:`test-results/booking-review-${name}-${width}.png`,fullPage:true});
        // A request cannot submit using an old availability snapshot.
        stale=true;const before=availabilityReads;await page.getByRole('button',{name:'Send my request • no charge',exact:true}).click();
        await page.getByText('A selected time is no longer available.',{exact:false}).waitFor();assert.ok(availabilityReads>before);assert.equal(writes.filter(w=>w.path==='/bookings').length,0);
        stale=false;await navigate(() => page.reload());await page.locator('.date-grid button').first().click();await page.locator('.date-grid button').first().click();await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();await page.getByRole('button',{name:'Review my request →',exact:true}).click();
        // Explicit resume/discard: a new-program link must never overwrite this draft.
        await navigate(() => page.goto(`${origin}/portal?program=aggression`));await page.getByRole('link',{name:'Resume my request',exact:true}).click();await review();
        assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Biscuit');
        await navigate(() => page.goto(`${origin}/portal?new=1`));await page.getByRole('button',{name:'Discard draft and start again',exact:true}).click();await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).waitFor();assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'');
        await navigate(() => page.reload());assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'');
        // A different authenticated account never sees the first account's input.
        await page.getByLabel('Dog’s name',{exact:true}).fill('Only client A');await page.getByRole('button',{name:'Choose a trainer →',exact:true}).click();await page.getByRole('heading',{name:'Choose your trainer.',exact:true}).waitFor();actor={...fixtureUser,id:'client-b'};await navigate(() => page.reload());assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'');
        await navigate(() => page.goto(origin));await page.locator('.hero-booking-facts').waitFor();assert.match(await page.locator('.hero-booking-facts').innerText(),/\$200[\s\S]*Manual renewal[\s\S]*Aberdeen/);await assertFit('Homepage');
        await page.screenshot({path:`test-results/booking-home-${name}-${width}.png`,fullPage:true});
        await navigate(() => page.goto(`${origin}/how-to#chapter-time`));await page.locator('#chapter-time button').waitFor();assert.equal(await page.locator('.how-to-chapters button').count(),22);await assertFit('How-to guide');
        if (width === 390) {
          await navigate(() => page.goto(`${origin}/live`));await page.getByRole('heading',{name:'OUT IN THE FIELD.',exact:true}).waitFor();
          liveError=true;await navigate(() => page.reload());await page.getByText('Live status is temporarily unavailable. Reconnecting…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'OUT IN THE FIELD.',exact:true}).count(),0,'failed status is never presented as offline');liveError=false;
        }
        assert.equal(writes.filter(w=>w.path==='/bookings'||w.path.includes('checkout')).length,0);assert.deepEqual(errors, []);
        console.log(`PASS ${name}/${width}: four stages; keyboard; date/time proximity; Back/Forward/refresh/auth${passwordSetup ? ' including required password setup' : ''}; resume/discard; account isolation; availability recheck; home and complete guide layouts. No real writes.`);
      } catch (error) {
        await page.screenshot({path:`test-results/booking-continuity-${name}-${width}-failure.png`,fullPage:true});
        await writeFile(`test-results/booking-continuity-${name}-${width}-failure.json`,JSON.stringify({error:error.message,errors,navigationDiagnostics,text:await page.locator('body').innerText()},null,2));
        throw error;
      } finally { await context.close(); }
    }
    // A committed booking occupies its own slot even if the response was lost.
    // Reconcile the original key in-place and after refresh, using only this fixture.
    for (const refreshBeforeRetry of [false, true]) {
      actor = { ...fixtureUser }; writes = []; stale = false; recoveredBooking = null;
      bookingCreates = 0; loseBookingResponse = true; hideFirstRecovery = false;
      const retryContext = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
      await retryContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const requestKey = '22222222-2222-4222-8222-222222222222';
      await retryContext.addInitScript(({ requestKey, trainerId }) => {
        if (sessionStorage.getItem('fixture-retry-seeded')) return;
        sessionStorage.setItem('fixture-retry-seeded', '1');
        sessionStorage.setItem('bravo-booking-draft-v1', JSON.stringify({ version: 1, owner: 'user:client-a', updatedAt: Date.now(), draft: {
          entry: 'program=training', ids: ['training'], form: { dogName: 'Retry fixture', phone: '6055550100', address: 'Fixture address', notes: '' },
          visits: [{ date: new Date().toISOString().slice(0,10), time: '10:00', service: 'training' }], trainerId, trainerName: 'Fixture Trainer',
          introDone: true, bookingStep: 'review', timeConfirmed: true, requestKey,
        } }));
      }, { requestKey, trainerId });
      const retryPage = await retryContext.newPage(); retryPage.setDefaultTimeout(10000);
      try {
        await retryPage.goto(`${origin}/portal?resume=1`); await retryPage.waitForLoadState('networkidle');
        await retryPage.getByRole('button', { name: 'Send my request • no charge', exact: true }).click();
        await retryPage.getByText('Fixture response lost after saving', { exact: true }).waitFor();
        assert.equal(bookingCreates, 1, 'the first request committed despite its lost response');
        if (refreshBeforeRetry) { await retryPage.reload(); await retryPage.waitForLoadState('networkidle'); }
        else hideFirstRecovery = true; // Commit visibility can race the first reconciliation read.
        await retryPage.getByRole('button', { name: 'Send my request • no charge', exact: true }).click();
        await retryPage.getByRole('link', { name: 'View my saved request →', exact: true }).waitFor();
        assert.equal(bookingCreates, 1, 'retry must recover the original request without another booking');
        assert.equal(recoveredBooking.requestKey, requestKey);
        assert.equal(await retryPage.evaluate(() => sessionStorage.getItem('bravo-booking-draft-v1')), null, 'successful recovery clears the draft');
        assert.equal(writes.filter(write => write.path.includes('checkout')).length, 0);
        console.log(`PASS ${name}/390: lost booking response reconciles ${refreshBeforeRetry ? 'after refresh' : 'despite a concurrent commit'} with one fixture booking and no charge.`);
      } catch (error) {
        await retryPage.screenshot({path:`test-results/booking-retry-${name}-${refreshBeforeRetry ? 'refresh' : 'race'}-failure.png`,fullPage:true});
        throw error;
      } finally { await retryContext.close(); }
    }
    for (const scenario of [
      { failure: 'login-response' },
      { failure: 'auth-refresh', passwordSetup: true },
      { failure: 'login-response', register: true },
      { failure: 'login-response', discard: true },
      { failure: 'login-response', switchAccount: true },
      { failure: '', direct: true },
      { failure: '', direct: true, register: true },
      { failure: '', direct: true, passwordSetup: true },
      { failure: '', direct: true, next: '/schedule' },
      { failure: 'login-response', direct: true },
      { failure: 'auth-refresh', direct: true, passwordSetup: true },
    ]) {
      actor = null; writes = []; stale = false; recoveredBooking = null; failNextAuthRead = false;
      handoffFailure = scenario.failure; passwordSetup = !!scenario.passwordSetup;
      const handoffContext = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
      await handoffContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await handoffContext.addInitScript(({ trainerId }) => {
        if (sessionStorage.getItem('fixture-handoff-seeded')) return;
        sessionStorage.setItem('fixture-handoff-seeded', '1');
        sessionStorage.setItem('bravo-booking-draft-v1', JSON.stringify({ version: 1, owner: 'guest', updatedAt: Date.now(), draft: {
          entry: 'program=training', ids: ['training'], form: { dogName: 'Handoff fixture', phone: '6055550100', address: 'Fixture address', notes: 'Preserve this handoff' },
          visits: [{ date: new Date().toISOString().slice(0,10), time: '10:00', service: 'training' }], trainerId, trainerName: 'Fixture Trainer',
          introDone: true, bookingStep: 'review', timeConfirmed: true, requestKey: '33333333-3333-4333-8333-333333333333',
        } }));
      }, { trainerId });
      const handoffPage = await handoffContext.newPage(); handoffPage.setDefaultTimeout(10000);
      try {
        await handoffPage.goto(`${origin}/account${scenario.direct ? scenario.next ? `?next=${encodeURIComponent(scenario.next)}` : '' : `?next=${encodeURIComponent('/portal?resume=1')}`}`);
        await handoffPage.getByRole('region', { name: 'Your unsent request', exact: true }).waitFor();
        if (scenario.register) {
          await handoffPage.getByRole('button', { name: 'Create account', exact: true }).click();
          await handoffPage.getByLabel('Your name', { exact: true }).fill('Fixture Client');
          await handoffPage.getByLabel('Email', { exact: true }).fill('fixture@example.test');
        } else await handoffPage.getByLabel('Name or email', { exact: true }).fill('fixture@example.test');
        await handoffPage.getByLabel('Password', { exact: true }).fill('fixture-password-only');
        await handoffPage.locator('form').getByRole('button', { name: scenario.register ? 'Create my account' : 'Sign in', exact: true }).click();
        if (!scenario.failure) {
          if (scenario.passwordSetup) {
            await handoffPage.getByRole('heading', { name: 'Create your password.', exact: true }).waitFor();
            await handoffPage.getByLabel('New password', { exact: true }).fill('fixture-new-password-only');
            await handoffPage.getByLabel('Confirm new password', { exact: true }).fill('fixture-new-password-only');
            await handoffPage.getByRole('button', { name: 'Save password & return to request', exact: true }).click();
          }
          if (scenario.next) { await handoffPage.waitForURL(`${origin}${scenario.next}`); await handoffPage.goto(`${origin}/portal?resume=1`); }
          await handoffPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
          assert.equal(await handoffPage.getByLabel('Dog’s name', { exact: true }).inputValue(), 'Handoff fixture');
          assert.match(await handoffPage.locator('.guided-visit-summary').innerText(), /Fixture Trainer[\s\S]*10:00 AM/);
          await handoffPage.reload(); await handoffPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
          assert.equal(await handoffPage.getByLabel('Anything the team should know?', { exact: true }).inputValue(), 'Preserve this handoff');
          assert.equal(writes.filter(write => write.path === '/bookings' || write.path.includes('checkout')).length, 0);
          console.log(`PASS ${name}/390: ordinary account ${scenario.register ? 'registration' : 'sign-in'}${scenario.passwordSetup ? ' with required password setup' : ''}${scenario.next ? ' with an explicit schedule destination' : ''} preserves the request and return path. No bookings or charges.`);
          continue;
        }
        await handoffPage.getByText(scenario.failure === 'auth-refresh' ? 'Fixture account refresh failed' : 'Fixture sign-in response lost', { exact: true }).waitFor();
        handoffFailure = ''; await handoffPage.reload();
        if (scenario.passwordSetup) {
          await handoffPage.getByRole('heading', { name: 'Create your password.', exact: true }).waitFor();
          await handoffPage.getByLabel('New password', { exact: true }).fill('fixture-new-password-only');
          await handoffPage.getByLabel('Confirm new password', { exact: true }).fill('fixture-new-password-only');
          await handoffPage.getByRole('button', { name: 'Save password & return to request', exact: true }).click();
        }
        await handoffPage.getByRole('button', { name: 'Resume request for this account', exact: true }).waitFor();
        assert.ok(!(await handoffPage.locator('body').innerText()).includes('Handoff fixture'), 'pending details require an explicit claim');
        await handoffPage.reload();
        await handoffPage.getByRole('button', { name: 'Resume request for this account', exact: true }).waitFor();
        if (!scenario.direct && !scenario.register && !scenario.discard && !scenario.switchAccount && !scenario.passwordSetup) {
          for (const width of [360,390,768,1440]) {
            await handoffPage.setViewportSize({ width, height: 900 });
            assert.ok(await handoffPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `pending handoff fits ${width}px`);
            await handoffPage.screenshot({path:`test-results/booking-handoff-${name}-${width}.png`,fullPage:true});
          }
          await handoffPage.setViewportSize({ width: 390, height: 900 });
        }
        if (scenario.switchAccount) {
          actor = { ...fixtureUser, id: 'client-b', name: 'Different Client' };
          await handoffPage.reload(); await handoffPage.waitForLoadState('networkidle');
          assert.equal(await handoffPage.getByRole('button', { name: 'Resume request for this account', exact: true }).count(), 0);
          assert.ok(!(await handoffPage.locator('body').innerText()).includes('Handoff fixture'));
          await handoffPage.goto(`${origin}/portal?new=1`); await handoffPage.getByLabel('Dog’s name', { exact: true }).waitFor();
          assert.equal(await handoffPage.getByLabel('Dog’s name', { exact: true }).inputValue(), '');
        } else if (scenario.discard) {
          await handoffPage.getByRole('button', { name: 'Discard pending request', exact: true }).click();
          await handoffPage.getByLabel('Dog’s name', { exact: true }).waitFor();
          assert.equal(await handoffPage.getByLabel('Dog’s name', { exact: true }).inputValue(), '');
          assert.equal(await handoffPage.evaluate(() => sessionStorage.getItem('bravo-booking-draft-v1')), null);
        } else {
          await handoffPage.getByRole('button', { name: 'Resume request for this account', exact: true }).focus(); await handoffPage.keyboard.press('Enter');
          await handoffPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
          assert.equal(await handoffPage.getByLabel('Dog’s name', { exact: true }).inputValue(), 'Handoff fixture');
          assert.match(await handoffPage.locator('.guided-visit-summary').innerText(), /Fixture Trainer[\s\S]*10:00 AM/);
          await handoffPage.reload();
          await handoffPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
          assert.equal(await handoffPage.getByLabel('Anything the team should know?', { exact: true }).inputValue(), 'Preserve this handoff');
        }
        assert.equal(writes.filter(write => write.path === '/bookings' || write.path.includes('checkout')).length, 0);
        console.log(`PASS ${name}/390: ${scenario.direct ? 'ordinary account route: ' : ''}ambiguous ${scenario.register ? 'registration' : scenario.failure}${scenario.passwordSetup ? ' with required password setup' : ''} preserves the pending handoff with ${scenario.switchAccount ? 'account isolation' : scenario.discard ? 'explicit discard' : 'explicit resume'}, including refresh. No bookings or charges.`);
      } catch (error) {
        await handoffPage.screenshot({path:`test-results/booking-handoff-${name}-${scenario.register ? 'registration' : scenario.discard ? 'discard' : scenario.switchAccount ? 'switch-account' : scenario.failure}-failure.png`,fullPage:true});
        throw error;
      } finally { await handoffContext.close(); handoffFailure = ''; }
    }
    for (const outcome of ['restore', 'discard', 'different-account']) {
      actor = { ...fixtureUser }; writes = []; stale = false; recoveredBooking = null; failNextAuthRead = false; passwordSetup = false;
      const expiredContext = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
      await expiredContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await expiredContext.addInitScript(({ trainerId }) => {
        if (sessionStorage.getItem('fixture-expiry-seeded')) return;
        sessionStorage.setItem('fixture-expiry-seeded', '1');
        sessionStorage.setItem('bravo-booking-draft-v1', JSON.stringify({ version: 1, owner: 'user:client-a', updatedAt: Date.now(), draft: {
          entry: 'program=training', ids: ['training'], form: { dogName: 'Private expiry fixture', phone: '6055550100', address: 'Fixture address', notes: 'Keep through sign-in expiry' },
          visits: [{ date: new Date().toISOString().slice(0,10), time: '10:00', service: 'training' }], trainerId, trainerName: 'Fixture Trainer',
          introDone: true, bookingStep: 'review', timeConfirmed: true, requestKey: '44444444-4444-4444-8444-444444444444',
        } }));
      }, { trainerId });
      const expiredPage = await expiredContext.newPage(); expiredPage.setDefaultTimeout(10000);
      try {
        await expiredPage.goto(`${origin}/portal?resume=1`);
        await expiredPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
        actor = null; await expiredPage.reload();
        await expiredPage.getByRole('heading', { name: 'Sign in to resume your request.', exact: true }).waitFor();
        assert.ok(!(await expiredPage.locator('body').innerText()).includes('Private expiry fixture'));
        assert.equal(await expiredPage.evaluate(() => JSON.parse(sessionStorage.getItem('bravo-booking-draft-v1')).owner), 'user:client-a');
        await expiredPage.goto(`${origin}/portal?program=walking`); await expiredPage.reload();
        await expiredPage.getByRole('heading', { name: 'Sign in to resume your request.', exact: true }).waitFor();
        if (outcome === 'restore') {
          for (const width of [360,390,768,1440]) {
            await expiredPage.setViewportSize({ width, height: 900 });
            assert.ok(await expiredPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `signed-out draft fits ${width}px`);
            await expiredPage.screenshot({path:`test-results/booking-expiry-${name}-${width}.png`,fullPage:true});
          }
          await expiredPage.setViewportSize({ width: 390, height: 900 });
        }
        if (outcome === 'discard') {
          await expiredPage.getByRole('button', { name: 'Discard saved draft', exact: true }).click();
          await expiredPage.getByLabel('Dog’s name', { exact: true }).waitFor();
          assert.equal(await expiredPage.evaluate(() => sessionStorage.getItem('bravo-booking-draft-v1')), null);
        } else {
          await expiredPage.getByRole('link', { name: 'Sign in to restore request', exact: true }).focus(); await expiredPage.keyboard.press('Enter');
          await expiredPage.getByLabel('Name or email', { exact: true }).fill(outcome === 'restore' ? 'fixture@example.test' : 'different@example.test');
          await expiredPage.getByLabel('Password', { exact: true }).fill('fixture-password-only');
          await expiredPage.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
          if (outcome === 'restore') {
            await expiredPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
            assert.equal(await expiredPage.getByLabel('Dog’s name', { exact: true }).inputValue(), 'Private expiry fixture');
            assert.match(await expiredPage.locator('.guided-visit-summary').innerText(), /Fixture Trainer[\s\S]*10:00 AM/);
            await expiredPage.reload(); await expiredPage.getByRole('heading', { name: 'Review your first visit.', exact: true }).waitFor();
            assert.equal(await expiredPage.getByLabel('Anything the team should know?', { exact: true }).inputValue(), 'Keep through sign-in expiry');
          } else {
            await expiredPage.getByLabel('Dog’s name', { exact: true }).waitFor();
            assert.equal(await expiredPage.getByLabel('Dog’s name', { exact: true }).inputValue(), '');
            assert.equal(await expiredPage.evaluate(() => sessionStorage.getItem('bravo-booking-draft-v1')), null);
          }
        }
        assert.equal(writes.filter(write => write.path === '/bookings' || write.path.includes('checkout')).length, 0);
        console.log(`PASS ${name}/390: expired sign-in keeps account details hidden through refresh and new-program navigation; ${outcome} is isolated. No bookings or charges.`);
      } catch (error) {
        await expiredPage.screenshot({path:`test-results/booking-expiry-${name}-${outcome}-failure.png`,fullPage:true}); throw error;
      } finally { await expiredContext.close(); }
    }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
