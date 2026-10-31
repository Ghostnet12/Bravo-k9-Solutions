// Local synthetic endpoints only: these requests never contact subscribers.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const app = express(); app.use(express.json());
let failSignup = false, submissions = [];
app.post('/api/transport-interest', (req, res) => {
  submissions.push(req.body);
  if (failSignup) return res.status(503).json({ error: 'Please try again.' });
  res.status(202).json({ ok: true });
});
app.use('/api', (req, res) => {
  const fixtures = {
    '/config': { connected: true, services: SERVICES, paymentsReady: false },
    '/auth/me': { user: null, services: [] },
    '/live': { sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() },
    '/site-content': { entries: {} }, '/site-images': { images: {} }, '/team': { team: [] },
    '/reviews': { reviews: [], recommendations: [], count: 0 }, '/proof-videos': { clips: [] }, '/hero-videos': { clips: [] },
  };
  res.json(fixtures[req.path] || {});
});
for (const [path, file] of [['/', 'bravo-shell'], ['/k9-transport', 'k9-transport'], ['/contact', 'contact']]) {
  const html = await readFile(`${dist}/${file}.html`, 'utf8');
  app.get(path, (_req, res) => res.type('html').send(html));
}
app.use(express.static(dist));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
    const browser = await engine.launch();
    try {
      const raw = await browser.newPage({ javaScriptEnabled: false });
      await raw.goto(origin + '/k9-transport');
      assert.match(await raw.locator('h1').innerText(), /K9\s*Transport/i);
      assert.equal(await raw.locator('.transport-badge').innerText(), 'COMING SOON');
      assert.equal(await raw.locator('meta[property="og:image"]').getAttribute('content'), 'https://bravounleashed.com/images/bravo-k9-transport.webp');
      await raw.goto(origin + '/');
      assert.equal(await raw.locator('.hub-transport a').getAttribute('href'), '/k9-transport');
      await raw.close();
      for (const width of [360, 390, 768, 1050, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(origin + '/k9-transport');
          await page.locator('.transport-photo img').evaluate(img => img.decode());
          assert.equal(await page.locator('h1').count(), 1);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${width}: overflow ${await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => [el.tagName,el.className,Math.round(el.getBoundingClientRect().right)]).slice(0,15))}`);
          assert.equal(await page.locator('.transport-hero img').count(), 1);
          const photo = await page.locator('.transport-photo').boundingBox(), badge = await page.locator('.transport-badge').boundingBox();
          assert.ok(badge.x >= photo.x && badge.x + badge.width <= photo.x + photo.width && badge.y >= photo.y && badge.y + badge.height <= photo.y + photo.height);
          assert.equal(await page.locator('header a[href="/k9-transport"]').count(), 1);
          assert.equal(await page.locator('footer a[href="/k9-transport"]').count(), 1);
          await page.screenshot({ path: `test-results/transport-${name}-${width}.png`, fullPage: true });
          await page.locator('.transport-primary').click();
          await page.waitForURL('**/k9-transport#transport-updates');
          await page.getByLabel('Email address', { exact: true }).fill('visitor@example.test');
          const submit = page.getByRole('button', { name: 'Request a launch update', exact: true });
          assert.equal(await submit.isDisabled(), true);
          await page.getByLabel('Email me once when Bravo K9 transport launches.').check();
          failSignup = true; submissions = [];
          await submit.click();
          await page.getByRole('alert').waitFor();
          assert.equal(await page.getByLabel('Email address', { exact: true }).inputValue(), 'visitor@example.test');
          failSignup = false; await submit.click();
          await page.getByText('Your request is saved. Bravo can email you when K9 transport launches.').waitFor();
          assert.deepEqual(submissions.at(-1), { email: 'visitor@example.test', consent: true, website: '' });
          await page.locator('.transport-contact').click();
          await page.waitForURL('**/contact?interest=k9-transport');
          assert.match(await page.locator('.contact-interest').innerText(), /K9 transport is coming soon/);
          // Follow the customer path. Reloading here aborts the contact page's
          // pending content read, which WebKit reports as an access-control error.
          await page.locator('header a[href="/"]').click();
          await page.waitForURL(origin + '/');
          await page.locator('.hub-transport').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => { const img = document.querySelector('.hub-transport img'); return img?.complete && img.naturalWidth > 0; });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.equal(await page.locator('.hub-transport h2').count(), 1);
          assert.equal(await page.locator('main a[href="/workshops"]').count(),1);
          await page.locator('.hub-transport').screenshot({ path: `test-results/transport-home-${name}-${width}.png` });
          await page.locator('.hub-transport a').click();
          await page.waitForURL('**/k9-transport');
          await page.locator('.transport-primary').click();await page.waitForURL('**/k9-transport#transport-updates');
          await page.getByLabel('Email address', { exact: true }).waitFor();
          assert.deepEqual(errors, []);
          console.log(`PASS ${name}/${width}: transport layout, navigation, consent, retry and signup`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  console.log('Transport: responsive layout, static rendering, navigation, consent, retry and signup passed.');
} finally { await new Promise(resolve => server.close(resolve)); }
