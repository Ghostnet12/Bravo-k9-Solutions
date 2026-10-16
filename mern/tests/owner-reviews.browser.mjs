import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'owner_review_browser';
process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
delete process.env.STRIPE_SECRET_KEY;
let server;
await mkdir('test-results', { recursive: true });
try {
  const { default: app } = await import('../server/site-image-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, LessonLibrary } = await import('../server/models.js');
  const { WebsiteReview } = await import('../server/review-store.js');
  await connectDb(); await WebsiteReview.init(); await LessonLibrary.create({ _id: 'library', open: false });
  const tokens = {};
  for (const [name, role] of Object.entries({ owner: 'owner', administrator: 'owner', staff: 'staff', member: 'member' })) {
    const user = await User.create({ ...(name === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), name: `${name} Fixture`, role, passwordHash: 'fixture-only', email: `${name}@example.test` });
    const token = randomBytes(32).toString('hex'); tokens[name] = token;
    await Session.create({ userId: user._id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) });
  }
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.APP_ORIGIN = origin;
  const publicHtml = async () => (await fetch(origin)).text();
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try { for (const width of [390, 1440]) {
      await WebsiteReview.deleteMany({});
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'bravo_session', value: tokens.owner, domain: '127.0.0.1', path: '/' }]);
      const page = await context.newPage();
      const errors = [], navigationDiagnostics = [];
      let navigating = false;
      page.on('pageerror', error => {
        // WebKit emits a JS-source access-control diagnostic for a same-origin
        // poll canceled by document replacement (Playwright issue #43120).
        // Scope this to explicit hard navigation and this exact local endpoint;
        // real DOM errors/rejections and all other page errors still fail.
        if (name === 'webkit' && navigating && error.message.endsWith(`${new URL(origin).host}/api/live due to access control checks.`)) {
          navigationDiagnostics.push({ message: error.message, url: page.url() });
        } else errors.push(error.message);
      });
      await page.exposeFunction('recordReviewRuntimeError', message => errors.push(message));
      await page.addInitScript(() => {
        window.addEventListener('error', event => { if (event instanceof ErrorEvent) void window.recordReviewRuntimeError(event.error?.stack || event.message).catch(() => {}); });
        window.addEventListener('unhandledrejection', event => { void window.recordReviewRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {}); });
      });
      const navigate = async url => {
        navigating = true;
        try { if (url) await page.goto(url); else await page.reload(); }
        finally { navigating = false; }
        // A real CORS/CSP failure or broken poll on the new document must fail.
        const live = await page.evaluate(async () => {
          const response = await fetch('/api/live', { credentials: 'same-origin', cache: 'no-store' });
          const data = await response.json();
          return { status: response.status, sessions: Array.isArray(data.sessions), announcements: Array.isArray(data.announcements) };
        });
        assert.deepEqual(live, { status: 200, sessions: true, announcements: true });
      };
      try {
        await navigate(`${origin}/account`); await page.getByRole('link', { name: 'Manage reviews', exact: true }).click();
        await page.getByRole('heading', { name: 'Manage reviews.', exact: true }).waitFor();
        const sherrie = page.getByRole('article', { name: 'Review by Sherrie Humphries', exact: true });
        await sherrie.waitFor(); assert.equal(await sherrie.getByText('No star rating', { exact: true }).count(), 1);
        await sherrie.getByRole('button', { name: 'Edit review', exact: true }).click();
        const edit = page.getByRole('form', { name: 'Edit review', exact: true });
        assert.ok((await edit.getByLabel('Review text', { exact: true }).inputValue()).startsWith('Daisy just loves Ashley and David.'));
        const revised = 'Daisy is listening well and walking calmly with us. Updated fixture feedback.';
        await edit.getByLabel('Review text', { exact: true }).fill(revised); await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
        await edit.waitFor({ state: 'hidden' }); assert.ok((await publicHtml()).includes(revised));
        await page.getByRole('button', { name: 'Add review', exact: true }).click();
        const add = page.getByRole('form', { name: 'Add review', exact: true });
        await add.getByLabel('Reviewer name', { exact: true }).fill('Browser Test Client');
        await add.getByLabel('Review text', { exact: true }).fill('Our daily walks are much calmer after the training sessions.');
        await add.getByLabel('Review source', { exact: true }).selectOption('Facebook comment');
        await add.getByRole('button', { name: 'Publish review', exact: true }).click(); await add.waitFor({ state: 'hidden' });
        await navigate(); const added = page.getByRole('article', { name: 'Review by Browser Test Client', exact: true }); await added.waitFor();
        assert.ok((await publicHtml()).includes('Browser Test Client'));
        page.once('dialog', dialog => dialog.accept());
        await added.getByRole('button', { name: 'Remove review', exact: true }).click(); await added.waitFor({ state: 'hidden' });
        assert.ok(!(await publicHtml()).includes('Browser Test Client'));
        await page.getByLabel('Removed reviews', { exact: true }).check(); await added.waitFor();
        await added.getByRole('button', { name: 'Restore review', exact: true }).click(); await added.waitFor({ state: 'hidden' });
        assert.ok((await publicHtml()).includes('Browser Test Client')); await page.getByLabel('Removed reviews', { exact: true }).uncheck();
        const first = page.getByRole('article', { name: 'Review by Tamyra Borg', exact: true });
        page.once('dialog', dialog => dialog.accept()); await first.getByRole('button', { name: 'Remove review', exact: true }).click(); await first.waitFor({ state: 'hidden' });
        const html = await publicHtml(); assert.ok(!html.includes('Tamyra Borg'), 'removed imported reviews disappear from public HTML and the bootstrap snapshot');
        await navigate(origin); await page.locator('.facebook-recommendations article').filter({ hasText: 'Sherrie Humphries' }).waitFor({ state: 'attached' });
        assert.equal(await page.getByText('Tamyra Borg', { exact: true }).count(), 0);
        assert.equal(await page.locator('.goal-early-review').isVisible(), false, 'no duplicate review teaser');
        const retainedReview = page.locator('.facebook-recommendations article').filter({ hasText: 'Waneta Malsom' });
        await retainedReview.waitFor({ state: 'attached' });
        assert.equal(await retainedReview.count(), 1, 'the next published review remains in the client-review section');
        assert.equal(await page.locator('.facebook-recommendations article').filter({ hasText: 'Sherrie Humphries' }).locator('.review-stars').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        for (const who of ['administrator', 'staff', 'member']) {
          await context.clearCookies(); await context.addCookies([{ name: 'bravo_session', value: tokens[who], domain: '127.0.0.1', path: '/' }]);
          await navigate(`${origin}/account`); await page.getByRole('heading', { name: /^Welcome,/ }).waitFor();
          assert.equal(await page.getByRole('link', { name: 'Manage reviews', exact: true }).count(), 0);
          await navigate(`${origin}/admin?tab=reviews`); await page.waitForLoadState('networkidle');
          assert.equal(await page.getByRole('button', { name: 'Add review', exact: true }).count(), 0);
          assert.equal(await page.getByRole('button', { name: 'Reviews', exact: true }).count(), 0);
        }
        assert.deepEqual(errors, []);
        console.log(`PASS ${name}/${width}: owner profile review add/edit/remove/restore, reload, live homepage and delegated-access denial`);
      } catch (error) { await page.screenshot({ path: `test-results/owner-reviews-failure-${name}-${width}.png`, fullPage: true }); throw error; }
      finally {
        await writeFile(`test-results/owner-reviews-diagnostics-${name}-${width}.json`, JSON.stringify({ errors, navigationDiagnostics }, null, 2));
        await context.close();
      }
    } } finally { await browser.close(); }
  }
} finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await replica.stop(); }
