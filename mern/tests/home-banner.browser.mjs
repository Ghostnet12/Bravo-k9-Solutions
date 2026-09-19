import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
        let saved = { revision: 0, alerts: ['Bravo fixture announcement'] }, role = 'owner', failSave = false;
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname;
          let json = { services: [], team: [], images: {}, reviews: [], schedules: [], clips: [], count: 0 }, status = 200;
          if (path === '/api/auth/me') json = { user: role ? { id: 'fixture', role, name: 'Fixture' } : null, services: [] };
          if (path === '/api/site-banner') {
            if (route.request().method() === 'PUT') {
              if (failSave) { status = 409; json = { error: 'Alerts changed while you were editing.' }; }
              else { const body = route.request().postDataJSON(); assert.equal(body.expectedRevision, saved.revision); saved = { alerts: body.alerts, settings: body.settings, revision: saved.revision + 1 }; json = saved; }
            } else json = saved;
          }
          if (path === '/api/site-banner/weather') json = { weather: { temperature: 63, description: 'Cloudy', observedAt: new Date().toISOString() } };
          await route.fulfill({ status, json });
        });
        try {
          await page.goto(origin); await page.getByRole('button', { name: 'Edit banner', exact: true }).waitFor();
          const banner = page.locator('.home-status-banner');
          assert.equal(await banner.evaluate(el => el.previousElementSibling.className), 'home-hero');
          assert.ok((await banner.innerText()).includes('63°F'));
          assert.equal(await page.locator('.banner-track').evaluate(el => getComputedStyle(el).animationName), 'bravo-banner-left');
          await banner.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/banner-moving-${engineName}-${width}.png` });
          await page.getByRole('button', { name: 'Pause banner', exact: true }).click();
          assert.equal(await page.locator('.banner-track').evaluate(el => getComputedStyle(el).animationName), 'none');
          await page.getByRole('button', { name: 'Edit banner', exact: true }).click();
          await page.getByLabel('Location text', { exact: true }).fill('Aberdeen & Bath');
          await page.getByLabel('Custom time text (blank = automatic Central Time)', { exact: true }).fill('Training hours: call Bravo');
          await page.getByLabel('Custom weather text (blank = automatic Aberdeen weather)', { exact: true }).fill('Outdoor sessions available');
          await page.getByText('Colors, text size & scrolling', { exact: true }).click();
          await page.getByLabel('Text size: 14', { exact: true }).press('ArrowRight');
          await page.getByRole('button', { name: '+ Add alert', exact: true }).click();
          await page.getByLabel('Alert 2', { exact: true }).fill('New training notice <script>not executable</script>');
          failSave = true; await page.getByRole('button', { name: 'Publish banner', exact: true }).click(); await page.getByRole('alert').waitFor();
          assert.ok((await page.getByLabel('Alert 2', { exact: true }).inputValue()).includes('New training notice'));
          failSave = false; await page.getByRole('button', { name: 'Publish banner', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert.equal(saved.settings.fontSize, 15);
          assert.ok((await banner.innerText()).includes('New training notice')); assert.ok((await banner.innerText()).includes('Aberdeen & Bath')); assert.ok((await banner.innerText()).includes('Outdoor sessions available'));
          await page.reload(); await page.getByRole('button', { name: 'Edit banner', exact: true }).waitFor();
          assert.ok((await banner.innerText()).includes('New training notice')); assert.ok((await banner.innerText()).includes('Aberdeen & Bath')); assert.ok((await banner.innerText()).includes('Outdoor sessions available'));
          // Hold without moving opens the same editor; normal scroll cancels it.
          await banner.scrollIntoViewIfNeeded(); const box = await banner.boundingBox();
          await page.mouse.move(box.x + 40, box.y + 20); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
          await page.getByRole('dialog').waitFor(); await page.getByRole('button', { name: 'Close banner editor' }).click();
          await page.getByRole('button', { name: 'Pause banner' }).click();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `test-results/banner-${engineName}-${width}.png`, fullPage: false });
          await page.emulateMedia({ reducedMotion: 'reduce' });
          assert.equal(await page.locator('.banner-track').evaluate(el => getComputedStyle(el).animationName), 'none');
          for (const visitorRole of ['staff', 'member', null]) {
            role = visitorRole; await page.reload(); await page.waitForLoadState('networkidle'); assert.equal(await page.getByRole('button', { name: 'Edit banner' }).count(), 0);
          }
          assert.deepEqual(errors, []); console.log(`PASS ${engineName} ${width}: placement, weather, movement, pause, long-press, editing, persistence, conflicts and restricted editor`);
        } catch (error) {
          await page.screenshot({ path: `test-results/banner-failure-${engineName}-${width}.png`, fullPage: true });
          await writeFile(`test-results/banner-failure-${engineName}-${width}.json`, JSON.stringify({ error: error.message, errors, text: await page.locator('body').innerText() }, null, 2));
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }
