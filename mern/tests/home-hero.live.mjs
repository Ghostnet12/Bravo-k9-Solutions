// Read-only post-deployment smoke test. Never signs in or changes site data.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const origin = 'https://bravounleashed.com';
let ready = false;
for (let attempt = 0; attempt < 18; attempt++) {
  try {
    const response = await fetch(origin, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (response.ok && /name="bravo-hero-film" content="[\[{]/.test(html)) { ready = true; break; }
  } catch { /* Deployment may still be switching; retry within the bounded window. */ }
  if (attempt < 17) await new Promise(resolve => setTimeout(resolve, 10000));
}
assert.ok(ready, 'Production HTML includes the published hero video or playlist');
await mkdir('test-results', { recursive: true });
const results = [];
for (const [name, engine, width] of [['webkit', webkit, 390], ['chromium', chromium, 390], ['chromium', chromium, 1440]]) {
  const browser = await engine.launch({ headless: true, ...(name === 'chromium' ? {channel:'chrome'} : {}) });
  try {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390, deviceScaleFactor: 1, extraHTTPHeaders:{DNT:'1'} });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.heroSamples = [];
      const sample = () => {
        const video = document.querySelector('.cinema-hero-still'), hero = document.querySelector('.cinema-hero');
        if (video && hero) {
          const box = hero.getBoundingClientRect();
          window.heroSamples.push({ source: video.getAttribute('src'), height: box.height, top: box.top + scrollY });
        }
        if (!window.stopHeroSamples) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.bringToFront();
      await page.waitForFunction(() => document.querySelector('.cinema-hero-still')?.naturalWidth > 0, {}, { timeout: 45000 });
      // Headless WebKit may throttle animation frames on a busy runner. Wait
      // for actual observations instead of assuming six frames in one second.
      // Keep every first-paint sample: a genuine layout shift must still fail.
      await page.waitForFunction(() => window.heroSamples.length > 5, {}, { polling: 100, timeout: 15000 });
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        window.stopHeroSamples = true;
        const image = document.querySelector('.cinema-hero-still');
        return { src: image.getAttribute('src'), samples: window.heroSamples };
      });
      assert.equal(await page.locator('video[data-hero-film]').count(), 0);
      assert.equal(state.src, '/images/hero-real-confidence.webp');
      assert.ok(state.samples.length > 5);
      for (const key of ['height', 'top']) assert.ok(Math.max(...state.samples.map(row => row[key])) - Math.min(...state.samples.map(row => row[key])) < 1, `Live ${name} ${width}: ${key} shifted`);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `test-results/live-${name}-${width}.png` });
      await writeFile(`test-results/live-${name}-${width}.json`, JSON.stringify({ ...state, errors }, null, 2));
      results.push({ browser: name, width, src: state.src });
      console.log(`PASS LIVE ${name} ${width}: cinematic still, stable layout and no hero video`);
    } catch (error) {
      await page.screenshot({ path: `test-results/live-failure-${name}-${width}.png` });
      const observations = await page.evaluate(() => ({ samples: window.heroSamples, visibility: document.visibilityState }));
      await writeFile(`test-results/live-failure-${name}-${width}.json`, JSON.stringify({ error: error.message, errors, ...observations }));
      throw error;
    }
  } finally { await browser.close(); }
}
await writeFile('test-results/live-results.json', JSON.stringify(results, null, 2));
