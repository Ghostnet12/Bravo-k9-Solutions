import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';

await mkdir('test-results', { recursive: true });
const fixture = new URL('../test-results/hero-editor-fixture.mp4', import.meta.url).pathname;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15', '-t', '3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fixture]);
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'hero_editor_browser';
process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString(); delete process.env.STRIPE_SECRET_KEY;
let server;
try {
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, HeroFilm, MediaUpload, MediaChunk } = await import('../server/models.js');
  const { SiteContent } = await import('../server/site-content-store.js');
  await connectDb();
  const tokens = {};
  for (const name of ['owner', 'administrator', 'staff']) {
    const user = await User.create({ ...(name === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), email: `${name}@example.test`, name, role: name === 'administrator' ? 'owner' : name, passwordHash: 'fixture' });
    const token = randomBytes(32).toString('hex'); tokens[name] = token;
    await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: user._id, expiresAt: new Date(Date.now() + 3600000) });
  }
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch({ ...(engineName === 'chromium' ? { channel: 'chrome' } : {}) });
    try { for (const width of [390, 1440]) {
      await HeroFilm.deleteMany({}); await SiteContent.deleteMany({}); await MediaUpload.deleteMany({}); await MediaChunk.deleteMany({});
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
      const signIn = async name => { await context.clearCookies(); if (name) await context.addCookies([{ name: 'bravo_session', value: tokens[name], url: origin }]); };
      await signIn('owner');
      const page = await context.newPage(), errors = [], retiredRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(()=>{window.heroPointerEvents=[];for(const type of ['pointerdown','pointerup','pointermove','pointercancel','pointerleave','scroll','blur'])document.addEventListener(type,event=>{window.heroPointerEvents.push({type,pointer:event.pointerType,target:event.target?.className,x:event.clientX,y:event.clientY});window.heroPointerEvents=window.heroPointerEvents.slice(-30);},true);});
      page.on('request', request => { if (/bravo-real-world\.(mp4|webm)|bravo-film-poster\.webp/.test(request.url())) retiredRequests.push(request.url()); });
      const film = page.locator('.cinema-film video');
      const videoDialog = page.getByRole('dialog', { name: 'Edit hero video', exact: true });
      const copyDialog = page.getByRole('dialog', { name: 'Edit website section', exact: true });
      async function holdAt(x, y) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); }
      async function holdFilm() {
        // Hit the actual visible hero, including its overlaid background layers.
        await page.evaluate(()=>document.fonts.ready);
        const point = await page.locator('.cinema-hero').evaluate(hero => {
          const box = hero.getBoundingClientRect();
          for (let y = Math.max(170, box.top + 170); y < Math.min(innerHeight - 120, box.bottom - 120); y += 30) {
            for (let x = 15; x < innerWidth - 15; x += 40) {
              const target = document.elementFromPoint(x, y);
              if (hero.contains(target) && !target.closest('button,a,[data-site-content-text=true],dialog')) return { x, y };
            }
          }
          throw new Error('No visible hero film surface');
        });
        await holdAt(point.x, point.y); await videoDialog.waitFor();
      }
      async function editCopy(text) {
        const intro = page.locator('.cinema-hero-intro');
        await intro.scrollIntoViewIfNeeded(); await page.waitForTimeout(350);
        const box = await intro.boundingBox(); await holdAt(box.x + 20, box.y + 10);
        await copyDialog.waitFor(); await copyDialog.getByLabel('Text', { exact: true }).fill(text);
        await copyDialog.getByRole('button', { name: 'Publish website changes', exact: true }).click();
        await copyDialog.waitFor({ state: 'hidden' });
        assert.equal((await SiteContent.findById('cinema-hero-intro').lean()).value.text, text);
      }
      try {
        await page.goto(origin); await page.getByRole('button', { name: 'Edit hero video', exact: true }).waitFor(); await page.waitForLoadState('networkidle');
        await holdFilm();
        assert.equal(await videoDialog.getByLabel('Choose video from files').count(), 1);
        assert.equal(await videoDialog.getByLabel('Facebook Reel URL', { exact: true }).count(), 0);
        await videoDialog.getByLabel('Choose video from files').setInputFiles(fixture);
        await videoDialog.getByLabel('Description', { exact: true }).fill('Owner uploaded opening film.');
        const publish = videoDialog.getByRole('button', { name: 'Publish changes', exact: true });
        await publish.click(); await videoDialog.waitFor({ state: 'hidden', timeout: 30000 });
        assert.equal((await HeroFilm.findById('opening').lean()).description, 'Owner uploaded opening film.');
        await page.waitForFunction(() => { const video = document.querySelector('.cinema-film video'); return video.currentSrc.includes('/api/hero-film/opening/video') && !video.paused && video.currentTime > 0; });
        await editCopy('Owner saved homepage copy.');
        retiredRequests.length = 0;
        await page.reload(); await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.cinema-hero-intro').innerText(), 'Owner saved homepage copy.');
        assert.ok((await film.evaluate(video => video.currentSrc)).includes('/api/hero-film/opening/video'));
        assert.deepEqual(retiredRequests, [], 'reload never downloads the retired opening film or poster');
        await signIn('administrator'); await page.reload(); await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Edit hero video', exact: true }).click(); await videoDialog.waitFor();
        await videoDialog.getByLabel('Description', { exact: true }).fill('Administrator updated opening film.');
        await videoDialog.getByRole('button', { name: 'Publish changes', exact: true }).click(); await videoDialog.waitFor({ state: 'hidden' });
        await editCopy('Administrator saved homepage copy.');
        await signIn(null); const response = await page.reload(); await page.waitForLoadState('networkidle');
        assert.ok((await response.text()).includes('Administrator saved homepage copy.'), 'public server render uses persisted copy');
        assert.equal(await page.locator('.cinema-hero-intro').innerText(), 'Administrator saved homepage copy.');
        assert.equal(await film.getAttribute('aria-label'), 'Administrator updated opening film.');
        await page.waitForFunction(() => { const video = document.querySelector('.cinema-film video'); return video.muted && video.playsInline && !video.paused && video.currentTime > 0; });
        assert.equal(await page.getByRole('button', { name: 'Edit hero video', exact: true }).count(), 0);
        const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
        try {
          const visitor = await noScript.newPage(); await visitor.goto(origin);
          assert.match(await visitor.locator('.cinema-film video source').first().getAttribute('src'), /^\/api\/hero-film\/opening\/video\?v=2$/);
          assert.equal(await visitor.locator('.cinema-hero-intro').innerText(), 'Administrator saved homepage copy.');
        } finally { await noScript.close(); }
        await page.screenshot({ path: `test-results/hero-editor-published-${engineName}-${width}.png` });
        await signIn('staff'); await page.reload(); await page.waitForLoadState('networkidle');
        assert.equal(await page.getByRole('button', { name: 'Edit hero video', exact: true }).count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS ${engineName}/${width}: real hold, upload, database save, owner/admin copy, reload, public SSR and muted autoplay`);
      } catch (error) {
        await page.screenshot({ path: `test-results/hero-editor-failure-${engineName}-${width}.png`, fullPage: true });
        await writeFile(`test-results/hero-editor-failure-${engineName}-${width}.json`, JSON.stringify({ error: error.message, errors, pointers:await page.evaluate(()=>window.heroPointerEvents), body: await page.locator('body').innerText() }, null, 2));
        throw error;
      } finally { await context.close(); }
    }} finally { await browser.close(); }
  }
} finally { server?.close(); await mongoose.disconnect(); await replica.stop(); }
