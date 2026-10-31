// Local fixtures only. No production requests, bookings, messages or payments.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { GOALS, goalBookingPath } from '../shared/discovery.js';
const app = express(), dist = path.resolve('client/dist');
app.get('/api/live', (_req, res) => res.json({ sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() }));
app.use(express.static(dist));
app.get('/{*rest}', (_req, res) => res.sendFile(path.join(dist, 'bravo-shell.html')));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(), checks = [];
await mkdir('test-results', { recursive: true });
async function setup(width, owner = false) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 700, isMobile: width < 700 });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.resourceType() === 'media') return route.abort();
    if (url.pathname === '/api/live' || !url.pathname.startsWith('/api/')) return route.continue();
    assert.ok(['GET', 'HEAD'].includes(request.method()) || url.pathname.includes('/telemetry'), 'no application writes');
    let json = { entries: {}, images: {}, team: [], items: [], clips: [], reviews: [], ads: [], alerts: [] };
    if (url.pathname === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES, lessonLibrary: { open: false } };
    if (url.pathname === '/api/auth/me') json = { user: owner ? { id: 'scroll-owner-fixture', name: 'Owner', role: 'owner', isPrimaryOwner: true } : null, services: [], membership: { active: false } };
    return route.fulfill({ json });
  });
  await page.addInitScript(() => {
    window.goalScrollCalls = [];
    const scroll = window.scrollTo.bind(window);
    window.scrollTo = (...args) => { window.goalScrollCalls.push(args[0]); return scroll(...args); };
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.conversion-goal').first().waitFor();
  assert.equal(await page.evaluate(() => scrollY), 0, 'default entry never moves the page');
  await page.getByText('See training examples by goal',{exact:true}).click();
  await page.locator('.goal-select').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  return { context, page, errors };
}
async function showCards(page) {
  await page.locator('#find-training').evaluate(node => window.scrollTo({ top: scrollY + node.getBoundingClientRect().top - 125, behavior: 'instant' }));
  await page.waitForTimeout(100);
}
async function revealed(page, goal, behavior = 'instant') {
  await page.waitForFunction(() => {
    const panel = document.getElementById('goal-result').getBoundingClientRect();
    const header = document.querySelector('.app-header').getBoundingClientRect();
    return panel.top >= header.bottom + 6 && panel.top <= header.bottom + 35;
  });
  await page.waitForTimeout(250);
  const panel = page.locator('#goal-result');
  assert.equal(await panel.locator('h3').innerText(), goal.title);
  assert.equal(await page.locator('.goal-select[aria-pressed=true]').count(), 1);
  assert.equal(await panel.locator('.goal-actions > .button').getAttribute('href'), goalBookingPath(goal));
  assert.equal(new URL(page.url()).pathname, '/'); assert.equal(new URL(page.url()).hash, '');
  assert.equal(await page.evaluate(() => window.goalScrollCalls.at(-1)?.behavior), behavior);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
try {
  for (const width of [768, 1440]) {
    const { context, page, errors } = await setup(width);
    try {
      for (const goal of GOALS) {
        await showCards(page);
        const button = page.locator(`[data-site-content-key="goal-${goal.id}-selector"]`);
        if (width < 700) await button.tap(); else await button.click();
        await revealed(page, goal);
      }
      // Even an unchanged selection reveals again after the visitor scrolls up.
      await showCards(page);
      await page.locator('.goal-select').last().click();
      await revealed(page, GOALS.at(-1));
      await page.screenshot({ path: `test-results/goal-scroll-${width}.png` });
      await showCards(page);
      await page.locator('.goal-select').first().focus();
      await page.keyboard.press('Enter'); await revealed(page, GOALS[0]);
      assert.equal(await page.locator('#goal-result').evaluate(node => node === document.activeElement), true);
      // Coalesced rapid selections must use the final committed panel only.
      await showCards(page);
      await page.evaluate(() => document.querySelectorAll('.goal-select').forEach(button => button.click()));
      await revealed(page, GOALS.at(-1));
      await page.emulateMedia({ reducedMotion: 'reduce' }); await showCards(page);
      await page.locator('.goal-select').first().click(); await revealed(page, GOALS[0], 'instant');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      for (const className of ['access-reduced-motion', 'a11y-reduce-motion']) {
        await page.evaluate(name => document.documentElement.classList.add(name), className);
        await showCards(page); await page.locator('.goal-select').nth(1).click();
        await revealed(page, GOALS[1], 'instant');
        await page.evaluate(name => document.documentElement.classList.remove(name), className);
      }
      await page.evaluate(() => document.querySelector('.app-header').style.minHeight = '170px');
      await showCards(page); await page.locator('.goal-select').first().click(); await revealed(page, GOALS[0]);
      // Ordinary data refreshes do not take over the reader's scroll position.
      await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); window.goalScrollCalls = []; window.dispatchEvent(new Event('bravo-content-changed')); });
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.deepEqual(errors, []);
      checks.push({ width, result: 'passed', cases: 'every card, repeated selection, keyboard, rapid changes, device/site reduced motion, taller header, no entry/refresh scroll' });
      console.log('PASS', width, 'card selection reveals the correct details below the header');
    } catch (error) {
      await page.screenshot({ path: `test-results/goal-scroll-failure-${width}.png`, fullPage: true });
      throw error;
    } finally { await context.close(); }
  }
  const { context, page, errors } = await setup(768, true);
  try {
    await page.waitForFunction(() => document.documentElement.classList.contains('site-content-owner'));
    await showCards(page);
    const label = page.locator('[data-site-content-key="goal-manners-label"]');
    const box = await label.boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8); await page.mouse.down();
    await page.getByRole('dialog', { name: 'Edit website section', exact: true }).waitFor();
    await page.mouse.up();
    assert.equal(await page.locator('.goal-result[data-plan-changed]').count(), 0, 'long press edits without selecting or scrolling');
    assert.deepEqual(errors, []);
    checks.push({ width: 390, result: 'passed', cases: 'owner long-press editor remains separate from normal tap' });
    console.log('PASS owner long-press remains an editor gesture');
  } finally { await context.close(); }
  await writeFile('test-results/goal-scroll-checks.json', JSON.stringify({ checks, productionWrites: 0 }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
