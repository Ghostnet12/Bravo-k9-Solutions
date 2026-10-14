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
      const page = await context.newPage(), errors = [], browserDiagnostics = [], retiredRequests = [];
      // Keep browser-internal diagnostics, including WebKit's cancelled old-
      // document polling requests. Assert actual DOM runtime errors and
      // unhandled rejections separately, as the discovery regression does.
      page.on('pageerror', error => browserDiagnostics.push({ message: error.message, stack: error.stack, url: page.url() }));
      await page.exposeFunction('recordHeroRuntimeError', message => errors.push(message));
      await page.addInitScript(() => {
        window.addEventListener('error', event => { if (event instanceof ErrorEvent) void window.recordHeroRuntimeError(event.error?.stack || event.message).catch(() => {}); });
        window.addEventListener('unhandledrejection', event => { void window.recordHeroRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {}); });
      });
      await page.addInitScript(()=>{window.heroPointerEvents=[];for(const type of ['pointerdown','pointerup','pointermove','pointercancel','pointerleave','scroll','blur'])document.addEventListener(type,event=>{window.heroPointerEvents.push({type,pointer:event.pointerType,target:event.target?.className,x:event.clientX,y:event.clientY});window.heroPointerEvents=window.heroPointerEvents.slice(-30);},true);});
      page.on('request', request => { if (/bravo-real-world\.(mp4|webm)|bravo-film-poster\.webp/.test(request.url())) retiredRequests.push(request.url()); });
      const copyDialog = page.getByRole('dialog', { name: 'Edit website section', exact: true });
      async function holdAt(x, y) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); }
      async function editCopy(text) {
        const copyKey = width <= 700 ? 'conversion-hero-intro' : 'cinema-hero-intro';
        const intro = page.locator(`[data-site-content-key="${copyKey}"]`);
        const other = page.locator(`.cinema-hero-intro .${width <= 700 ? 'conversion-desktop' : 'conversion-mobile'}`);
        const originalOther = await other.textContent();
        await intro.scrollIntoViewIfNeeded(); await page.waitForTimeout(350);
        const box = await intro.boundingBox(); await holdAt(box.x + 20, box.y + 10);
        await copyDialog.waitFor(); await copyDialog.getByLabel('Text', { exact: true }).fill(text);
        await copyDialog.getByRole('button', { name: 'Publish website changes', exact: true }).click();
        await copyDialog.waitFor({ state: 'hidden' });
        assert.equal((await SiteContent.findById(copyKey).lean()).value.text, text);
        assert.equal(await other.textContent(), originalOther, 'editing one breakpoint must preserve the other variant');
      }
      try {
        await page.goto(origin); await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.cinema-film video').count(), 0);
        await page.waitForFunction(() => document.querySelector('.cinema-hero-still')?.naturalWidth > 0);
        await editCopy('Owner saved homepage copy.');
        await page.reload(); await page.waitForLoadState('networkidle');
        assert.equal((await page.locator('.cinema-hero-intro').innerText()).trim(), 'Owner saved homepage copy.');
        await signIn('administrator'); await page.reload(); await page.waitForLoadState('networkidle');
        await editCopy('Administrator saved homepage copy.');
        await signIn(null); const response = await page.reload(); await page.waitForLoadState('networkidle');
        assert.ok((await response.text()).includes('Administrator saved homepage copy.'));
        assert.equal((await page.locator('.cinema-hero-intro').innerText()).trim(), 'Administrator saved homepage copy.');
        assert.equal(await page.locator('.cinema-film video').count(), 0);
        await page.screenshot({ path: `test-results/hero-editor-published-${engineName}-${width}.png` });
        assert.deepEqual(errors, []);
        console.log(`PASS ${engineName}/${width}: image hero, owner/admin copy, database persistence and public SSR`);
      } catch (error) {
        await page.screenshot({ path: `test-results/hero-editor-failure-${engineName}-${width}.png`, fullPage: true });
        await writeFile(`test-results/hero-editor-failure-${engineName}-${width}.json`, JSON.stringify({ error: error.message, errors, browserDiagnostics, pointers:await page.evaluate(()=>window.heroPointerEvents), body: await page.locator('body').innerText() }, null, 2));
        throw error;
      } finally {
        await writeFile(`test-results/hero-editor-diagnostics-${engineName}-${width}.json`, JSON.stringify({ errors, browserDiagnostics }, null, 2));
        await context.close();
      }
    }} finally { await browser.close(); }
  }
} finally { server?.close(); await mongoose.disconnect(); await replica.stop(); }
