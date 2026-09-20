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
      let videoFixture = false;
      const videoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      await page.route('**/gesture-test.mp4', route => route.fulfill({ contentType: 'video/mp4', body: Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAQibW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAATiAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAA0x0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAATiAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAE4gAACAAAABAAAAAALEbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAFAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACb21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAi9zdGJsAAAAv3N0c2QAAAAAAAAAAQAAAK9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANWF2Y0MBZAAK/+EAGGdkAAqs2UlsBEAAAAMAQAAAAwCDxIllgAEABmjr48siwP34+AAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAABhwAAAYcAAAAYc3R0cwAAAAAAAAABAAAAFAAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAAKhjdHRzAAAAAAAAABMAAAABAACAAAAAAAEAAUAAAAAAAQAAgAAAAAABAAAAAAAAAAEAAEAAAAAAAQABQAAAAAABAACAAAAAAAEAAAAAAAAAAQAAQAAAAAABAAFAAAAAAAEAAIAAAAAAAQAAAAAAAAABAABAAAAAAAEAAUAAAAAAAQAAgAAAAAABAAAAAAAAAAEAAEAAAAAAAQABAAAAAAACAABAAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAFAAAAAEAAABkc3RzegAAAAAAAAAAAAAAFAAAAsoAAAANAAAADAAAAAwAAAAMAAAAEwAAAA4AAAAMAAAADAAAABMAAAAOAAAADAAAAAwAAAATAAAADgAAAAwAAAAMAAAAEwAAAA4AAAAMAAAAFHN0Y28AAAAAAAAAAQAABFIAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYwLjE2LjEwMAAAAAhmcmVlAAAD221kYXQAAAKtBgX//6ncRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49MSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAABVliIQAF//+99S3zLLuByK2C4Y/o/8AAAAJQZokbEF//trgAAAACEGeQniC3xsxAAAACAGeYXRBXxwwAAAACAGeY2pBXxwxAAAAD0GaaEmoQWiZTAgv//7a4QAAAApBnoZFESwW/xsxAAAACAGepXRBXxwxAAAACAGep2pBXxwwAAAAD0GarEmoQWyZTAgv//7a4AAAAApBnspFFSwW/xsxAAAACAGe6XRBXxwwAAAACAGe62pBXxwwAAAAD0Ga8EmoQWyZTAgv//7a4QAAAApBnw5FFSwW/xsxAAAACAGfLXRBXxwxAAAACAGfL2pBXxwwAAAAD0GbM0moQWyZTAgr//7W4AAAAApBn1FFFSwV/xwxAAAACAGfcmpBXxww', 'base64') }));
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const fixtures = {
          '/api/config': { connected: true, services: SERVICES }, '/api/auth/me': { user: null, services: [] },
          '/api/hero-carousel': { carousel: { ...DEFAULT_HERO_CAROUSEL, photos: videoFixture ? [`hero-video-${videoId}`, 'team-ashley-northrop'] : DEFAULT_HERO_CAROUSEL.photos, intervalSeconds: 2 } },
          '/api/hero-videos': { clips: videoFixture ? [{ id: videoId, src: '/gesture-test.mp4', title: 'Gesture test video', description: '', revision: 0 }] : [], nextCursor: null }, '/api/site-images': { images: { 'team-ashley-northrop': { src: '/images/ashley-leverock.webp', alt: 'Ashley, Bravo trainer' } } },
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
      async function swipe(direction = 1) {
        if (touch) {
          const start = direction > 0 ? x : x - 240;
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
          for (const dx of [40, 100, 170, 240]) {
            await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start - direction * dx, y }] });
            await page.waitForTimeout(40);
          }
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await page.mouse.move(x, y);
          await page.mouse.wheel(direction * 300, 0);
        }
      }
      await down(x);
      const initial = await activeIndex();
      await page.waitForTimeout(2300);
      assert.equal(await activeIndex(), initial, 'holding the hero pauses automatic cycling');
      // Cancel this hold without a synthetic tap, then exercise native scrolling.
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else { await page.mouse.move(box.x - 5, y); await page.mouse.up(); }
      await swipe();
      await page.waitForFunction(() => document.querySelector('.hero-photo-window').scrollLeft > 30);
      const next = (initial + 1) % 3;
      await page.waitForFunction(expected => [...document.querySelectorAll('.hero-photo-slide')].findIndex(slide => slide.getAttribute('aria-hidden') === 'false') === expected, next);
      assert.equal(await page.getByRole('button', { name: 'Pause trainer photos', exact: true }).count(), 1, 'swipe does not trigger tap-to-pause');
      try {
        await page.waitForFunction(expected => [...document.querySelectorAll('.hero-photo-slide')].findIndex(slide => slide.getAttribute('aria-hidden') === 'false') === expected, (next + 1) % 3, { timeout: 6000 });
      } catch (error) {
        console.log('Hero resume diagnostic', await page.locator('.home-hero-gallery').evaluate(node => ({
          rect: node.getBoundingClientRect().toJSON(), hidden: document.hidden,
          pause: node.querySelector('.hero-photo-controls').innerText,
          slides: [...node.querySelectorAll('.hero-photo-slide')].map(slide => ({ active: slide.getAttribute('aria-hidden'), image: slide.querySelector('img')?.naturalWidth })),
        })));
        throw error;
      }
      await page.waitForFunction(() => {
        const node = document.querySelector('.hero-photo-window');
        return Math.abs(node.scrollLeft - 2 * node.clientWidth) < 3;
      });
      const beforeRight = await activeIndex(); await swipe(-1);
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
      await page.waitForFunction(() => {
        const node = document.querySelector('.proof-video-carousel');
        const max = node.scrollWidth - node.clientWidth;
        const cards = [...node.querySelectorAll('article')];
        return node.scrollLeft > 30 && Math.min(...cards.map(card => Math.abs(node.scrollLeft - Math.min(max, card.offsetLeft - cards[0].offsetLeft)))) < 5;
      }, null, { timeout: 5000 });
      const settled = await rail.evaluate(node => {
        const max = node.scrollWidth - node.clientWidth;
        const cards = [...node.querySelectorAll('article')];
        return { left: node.scrollLeft, distance: Math.min(...cards.map(card => Math.abs(node.scrollLeft - Math.min(max, card.offsetLeft - cards[0].offsetLeft)))) };
      });
      assert.ok(settled.distance < 5, `${name}: native swipe snaps to a card (${settled.distance})`);
      await page.waitForFunction(left => Math.abs(document.querySelector('.proof-video-carousel').scrollLeft - left) > 30, settled.left, { timeout: 6000 });
      videoFixture = true;
      await page.goto(origin);
      await hero.scrollIntoViewIfNeeded();
      await page.locator('.hero-video-swipe-surface').waitFor({ state: 'attached' });
      await swipe();
      await page.waitForFunction(() => document.querySelectorAll('.hero-photo-slide')[1].getAttribute('aria-hidden') === 'false');
      await page.waitForFunction(() => {
        const node = document.querySelector('.hero-photo-window');
        return Math.abs(node.scrollLeft - node.clientWidth) < 3;
      });
      assert.ok(await page.locator('.hero-video-swipe-surface').evaluate(node => {
        const box = node.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === node;
      }), 'touches over a hero video land on the scroll surface');
      await swipe();
      await page.waitForFunction(() => document.querySelectorAll('.hero-photo-slide')[2].getAttribute('aria-hidden') === 'false');
      assert.ok(await page.locator('.hero-video video').evaluate(video => video.paused), 'departed hero video stops playing');
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: swipe left/right, hold pause, no accidental tap, snap and automatic resume`);
      await context.close();
    } finally { await browser.close(); }
  }
} finally { server.close(); }
