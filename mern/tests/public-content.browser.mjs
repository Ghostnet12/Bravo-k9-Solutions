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
    if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name))continue;
    const browser = await engine.launch();
    try {
      for (const routeCase of [
        { path: '/dog-training', chunk: 'DogTrainingPage', heading: /Dog training in Aberdeen, SD\./i, minimumText: 500 },
        { path: '/live', chunk: 'LivePage', heading: /BRAVO LIVE/i, minimumText: 100 },
        { path: '/training', chunk: 'TrainingPage', heading: /Find your training/i, minimumText: 500 },
        { path: '/our-approach', chunk: 'OurApproachPage', heading: /The Bravo approach/i, minimumText: 500 },
        { path: '/results', chunk: 'ResultsPage', heading: /Real dogs. Real progress/i, minimumText: 300 },
        { path: '/team', chunk: 'TeamPage', heading: /Meet Bravo/i, minimumText: 300 },
        { path: '/reviews', chunk: 'ReviewsPage', heading: /From our clients/i, minimumText: 150 },
      ]) for (const mode of ['slow', 'failed']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/live' ? { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() } : { user: null, services: [], lessons: [], team: [], images: {}, reviews: [], schedules: [] } }));
        let release, requested;
        const hold = new Promise(resolve => { release = resolve; });
        const intercepted = new Promise(resolve => { requested = resolve; });
        await page.route(`**/assets/${routeCase.chunk}-*.js`, async route => {
          requested();
          if (mode === 'failed') return route.abort();
          await hold; await route.continue();
        });
        try {
          await page.goto(origin + routeCase.path, { waitUntil: 'domcontentloaded' });
          await Promise.race([intercepted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Public chunk was not requested')), 10000); timer.unref(); })]);
          if (mode === 'failed') await page.waitForLoadState('load');
          assert.match(await page.locator('h1').innerText(), routeCase.heading);
          assert.ok((await page.locator('main').innerText()).length > routeCase.minimumText);
          assert.doesNotMatch(await page.locator('main').innerText(), /Opening Bravo|couldn’t load/);
          assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://bravounleashed.com${routeCase.path}`);
          if (mode === 'slow') {
            const mounted = page.waitForRequest('**/api/auth/me');
            release(); await mounted;
            if (routeCase.path === '/live') {
              await page.getByRole('heading', { name: 'OUT IN THE FIELD.', exact: true }).waitFor();
              await page.getByRole('link', { name: 'Explore our training', exact: true }).click();
              await page.getByRole('heading', { name: 'Dog training in Aberdeen, SD.', exact: true }).waitFor();
            } else if(routeCase.path === '/dog-training') {
              await page.getByRole('alert').filter({hasText:'Training videos could not load. Please try again.'}).waitFor();
              await page.getByRole('link', { name: 'two-trainer behavior assessment' }).click();
              await page.getByRole('heading', { name: 'Dog behavior assessments in Aberdeen.', exact: true }).waitFor();
              await page.waitForFunction(expected => document.title === expected, 'Dog Behavior Assessment in Aberdeen, SD | Bravo K9 Solutions');
              assert.equal(await page.title(), 'Dog Behavior Assessment in Aberdeen, SD | Bravo K9 Solutions');
            } else {
              await page.locator('.bravo-detail').waitFor();
              await page.locator('header a[href="/"]').click();await page.locator('.bravo-hub').waitFor();
            }
          }
          console.log(`PASS ${name} ${routeCase.path}: public HTML survives ${mode} JavaScript; ${mode === 'slow' ? 'interactive navigation resumes' : 'useful content remains'}`);
        } finally { release(); await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
