// Read-only post-deployment smoke test. Never signs in or changes site data.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const origin = 'https://bravounleashed.com';
let ready = false;
for (let attempt = 0; attempt < 18; attempt++) {
  const response = await fetch(origin, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (response.ok && /name="bravo-home-hero" content="\{/.test(html)) { ready = true; break; }
  await new Promise(resolve => setTimeout(resolve, 10000));
}
assert.ok(ready, 'Production root must serve published hero metadata, not the static shell');
await mkdir('test-results', { recursive: true });
const results = [];
for (const [name, engine, width] of [['webkit', webkit, 390], ['chromium', chromium, 390], ['chromium', chromium, 1440]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.heroSamples = [];
      const sample = () => {
        const image = document.querySelector('.home-hero-image'), hero = document.querySelector('.home-hero');
        if (image && hero) {
          const box = hero.getBoundingClientRect(), style = getComputedStyle(image);
          window.heroSamples.push({ src: image.getAttribute('src'), height: box.height, top: box.top + scrollY, fit: style.objectFit, position: style.objectPosition, transform: style.transform, loaded: image.complete && image.naturalWidth > 0 });
        }
        if (!window.stopHeroSamples) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('.home-hero-image').waitFor({ state: 'visible' });
    await page.waitForFunction(() => { const image = document.querySelector('.home-hero-image'); return image?.complete && image.naturalWidth > 0; });
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => {
      window.stopHeroSamples = true;
      return { hero: JSON.parse(document.querySelector('meta[name="bravo-home-hero"]').content), samples: window.heroSamples };
    });
    await page.screenshot({ path: `test-results/live-${name}-${width}.png` });
    await writeFile(`test-results/live-${name}-${width}.json`, JSON.stringify({ ...state, errors }, null, 2));
    const { samples, hero } = state;
    assert.ok(samples.length > 5);
    assert.deepEqual([...new Set(samples.map(row => row.src))], [hero.src]);
    for (const key of ['fit', 'position', 'transform']) assert.equal(new Set(samples.map(row => row[key])).size, 1, `Live ${name} ${width}: late ${key} change`);
    for (const key of ['height', 'top']) assert.ok(Math.max(...samples.map(row => row[key])) - Math.min(...samples.map(row => row[key])) < 1, `Live ${name} ${width}: ${key} shifted`);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('.home-hero-image').count(), 1);
    results.push({ browser: name, width, frames: samples.length, revision: hero.revision, first: samples[0], last: samples.at(-1) });
    console.log(`PASS LIVE ${name} ${width}: revision ${hero.revision}, ${samples.length} stable frames`);
  } finally { await browser.close(); }
}
await writeFile('test-results/live-results.json', JSON.stringify(results, null, 2));
