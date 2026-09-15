import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';

await mkdir('test-results', { recursive: true });
const mediaPath = new URL('../test-results/proof-upload-fixture.mp4', import.meta.url).pathname;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15', '-t', '5', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mediaPath]);
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'proof_video_browser';
process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString(); delete process.env.STRIPE_SECRET_KEY;
let server;
try {
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, ProofVideo, MediaUpload, MediaChunk } = await import('../server/models.js');
  await connectDb();
  const tokens = {};
  for (const role of ['owner', 'staff', 'member']) {
    const user = await User.create({ ...(role === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), email: `${role}@example.test`, name: `Fixture ${role}`, role, passwordHash: 'test-only' });
    const token = randomBytes(32).toString('hex'); tokens[role] = token;
    await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: user._id, expiresAt: new Date(Date.now() + 3600000) });
  }
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    // Branded Chrome includes MP4/H.264; the bundled open-source Chromium does not.
    const browser = await engine.launch({ headless: true, ...(engineName === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      for (const width of [390, 1440]) {
        await ProofVideo.deleteMany({}); await MediaUpload.deleteMany({}); await MediaChunk.deleteMany({});
        const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
        await context.addCookies([{ name: 'bravo_session', value: tokens.owner, url: origin }]);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => { window.proofClicks = []; document.addEventListener('click', event => { window.proofClicks.push({ tag: event.target.tagName, label: event.target.getAttribute('aria-label'), text: event.target.textContent?.slice(0, 80) }); window.proofClicks = window.proofClicks.slice(-6); }, true); });
        const response = await page.goto(origin); const add = page.getByRole('button', { name: /Add video/ }); await add.waitFor();
        await page.waitForFunction(() => document.querySelectorAll('[data-proof-video]').length === 3);

        // Press and hold on the existing Facebook thumbnail must open the editor,
        // suppress the following tap, and leave the Facebook destination unopened.
        const original = page.locator('[data-proof-video="1850999522754029"]');
        await original.scrollIntoViewIfNeeded();
        // Let the route's initial focus and scroll settle before starting a hold.
        await page.waitForTimeout(350);
        const originalImage = original.locator('img');
        await originalImage.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 300 });
        const dialog = page.getByRole('dialog', { name: 'Edit this video' });
        try { await dialog.waitFor({ timeout: 8000 }); }
        catch (error) { console.log('Hold failure', { errors, dialogs: await page.locator('dialog').evaluateAll(es => es.map(e => ({ open: e.open, title: e.querySelector('h2')?.textContent }))), card: await original.getAttribute('data-proof-editable') }); await page.screenshot({ path: `test-results/hold-failure-${engineName}-${width}.png`, fullPage: true }); throw error; }
        await originalImage.dispatchEvent('pointerup', { pointerId: 1 });
        await originalImage.dispatchEvent('click'); assert.equal(context.pages().length, 1);
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

        // A swipe cancels the hold gesture.
        await originalImage.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 300 });
        await originalImage.dispatchEvent('pointermove', { pointerId: 2, clientX: 100, clientY: 300 });
        await page.waitForTimeout(700); assert.equal(await page.locator('dialog[open]').count(), 0);
        await originalImage.dispatchEvent('pointerup', { pointerId: 2 });

        await add.click();
        const create = page.getByRole('dialog', { name: 'Add a video' });
        const picker = create.getByLabel('Choose video from your photo library');
        assert.equal(await picker.getAttribute('accept'), 'video/*'); assert.equal(await picker.getAttribute('capture'), null);
        await picker.setInputFiles(mediaPath);
        const title = `Training progress ${engineName} ${width}`;
        await create.getByLabel('Video title', { exact: true }).fill(title);
        await create.getByLabel('Description', { exact: true }).fill('A real saved description.\nSecond line stays readable.');
        await page.waitForFunction(() => { const video = document.querySelector('.proof-video-dialog video'); return video && (video.readyState >= 1 || video.error); }, null, { timeout: 8000 }).catch(() => {});
        console.log('Video preview', { engineName, width, policy: response.headers()['content-security-policy'], preview: await create.locator('video').evaluate(v => ({ ready: v.readyState, error: v.error?.message, code: v.error?.code, supported: v.canPlayType('video/mp4; codecs="avc1.42E01E"') })), message: await create.locator('[role="alert"]').allTextContents() });
        await create.getByRole('button', { name: 'Publish video', exact: true }).click();
        await create.waitFor({ state: 'hidden', timeout: 30000 });
        assert.equal(await page.locator('[data-proof-video]').count(), 4);
        await page.reload();
        const saved = page.locator('[data-proof-video]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
        await saved.getByText('A real saved description.', { exact: false }).waitFor();
        const video = saved.locator('video');
        assert.equal(await video.getAttribute('playsinline'), '');
        await saved.getByRole('button', { name: `Play ${title} video`, exact: true }).click();
        await page.waitForFunction(title => { const v = [...document.querySelectorAll('video')].find(v => v.getAttribute('aria-label') === title); return v && !v.paused && v.currentTime > 0.3 && v.readyState >= 2; }, title);
        console.log(`${engineName}-${width}: uploaded video is actually playing`);
        const uploadedBefore = await MediaUpload.countDocuments({ completed: true });
        await saved.getByRole('button', { name: `Edit video: ${title}`, exact: true }).click();
        const edit = page.getByRole('dialog', { name: 'Edit this video' });
        try { await edit.waitFor({ timeout: 8000 }); }
        catch (error) { console.log('Reopen failure', { engineName, width, errors, state: await page.evaluate(() => ({ clicks: window.proofClicks, dialogs: [...document.querySelectorAll('dialog')].map(d => ({ open: d.open, title: d.querySelector('h2')?.textContent, text: d.textContent?.slice(0, 300) })) })) }); await page.screenshot({ path: `test-results/reopen-failure-${engineName}-${width}.png`, fullPage: true }); throw error; }
        await edit.getByLabel('Description', { exact: true }).fill('Description changed without re-uploading.');
        await edit.getByRole('button', { name: 'Publish changes', exact: true }).click();
        await edit.waitFor({ state: 'hidden' });
        assert.equal(await MediaUpload.countDocuments({ completed: true }), uploadedBefore);
        await page.reload(); await saved.getByText('Description changed without re-uploading.', { exact: true }).waitFor();

        // The same card can receive a replacement file, with its description kept.
        await saved.getByRole('button', { name: `Edit video: ${title}`, exact: true }).click();
        await edit.getByLabel('Choose video from your photo library').setInputFiles(mediaPath);
        await edit.getByRole('button', { name: 'Publish changes', exact: true }).click();
        await edit.waitFor({ state: 'hidden', timeout: 30000 });
        assert.equal(await MediaUpload.countDocuments({ completed: true }), 1);
        await saved.getByRole('button', { name: `Play ${title} video`, exact: true }).click();
        await page.waitForFunction(title => { const v = [...document.querySelectorAll('video')].find(v => v.getAttribute('aria-label') === title); return v && v.currentTime > 0.3 && !v.paused; }, title);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${engineName}-${width}: horizontal page overflow`);
        await saved.screenshot({ path: `test-results/proof-video-${engineName}-${width}.png` });
        await saved.getByRole('button', { name: `Edit video: ${title}`, exact: true }).click();
        await edit.screenshot({ path: `test-results/proof-editor-${engineName}-${width}.png` });
        await edit.getByRole('button', { name: 'Cancel', exact: true }).click();

        // A URL-only card is saved without uploading a file. It navigates in the
        // same tab, and browser Back returns to the real, persisted Bravo page.
        await add.click();
        await create.getByRole('radio', { name: 'Facebook Reel URL', exact: true }).check();
        const linkedTitle = `Facebook progress ${engineName} ${width}`;
        await create.getByLabel('Video title', { exact: true }).fill(linkedTitle);
        await create.getByRole('textbox', { name: 'Facebook Reel URL', exact: true }).fill('https://unrelated.example/reel/123/');
        assert.equal(await create.getByRole('button', { name: 'Publish video', exact: true }).isDisabled(), true);
        const reelUrl = 'https://www.facebook.com/reel/1079472767813329/';
        await create.getByRole('textbox', { name: 'Facebook Reel URL', exact: true }).fill(`${reelUrl}?mibextid=fixture`);
        await create.getByLabel('Description', { exact: true }).fill('A Facebook Reel with its own description.');
        await create.getByRole('button', { name: 'Publish video', exact: true }).click();
        await create.waitFor({ state: 'hidden' });
        assert.equal(await MediaUpload.countDocuments({ completed: true }), 1);
        await page.reload();
        const linked = page.locator('[data-proof-video]').filter({ has: page.getByRole('heading', { name: linkedTitle, exact: true }) });
        const linkedWatch = linked.getByRole('link', { name: `Watch ${linkedTitle} on Facebook`, exact: true });
        await linkedWatch.waitFor();
        assert.equal(await linkedWatch.getAttribute('href'), reelUrl);
        assert.equal(await linkedWatch.getAttribute('target'), null);
        assert.equal(await linked.locator('img,video,iframe').count(), 0);
        await context.route('https://www.facebook.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Facebook destination fixture</title><p>Reel destination</p>' }));
        await linkedWatch.click();
        await page.waitForURL(reelUrl);
        await page.getByText('Reel destination', { exact: true }).waitFor();
        assert.equal(context.pages().length, 1);
        await page.goBack();
        await page.waitForURL(`${origin}/`);
        await linkedWatch.waitFor();
        await linked.scrollIntoViewIfNeeded(); await page.waitForTimeout(350);
        await linked.locator('.proof-reel-placeholder').dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 300 });
        await edit.waitFor();
        await linked.locator('.proof-reel-placeholder').dispatchEvent('pointerup', { pointerId: 3 });
        assert.equal(await edit.getByRole('textbox', { name: 'Facebook Reel URL', exact: true }).inputValue(), reelUrl);
        await edit.getByLabel('Description', { exact: true }).fill('The Reel description can be edited later.');
        await edit.screenshot({ path: `test-results/reel-url-editor-${engineName}-${width}.png` });
        await edit.getByRole('button', { name: 'Publish changes', exact: true }).click();
        await edit.waitFor({ state: 'hidden' });
        await page.reload();
        await linked.getByText('The Reel description can be edited later.', { exact: true }).waitFor();
        console.log(`${engineName}-${width}: Reel URL saved; same-tab navigation, Back and hold-to-edit passed`);
        assert.deepEqual(errors, []);
        await context.close();

        const publicContext = await browser.newContext({ viewport: { width, height: 900 } });
        const publicPage = await publicContext.newPage(); await publicPage.goto(origin);
        await publicPage.getByRole('heading', { name: title, exact: true }).waitFor();
        assert.equal(await publicPage.getByRole('button', { name: /Add video|Edit video:/ }).count(), 0);
        await publicPage.getByRole('button', { name: `Play ${title} video`, exact: true }).click();
        await publicPage.waitForFunction(() => [...document.querySelectorAll('video')].some(v => v.currentTime > 0.3 && !v.paused));
        await publicContext.close();
      }
    } finally { await browser.close(); }
  }
} finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await replica.stop(); }
