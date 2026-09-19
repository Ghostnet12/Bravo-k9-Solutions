import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { chromium, webkit } from 'playwright';
import app from '../server/app.js';

const server = express().use(app).listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const mode of ['slow', 'failed']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.route('**/api/**', route => route.fulfill({ json: { user: null, services: [], lessons: [], team: [], images: {}, reviews: [], schedules: [] } }));
        let release, requested;
        const hold = new Promise(resolve => { release = resolve; });
        const intercepted = new Promise(resolve => { requested = resolve; });
        await page.route('**/assets/DogTrainingPage-*.js', async route => {
          requested();
          if (mode === 'failed') return route.abort();
          await hold; await route.continue();
        });
        try {
          await page.goto(origin + '/dog-training', { waitUntil: 'domcontentloaded' });
          await Promise.race([intercepted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Public chunk was not requested')), 10000); timer.unref(); })]);
          if (mode === 'failed') await page.waitForLoadState('load');
          assert.match(await page.locator('h1').innerText(), /Dog training in Aberdeen, SD\./i);
          assert.ok((await page.locator('main').innerText()).length > 500);
          assert.doesNotMatch(await page.locator('main').innerText(), /Opening Bravo|couldn’t load/);
          assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://bravounleashed.com/dog-training');
          if (mode === 'slow') {
            const mounted = page.waitForRequest('**/api/auth/me');
            release(); await mounted;
            await page.getByRole('link', { name: 'two-trainer behavior assessment' }).click();
            await page.getByRole('heading', { name: 'Dog behavior assessments in Aberdeen.', exact: true }).waitFor();
            assert.equal(await page.title(), 'Dog Behavior Assessment in Aberdeen, SD | Bravo K9 Solutions');
          }
          console.log(`PASS ${name}: public HTML survives ${mode} JavaScript; ${mode === 'slow' ? 'interactive navigation resumes' : 'useful content remains'}`);
        } finally { release(); await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
