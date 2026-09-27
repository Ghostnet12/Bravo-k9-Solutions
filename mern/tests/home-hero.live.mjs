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
    if (response.ok && /name="bravo-hero-film" content="\{/.test(html)) { ready = true; break; }
  } catch { /* Deployment may still be switching; retry within the bounded window. */ }
  if (attempt < 17) await new Promise(resolve => setTimeout(resolve, 10000));
}
assert.ok(ready, 'Production HTML includes the published video hero');
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
        const video = document.querySelector('video[data-hero-film]'), hero = document.querySelector('.cinema-hero');
        if (video && hero) {
          const box = hero.getBoundingClientRect();
          window.heroSamples.push({ source: video.querySelector('source')?.getAttribute('src'), height: box.height, top: box.top + scrollY });
        }
        if (!window.stopHeroSamples) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { const v = document.querySelector('video[data-hero-film]'); return v?.muted && v.playsInline && !v.paused && v.currentTime > 0; }, {}, { timeout: 45000 });
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        window.stopHeroSamples = true;
        const v = document.querySelector('video[data-hero-film]');
        return { hero: JSON.parse(document.querySelector('meta[name="bravo-hero-film"]').content), samples: window.heroSamples, playback: { src: v.currentSrc, muted: v.muted, inline: v.playsInline, paused: v.paused, time: v.currentTime } };
      });
      assert.equal(await page.locator('video[data-hero-film]').count(), 1);
      assert.ok(state.samples.length > 5);
      assert.deepEqual([...new Set(state.samples.map(row => row.source))], [state.hero.src]);
      assert.equal(new URL(state.playback.src).pathname, new URL(state.hero.src, origin).pathname);
      for (const key of ['height', 'top']) assert.ok(Math.max(...state.samples.map(row => row[key])) - Math.min(...state.samples.map(row => row[key])) < 1, `Live ${name} ${width}: ${key} shifted`);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `test-results/live-${name}-${width}.png` });
      await writeFile(`test-results/live-${name}-${width}.json`, JSON.stringify({ ...state, errors }, null, 2));
      results.push({ browser: name, width, revision: state.hero.revision, playback: state.playback });
      console.log(`PASS LIVE ${name} ${width}: published hero revision ${state.hero.revision}, stable layout and muted inline autoplay`);
    } catch (error) {
      await page.screenshot({ path: `test-results/live-failure-${name}-${width}.png` });
      await writeFile(`test-results/live-failure-${name}-${width}.json`, JSON.stringify({ error: error.message, errors }));
      throw error;
    }
  } finally { await browser.close(); }
}
await writeFile('test-results/live-results.json', JSON.stringify(results, null, 2));
