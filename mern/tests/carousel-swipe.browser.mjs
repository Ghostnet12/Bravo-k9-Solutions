import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { chromium, webkit } from 'playwright';
import app from '../server/app.js';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_HERO_CAROUSEL } from '../shared/hero-carousel.js';
const server = express().use(app).listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const fixtures = {
          '/api/config': { connected: true, services: SERVICES }, '/api/auth/me': { user: null, services: [] },
          '/api/hero-carousel': { carousel: { ...DEFAULT_HERO_CAROUSEL, intervalSeconds: 2 } },
          '/api/hero-videos': { clips: [], nextCursor: null }, '/api/site-images': { images: {} },
          '/api/proof-videos': { clips: [1, 2, 3, 4].map(id => ({ id: String(id), title: `Training ${id}`, description: 'Swipe test clip', order: id, revision: 0, src: null, facebookUrl: 'https://www.facebook.com/reel/123456789', poster: '/images/david-northrop.webp' })), nextCursor: null, carousel: { intervalSeconds: 2, revision: 0 } },
          '/api/team': { team: [] }, '/api/reviews': { reviews: [], average: 0, count: 0 }, '/api/team/schedules': { schedules: [] },
        };
        return route.fulfill({ json: fixtures[path] || {} });
      });
      await page.goto(origin);
      const hero = page.locator('.hero-photo-window');
      await hero.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.hero-photo-slide img[loading="eager"]')].every(img => img.complete && img.naturalWidth));
      const activeIndex = () => page.locator('.hero-photo-slide').evaluateAll(slides => slides.findIndex(slide => slide.getAttribute('aria-hidden') === 'false'));
      const box = await hero.boundingBox(), x = box.x + box.width * .8, y = box.y + box.height * .5;
      // Real touch input in Chromium; WebKit exercises the same pointer gesture with a mouse.
      const touch = name === 'chromium' ? await context.newCDPSession(page) : null;
      async function down(at) {
        if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at, y }] });
        else { await page.mouse.move(at, y); await page.mouse.down(); }
      }
      async function move(at) {
        if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at, y }] });
        else await page.mouse.move(at, y, { steps: 5 });
      }
      async function up() {
        if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.mouse.up();
      }
      await down(x);
      const initial = await activeIndex();
      await page.waitForTimeout(2300);
      assert.equal(await activeIndex(), initial, 'holding the hero pauses automatic cycling');
      await move(x - 130); await up();
      const next = (initial + 1) % 3;
      await page.waitForFunction(expected => [...document.querySelectorAll('.hero-photo-slide')].findIndex(slide => slide.getAttribute('aria-hidden') === 'false') === expected, next);
      assert.equal(await page.getByRole('button', { name: 'Pause trainer photos', exact: true }).count(), 1, 'swipe does not trigger tap-to-pause');
      await page.waitForFunction(expected => [...document.querySelectorAll('.hero-photo-slide')].findIndex(slide => slide.getAttribute('aria-hidden') === 'false') === expected, (next + 1) % 3, { timeout: 6000 });
      await down(x - 130); const beforeRight = await activeIndex(); await move(x); await up();
      await page.waitForFunction(expected => [...document.querySelectorAll('.hero-photo-slide')].findIndex(slide => slide.getAttribute('aria-hidden') === 'false') === expected, (beforeRight + 2) % 3);
      // Native scrolling must settle on a card, then auto-advance from that card.
      const rail = page.locator('.proof-video-carousel');
      await rail.scrollIntoViewIfNeeded();
      const rb = await rail.boundingBox();
      if (touch) {
        const tx = rb.x + rb.width * .8, ty = rb.y + 100;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
        for (const dx of [30, 70, 120, 180]) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx - dx, y: ty }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else { await page.mouse.move(rb.x + rb.width / 2, rb.y + 100); await page.mouse.wheel(250, 0); }
      await page.waitForFunction(() => document.querySelector('.proof-video-carousel').scrollLeft > 30);
      await page.waitForTimeout(700);
      const settled = await rail.evaluate(node => {
        const max = node.scrollWidth - node.clientWidth;
        const cards = [...node.querySelectorAll('article')];
        return { left: node.scrollLeft, distance: Math.min(...cards.map(card => Math.abs(node.scrollLeft - Math.min(max, card.offsetLeft - cards[0].offsetLeft)))) };
      });
      assert.ok(settled.distance < 5, `${name}: native swipe snaps to a card (${settled.distance})`);
      await page.waitForFunction(left => Math.abs(document.querySelector('.proof-video-carousel').scrollLeft - left) > 30, settled.left, { timeout: 6000 });
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: swipe left/right, hold pause, no accidental tap, snap and automatic resume`);
      await context.close();
    } finally { await browser.close(); }
  }
} finally { server.close(); }
