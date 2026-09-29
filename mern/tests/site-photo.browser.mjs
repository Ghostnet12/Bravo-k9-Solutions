import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8'), app = express();
app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`, key = 'team-ashley-northrop';
await mkdir('test-results', { recursive: true });
try { for (const [name, engine] of Object.entries({ chromium, webkit })) {
  if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name)) continue;
  const browser = await engine.launch();
  try { for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    let saved, submitted, confirmations = 0, imageGate = null, imageRequested = null;
    await page.addInitScript(() => {
      const encode = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) { return encode.call(this, type === 'image/webp' ? 'image/png' : type, quality); };
      const fetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await fetch(...args);
        if (window.losePhotoResponse && String(args[0]).endsWith('/site-images/team-ashley-northrop') && args[1]?.method === 'PUT') {
          window.losePhotoResponse = false;
          throw new DOMException('Fixture: server committed but the response was lost', 'AbortError');
        }
        return response;
      };
    });
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let json = { images: {}, entries: {}, clips: [], services: [], team: [], reviews: [], notifications: [], alerts: [], lessons: [] };
      if (path === '/api/auth/me') json = { user: { id: 'owner', role: 'owner', isPrimaryOwner: width === 390, name: 'Editor' }, services: [] };
      if (path === '/api/team') json = { team: [{ id: 'ashley', profileKey: 'ashley', name: 'Ashley Northrop', title: 'Trainer', image: '/images/ashley-northrop.webp', imageKey: key }] };
      if (path === '/api/site-images') json = { images: saved ? { [key]: saved } : {} };
      if (path === `/api/site-images/${key}` && request.method() === 'PUT') {
        submitted = request.postDataJSON();
        assert.equal(submitted.expectedRevision, saved?.revision || 0);
        saved = { ...submitted, data: undefined, revision: submitted.expectedRevision + 1, src: `/api/site-images/${key}/image?v=${submitted.expectedRevision + 1}`, framed: true };
        json = { image: saved };
      }
      if (path.startsWith(`/api/site-images/${key}/mutations/`)) { confirmations++; json = { image: confirmations >= 3 && path.endsWith(submitted.mutationId) ? saved : null }; }
      if (path === `/api/site-images/${key}/image`) {
        imageRequested?.(); if (imageGate) await imageGate;
        return route.fulfill({ contentType: submitted.contentType, body: Buffer.from(submitted.data, 'base64') });
      }
      await route.fulfill({ json });
    });
    try {
      await page.goto(origin); await page.waitForLoadState('networkidle');
      const photo = page.locator(`.home-team-grid [data-site-image-key="${key}"]`), dialog = page.getByRole('dialog', { name: 'Edit this photo', exact: true });
      await photo.scrollIntoViewIfNeeded(); await photo.press('F2'); await dialog.waitFor();
      const png = await page.evaluate(async () => {
        const image = new Image(); image.src = '/images/bravo-client-training.jpeg'; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
      });
      await dialog.getByLabel('Choose a replacement from files').setInputFiles({ name: 'iPhone-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await page.evaluate(() => { window.losePhotoResponse = true; });
      await dialog.getByRole('button', { name: 'Publish changes', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(submitted.contentType, 'image/jpeg', 'opaque photos use JPEG when Safari cannot encode WebP');
      assert.ok(Buffer.from(submitted.data, 'base64').length <= 512 * 1024);
      assert.match(submitted.filename, /\.jpg$/); assert.equal(confirmations, 3, 'keep checking while the disconnected save is still committing');
      await page.waitForFunction(key => { const image = document.querySelector(`.home-team-grid [data-site-image-key="${key}"]`); return image?.getAttribute('src').startsWith('/api/site-images/') && image.complete && image.naturalWidth > 0; }, key);
      let releaseImage;
      imageGate = new Promise(resolve => { releaseImage = resolve; });
      const requested = new Promise(resolve => { imageRequested = resolve; });
      await page.reload({ waitUntil: 'domcontentloaded' }); await photo.scrollIntoViewIfNeeded(); await requested;
      await page.waitForFunction(key => { const image = document.querySelector(`.home-team-grid [data-site-image-key="${key}"]`); return image?.complete && image.naturalWidth > 0; }, key);
      assert.equal(await photo.getAttribute('src'), '/images/ashley-northrop.webp', 'keep a visible photo while the saved upload loads');
      releaseImage(); imageGate = null; imageRequested = null;
      await page.waitForFunction(key => { const image = document.querySelector(`.home-team-grid [data-site-image-key="${key}"]`); return image?.getAttribute('src').includes('?v=1') && image.complete && image.naturalWidth > 0; }, key);
      await photo.press('F2'); await dialog.waitFor();
      const transparent = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; canvas.getContext('2d').fillRect(0, 0, 16, 16); return canvas.toDataURL('image/png').split(',')[1]; });
      await dialog.getByLabel('Choose a replacement from files').setInputFiles({ name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') });
      await dialog.getByRole('button', { name: 'Publish changes', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      assert.equal(submitted.contentType, 'image/png', 'transparent images retain alpha');
      await page.waitForFunction(key => document.querySelector(`.home-team-grid [data-site-image-key="${key}"]`)?.getAttribute('src').includes('?v=2'), key);
      assert.equal(await photo.evaluate(async image => { await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(31, 31, 1, 1).data[3]; }), 0);
      console.log(`PASS ${name}/${width}: Safari photo compression, lost-save confirmation, delayed reload and preserved transparency`);
    } catch (error) { await page.screenshot({ path: `test-results/site-photo-failure-${name}-${width}.png`, fullPage: true }); throw error; }
    finally { await context.close(); }
  } } finally { await browser.close(); }
} } finally { server.close(); }
