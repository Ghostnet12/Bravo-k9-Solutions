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
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [390, 1440]) {
        await ProofVideo.deleteMany({}); await MediaUpload.deleteMany({}); await MediaChunk.deleteMany({});
        const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
        await context.addCookies([{ name: 'bravo_session', value: tokens.owner, url: origin }]);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin); const add = page.getByRole('button', { name: /Add video/ }); await add.waitFor();
        await page.waitForFunction(() => document.querySelectorAll('[data-proof-video]').length === 3);

        // Press and hold on the existing Facebook thumbnail must open the editor,
        // suppress the following tap, and leave the Facebook destination unopened.
        const original = page.locator('[data-proof-video="1850999522754029"]');
        await original.scrollIntoViewIfNeeded();
        const originalImage = original.locator('img');
        await originalImage.dispatchEvent('pointerdown', { button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 300 });
        const dialog = page.getByRole('dialog', { name: 'Edit this video' }); await dialog.waitFor({ timeout: 4000 });
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
