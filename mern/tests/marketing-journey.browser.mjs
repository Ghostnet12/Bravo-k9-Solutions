// Isolated public journeys: no real accounts, bookings, messages or payments.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { SPECIALIST_LINKS, specialistInquiryPath } from '../shared/contact-interest.js';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { DEFAULT_WORKSHOP } from '../shared/workshops.js';
import { resolveWorkshop } from '../shared/workshop-schedule.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express();
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName)) continue;
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 768, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage(), errors = [], writes = [];
        let teamUnavailable = true;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname;
          if (request.method() !== 'GET') writes.push(path);
          let json = { images: {}, entries: {}, team: [], schedules: [], reviews: [], recommendations: [], count: 0, clips: [], items: [], alerts: [], revision: 0 };
          if (path === '/api/config') json = { connected: true, paymentsReady: false, services: SERVICES.map(service => ({ ...service, enabled: service.id !== 'online' })), lessonLibrary: { open: false }, schedule: { enabled: true, weekdays: [1,2,3,4,5], hours: ['09:00'] } };
          if (path === '/api/auth/me') json = { user: null, services: [], membership: { active: false } };
          if (path === '/api/reviews') json = { recommendations: DEFAULT_REVIEWS, reviews: [], count: 0 };
          if (path === '/api/workshops') json = { event: resolveWorkshop({ ...DEFAULT_WORKSHOP, scheduleMode: 'weekly' }) };
          if (path === '/api/team') {
            if (teamUnavailable) return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
            json = { team: [{ id: '111111111111111111111111', name: 'Fixture Trainer', role: 'staff', title: 'Private dog trainer', bio: 'Fixture profile' }] };
          }
          await route.fulfill({ json });
        });
        const visit = async path => {
          await page.waitForLoadState('networkidle');
          await page.goto(origin + path);
          await page.waitForLoadState('networkidle');
        };
        const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${engineName}/${width}: no horizontal overflow`);
        try {
          await visit('/');
          assert.match(await page.locator('#home-title').innerText(), /Dog training.\s*For real life./);
          await page.locator('.home-hero').screenshot({path:`test-results/clarity-hero-${engineName}-${width}.png`});
          await visit('/reviews');
          assert.equal(await page.locator('.client-story-card').count(), 3, 'published client outcomes become three sourced case summaries');
          assert.equal(await page.locator('.facebook-recommendations article').count(), DEFAULT_REVIEWS.length, 'every review appears once');
          assert.equal(await page.locator('.facebook-recommendations > .client-review-list article').count(), 1, 'one complete result is visible without swiping');
          assert.ok(await page.locator('.client-review-list').first().evaluate(element => element.scrollWidth <= element.clientWidth), 'featured story needs no horizontal scroll');
          const story = page.locator('.client-story-card').first();
          await story.getByText('Read full review', { exact: true }).click();
          assert.match(await story.locator('.review-full blockquote').innerText(), /Benny and Huck/);
          await story.getByText('Show less', { exact: true }).click();
          await page.locator('.facebook-recommendations-more > summary').click();
          assert.equal(await page.locator('.facebook-recommendations article:visible').count(), DEFAULT_REVIEWS.length, 'every published review is reachable');
          assert.ok(await page.locator('.client-review-list').last().evaluate(element => element.scrollWidth <= element.clientWidth), 'additional reviews need no horizontal scroll');
          await page.locator('.facebook-recommendations-more > summary').click();
          await visit('/training');
          const secondaryHeight = await page.locator('.home-secondary').evaluateAll(sections => sections.reduce((sum, section) => sum + section.getBoundingClientRect().height, 0));
          assert.ok(secondaryHeight < 1250, `${width}: secondary topics remain compact (${secondaryHeight}px)`);
          assert.equal(await page.locator('#online .cinema-learning-visual').count(), 0, 'coming-soon lessons do not add a full photo section');
          assert.equal(await page.locator('.conversion-price').count(), 1);
          assert.match(await page.locator('.training-request-reassurance').innerText(), /does not charge your card/);
          assert.equal(await page.locator('.training-help-links a[href="/how-to#first-visit-guide"]').count(), 1);
          assert.equal(await page.locator('.training-help-links a[href="/tools-of-the-trade"]').count(), 1);
          const offerOrder = await page.locator('.conversion-offer-copy').evaluate(element => {
            const top = selector => element.querySelector(selector).getBoundingClientRect().top;
            return top('.conversion-button') < top('.training-request-reassurance') && top('.training-request-reassurance') < top('.training-help-links');
          });
          assert.ok(offerOrder, 'main action, reassurance and help follow the same visual and keyboard order');
          await visit('/our-approach');
          assert.match(await page.locator('#method').innerText(), /No treats\. No toys\./);
          await page.locator('#method').screenshot({path:`test-results/clarity-method-${engineName}-${width}.png`});
          await visit('/team');
          await page.getByRole('button', { name: 'Retry trainer profiles', exact: true }).waitFor();
          teamUnavailable = false;
          await page.getByRole('button', { name: 'Retry trainer profiles', exact: true }).click();
          await page.locator('#team').getByRole('heading', { name: 'Fixture Trainer', exact: true }).waitFor();
          assert.equal(await page.locator('.home-team-recovery').count(), 0);
          await fits();
          await visit('/training');
          await page.locator('#training').scrollIntoViewIfNeeded();
          await page.screenshot({path:`test-results/marketing-offer-${engineName}-${width}.png`});
          const puppy = page.locator('.conversion-goal').filter({ hasText: 'Puppy obedience' });
          assert.equal(await puppy.getAttribute('href'), '/portal?program=training&focus=puppy-foundations');
          await puppy.click();
          await page.getByLabel('What would you like help with?', { exact: true }).waitFor();
          assert.equal(await page.getByLabel('What would you like help with?', { exact: true }).inputValue(), 'puppy-foundations');
          await visit('/training');
          await page.locator('.conversion-goal').filter({ hasText: 'Advanced training' }).click();
          await page.getByRole('heading', { name: 'You’re asking about advanced obedience.', exact: true }).waitFor();
          await fits();
          for (const item of SPECIALIST_LINKS.filter(item => item.interest !== 'hunting-dog')) {
            await visit('/training');
            const link = page.locator('#specialist-training').getByRole('link', { name: item.name, exact: true });
            assert.equal(await link.getAttribute('href'), specialistInquiryPath(item.interest));
            await link.click();
            await page.locator('.contact-interest').waitFor();
            assert.doesNotMatch(await page.locator('.contact-interest').innerText(), /\$200/);
            assert.match(await page.locator('.contact-interest').innerText(), /No booking or payment has been submitted/);
          }
          await page.getByRole('link', { name: 'Clear selected interest', exact: true }).click();
          await page.locator('.contact-interest').waitFor({ state: 'detached' });
          assert.equal(await page.locator('.contact-interest').count(), 0);
          await visit('/dog-training');
          assert.equal(await page.locator('.service-journey').count(), 1);
          assert.equal(await page.locator('.training-approach').count(), 1);
          assert.equal(await page.locator('.training-next-step a[href="/portal?program=training"]').count(), 1);
          await fits();
          assert.deepEqual(writes, [], 'exploration never sends a booking or inquiry');
          assert.deepEqual(errors, []);
          console.log(`PASS ${engineName}/${width}: readable offer, trainer recovery, puppy focus, advanced/specialist context, service next step`);
        } catch (error) {
          await page.screenshot({ path: `test-results/marketing-failure-${engineName}-${width}.png`, fullPage: true });
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
