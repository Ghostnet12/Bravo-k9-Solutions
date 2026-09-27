import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express();
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });

async function fixtures(page, actor = () => null) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json = { services: [], images: {}, entries: {}, team: [], trainers: [], schedules: [], reviews: [], count: 0, clips: [], bookings: [], terms: [], messages: [], notifications: [], alerts: [], clients: [], revision: 0 };
    if (path === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['09:00', '10:00'] } };
    if (path === '/api/auth/me') json = { user: actor() ? { id: 'fixture', name: 'Bravo Fixture', role: actor(), phone: '6055550100' } : null, services: [], subscriptions: [], membership: { active: false } };
    if (path === '/api/site-banner') json = { alerts: [], settings: { motion: 'never' }, revision: 0 };
    return route.fulfill({ json });
  });
}
async function fits(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal page overflow`);
  const nav = await page.locator('.app-header').boundingBox();
  assert.ok(nav && nav.x >= 0 && nav.width <= (await page.viewportSize()).width, `${label}: navigation fits`);
}
async function darkSurface(locator, label) {
  const colors = await locator.evaluate(el => {
    const css = getComputedStyle(el);
    return { bg: css.backgroundColor.match(/[\d.]+/g).map(Number), text: css.color.match(/[\d.]+/g).map(Number) };
  });
  assert.ok(Math.max(...colors.bg.slice(0, 3)) < 65, `${label}: dark surface`);
  assert.ok(Math.min(...colors.text.slice(0, 3)) > 150, `${label}: readable light text`);
}

try {
  const engines = process.env.BROWSER_ENGINE ? { [process.env.BROWSER_ENGINE]: { chromium, webkit }[process.env.BROWSER_ENGINE] } : { chromium, webkit };
  for (const [engineName, engine] of Object.entries(engines)) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 });
        const page = await context.newPage(), errors = [];
        let role = null;
        page.on('pageerror', error => errors.push(error.message));
        await fixtures(page, () => role);
        for (const route of ['/', '/dog-training', '/behavior-assessment', '/dog-walking', '/contact', '/learn', '/account', '/portal?program=training']) {
          await page.goto(origin + route, { waitUntil: 'networkidle' });
          await page.locator('h1').waitFor();
          await darkSurface(page.locator('body'), route);
          assert.match(await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily), /Montserrat/);
          await fits(page, `${route}/${width}`);
          if (route === '/') {
            await page.waitForFunction(() => { const film = document.querySelector('.cinema-film video'); return film?.autoplay && film.muted && film.playsInline && !film.paused && film.currentTime > 0; });
            for (const selector of ['.cinema-training-card', '.cinema-team', '.cinema-events', '.cinema-learning-caption', '.bravo-footer']) await darkSurface(page.locator(selector), selector);
            const headingColor = await page.locator('.cinema-program-copy h3').evaluate(el => getComputedStyle(el).color.match(/\d+/g).map(Number));
            assert.ok(Math.min(...headingColor) > 150, 'training headline remains readable on the dark card');
            if (width === 390) {
              await page.getByRole('button', { name: 'Menu', exact: true }).click();
              await page.keyboard.press('Escape');
              assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'false');
              await page.getByRole('button', { name: 'Menu', exact: true }).click();
              await page.setViewportSize({ width: 1440, height: 900 });
              await page.waitForFunction(() => !document.querySelector('#bravo-navigation').classList.contains('is-open'));
              await fits(page, 'resize to desktop');
              await page.setViewportSize({ width, height: 900 });
            }
          } else {
            for (const panel of await page.locator('.app-page .panel').all()) {
              if (await panel.isVisible()) await darkSurface(panel, `${route} panel`);
            }
          }
          if (['/', '/dog-training', '/account', '/portal?program=training'].includes(route)) await page.screenshot({ path: `test-results/theme-${engineName}-${width}-${route.split('?')[0].replaceAll('/', '') || 'home'}.png` });
        }
        for (role of ['member', 'staff', 'owner']) {
          await page.goto(`${origin}/portal?program=training`, { waitUntil: 'networkidle' });
          const menu = page.getByRole('button', { name: 'Menu', exact: true });
          await menu.click();
          const nav = page.getByRole('navigation', { name: 'Primary navigation' });
          await nav.getByRole('link', { name: role === 'member' ? 'My schedule' : 'Team schedule', exact: true }).waitFor();
          await fits(page, `${role} menu/${width}`);
          await page.keyboard.press('Escape');
          assert.equal(await menu.getAttribute('aria-expanded'), 'false');
          if (role !== 'member') {
            await darkSurface(page.locator('.program-choice.is-selected'), `${role} selected program`);
            assert.ok(await page.locator('.program-choice.is-selected').getAttribute('aria-pressed') === 'true');
          }
        }
        assert.deepEqual(errors, [], `${engineName}/${width}: no runtime errors`);
        await context.close();
      }
      // Simulate an autoplay policy that unlocks on the first real interaction.
      const recovery = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await recovery.addInitScript(() => {
        let unlocked = false;
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          return this.closest('.cinema-film') && !unlocked ? Promise.reject(new DOMException('Fixture autoplay blocked', 'NotAllowedError')) : play.call(this);
        };
        document.addEventListener('play', event => { if (event.target.closest?.('.cinema-film') && !unlocked) event.target.pause(); }, true);
        document.addEventListener('pointerdown', () => { unlocked = true; }, { capture: true, once: true });
      });
      const page = await recovery.newPage(); await fixtures(page);
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => { const v = document.querySelector('.cinema-film video'); return v?.readyState >= 3 && v.paused; });
      await page.locator('h1').click();
      await page.waitForFunction(() => { const v = document.querySelector('.cinema-film video'); return !v.paused && v.currentTime > 0; });
      await page.getByRole('button', { name: 'Pause training film', exact: true }).click();
      await page.locator('h1').click(); await page.keyboard.press('Shift');
      assert.equal(await page.locator('.cinema-film video').evaluate(v => v.paused), true, 'later interactions must preserve an explicit pause');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('.cinema-film video').evaluate(v => v.paused), true, 'reduced motion suppresses autoplay');
      await recovery.close();
      console.log(`PASS ${engineName}: dark public/workspace surfaces, mobile navigation, resize, native autoplay and policy recovery`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
