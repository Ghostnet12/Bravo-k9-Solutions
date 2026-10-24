import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import axe from 'axe-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';
import { DEFAULT_HERO_CAROUSEL } from '../shared/hero-carousel.js';
import { DEFAULT_WORKSHOP } from '../shared/workshops.js';
import { resolveWorkshop } from '../shared/workshop-schedule.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
const html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
assert.doesNotMatch(html, /<h3[^>]*>(?:David Northrop|Ashley Leverock)<\/h3>/, 'static HTML must not publish a fallback roster');
const reviews = [
  { _id: 'review-1', authorName: 'Bravo Client One', rating: 5, body: 'Our walks are calmer and our home finally has clear boundaries.' },
  { _id: 'review-2', authorName: 'Bravo Client Two', rating: 5, body: 'The private sessions helped us understand what our dog needed.' },
  { _id: 'review-3', authorName: 'Bravo Client Three', rating: 5, body: 'Practical training that carried into everyday life.' },
];
const team = [
  { id: 'david', name: 'David Northrop', role: 'owner', title: 'Owner & Lead Trainer', bio: 'Fixture profile.' },
  { id: 'ashley', name: 'Ashley Northrop', role: 'staff', title: 'Trainer & Pitbull Specialist', bio: 'Fixture profile.' },
];
let publicTeam = team;
let trainingCents = 20000;
const app = express();
const publicReads = { team: 'team', reviews: 'reviews', 'site-content': 'entries', 'site-images': 'images', live: 'sessions', 'site-ads': 'ads', 'site-banner': 'alerts', 'proof-videos': 'clips', 'team/schedules': 'schedules', 'site-music': 'tracks', 'hero-carousel': 'carousel', 'hero-videos': 'clips', workshops: 'event', 'fci-updates': 'items' };
app.get('/api/live', (_req, res) => res.set('Cache-Control', 'no-store').json({ sessions: [], announcements: [], availability: 'available', serverTime: new Date().toISOString() }));
app.get('/api/site-banner', (_req, res) => res.json({ alerts: [], settings: { motion: 'never' }, revision: 0 }));
app.get('/api/site-music', (_req, res) => res.json({ enabled: false, tracks: [], startId: null, revision: 0 }));
app.get('/api/hero-carousel', (_req, res) => res.json({ carousel: DEFAULT_HERO_CAROUSEL }));
app.get('/api/hero-videos', (_req, res) => res.json({ clips: [], nextCursor: null }));
app.get('/api/workshops', (_req, res) => res.json({ event: resolveWorkshop(DEFAULT_WORKSHOP), configuration: DEFAULT_WORKSHOP }));
app.get('/api/fci-updates', (_req, res) => res.json({ items: [], lastSuccessAt: new Date().toISOString(), stale: false }));
app.get('/api/proof-videos', (_req, res) => res.json({ clips: DEFAULT_PROOF_VIDEOS, nextCursor: null }));
app.get('/api/site-ads', (_req, res) => res.json({ revision: 0, settings: { autoplaySeconds: 7 }, ads: [{ id: 'fci-support-bravo', title: 'FCI Support', src: '/images/fci-official-identity.jpeg', creative: 'fci', link: '/fci-support', enabled: true }] }));
app.get('/api/config', (_req, res) => res.json({ connected: false, paymentsReady: false, services: SERVICES.map(service => service.id === 'training' ? { ...service, cents: trainingCents } : service), schedule: { enabled: false, weekdays: [1,2,3,4,5], hours: [] } }));
app.get('/api/auth/me', (_req, res) => res.json({ user: null, services: [], membership: { active: false } }));
app.get('/api/site-images', (_req, res) => res.json({ images: {} }));
app.get('/api/site-content', (_req, res) => res.json({ entries: {} }));
app.get('/api/team', (_req, res) => publicTeam === null ? res.status(503).json({ error: 'Fixture team unavailable' }) : res.json({ team: publicTeam }));
app.get('/api/team/schedules', (_req, res) => res.json({ schedules: [], checkedAt: new Date().toISOString() }));
app.get('/api/reviews', (_req, res) => res.json({ reviews, average: 5, count: reviews.length, recommendations: DEFAULT_REVIEWS }));
app.use(express.static(dist));
app.get('/{*path}', (req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Fixture endpoint missing.' }) : res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });

try {
 for (const [engineName, engine] of Object.entries(process.env.BROWSER_ENGINE ? { [process.env.BROWSER_ENGINE]: { chromium, webkit }[process.env.BROWSER_ENGINE] } : { chromium, webkit })) {
  const browser = await engine.launch();
  try { for (const width of [320,375,390,430,768,1024,1440]) {
   const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
   const errors = [], navigationDiagnostics = []; let navigating = false;
   page.on('pageerror', error => {
     // WebKit emits protocol pageerrors for handled fetch cancellations when
     // either a document or a React route unmounts. Keep the precise local
     // diagnostic separately; native errors/rejections are always failures.
     if (engineName === 'webkit' && navigating && Object.keys(publicReads).some(path => error.message.endsWith(`${new URL(origin).host}/api/${path} due to access control checks.`))) {
       navigationDiagnostics.push({ message: error.message, url: page.url() });
     } else errors.push(error.message);
   });
   await page.exposeFunction('recordConversionRuntimeError', message => errors.push(message));
   await page.addInitScript(() => {
     window.addEventListener('error', event => {
       if (event instanceof ErrorEvent) void window.recordConversionRuntimeError(event.error?.stack || event.message).catch(() => {});
     });
     window.addEventListener('unhandledrejection', event => {
       void window.recordConversionRuntimeError(event.reason?.stack || event.reason?.message || String(event.reason)).catch(() => {});
     });
   });
   // Finish the old page's deferred reads before replacing its document.
   // WebKit otherwise reports cancelled reads as access-control pageerrors.
   async function navigate(url) {
     await page.waitForLoadState('networkidle');
     navigating = true;
     try { await page.goto(url, { waitUntil: 'networkidle' }); }
     finally { navigating = false; }
   }
   async function follow(link) {
     navigating = true;
     try { await link.click(); await page.waitForLoadState('networkidle'); }
     finally { navigating = false; }
   }
   await navigate(origin);
   const readingOrder = await page.evaluate(() => ['training','reviews','training-programs','team','method','results','home-tools-title','workshops','first-visit-help','booking-title'].map(id=>({id,top:document.getElementById(id).getBoundingClientRect().top})));
   assert.deepEqual([...readingOrder].sort((a,b)=>a.top-b.top),readingOrder,'same visual and reading order on every screen');
   assert.equal(await page.locator('.conversion-offer').count(),1,'one primary membership offer');
   const portraitsFillCards=await page.locator('.cinema-team-grid>article').evaluateAll(cards=>cards.every(card=>Math.abs(card.querySelector('.cinema-portrait').getBoundingClientRect().width-card.clientWidth)<2));
   assert.ok(portraitsFillCards,'trainer portraits fill their cards without empty side columns');
   assert.ok(await page.locator('.conversion-price').isVisible());
   assert.equal(await page.locator('#results .home-results-actions .cinema-button').getAttribute('href'),'/portal?program=training');
   if (engineName === 'chromium' && [390,1440].includes(width)) {
     await page.addScriptTag({content:axe.source});
     const audit=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
     await writeFile(`test-results/accessibility-${width}.json`,JSON.stringify(audit,null,2));
     console.log('Accessibility',width,JSON.stringify(audit.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>node.target)}))));
     const changedAudit=await page.evaluate(async()=>await axe.run({include:['#training','#results','#reviews','#team','.hero-photo-window']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
     assert.deepEqual(changedAudit.violations.filter(item=>['critical','serious'].includes(item.impact)).map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)})),[],'changed sections have no serious or critical automated accessibility violations');
     await page.screenshot({path:`test-results/optimization-full-${width}.png`,fullPage:true});
     for (const id of ['training','results','reviews','team']) {
       await page.locator(`#${id}`).scrollIntoViewIfNeeded();
       // Collapsed stories and off-screen carousel slides intentionally keep
       // lazy images unloaded. Only await images painted in this screenshot.
       await page.waitForFunction(selector => [...document.querySelectorAll(selector)].filter(img => {
         const rect = img.getBoundingClientRect();
         return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
       }).every(img => img.complete && img.naturalWidth > 0), `#${id} img`, { timeout: 10000 });
       await page.screenshot({path:`test-results/optimization-${id}-${width}.png`});
     }
     await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   }
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${engineName}-${width} overflow`);
   {
    assert.ok(await page.locator('.brand-lockup').first().isVisible());
    const brandBox = await page.locator('.brand-lockup').first().boundingBox(); assert.ok(brandBox.x >= 0 && brandBox.x + brandBox.width <= width);
    const hero = page.locator('.polish-hero-actions').getByRole('link', { name: /Start my training plan/i });
    await hero.scrollIntoViewIfNeeded();
    const box = await hero.boundingBox(), nav = await page.locator('.mobile-home-nav').boundingBox();
    assert.ok(box.y >= 74 && box.y + box.height <= nav.y, 'hero action is reachable without overlap from sticky controls');
    const media = await page.locator('.cinema-hero-media').boundingBox();
    assert.ok(Math.abs(media.x + media.width / 2 - width / 2) < 2, 'same centered portrait composition on every screen');
    assert.equal(await page.locator('.home-ad-dock').count(),0); assert.ok(Math.abs(nav.y+nav.height-page.viewportSize().height)<2, 'navigation sits at the phone bottom without ad space');
    const access = await page.locator('.accessibility-tools').boundingBox(); assert.ok(access.y + access.height <= nav.y, 'accessibility stays above navigation');
    assert.equal(await hero.getAttribute('href'), '/portal?program=training');
    assert.equal(await page.locator('.conversion-goal').count(), 4);
    assert.equal(await page.locator('.goal-finder').count(), 0, 'one shared training selector');
    assert.equal(await page.locator('.home-training-offer').count(), 0, 'one visible standard offer');
    assert.equal(await page.locator('.conversion-goal').filter({hasText:'Aggression'}).getAttribute('href'), '/portal?program=aggression');
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({ path:`test-results/mobile-first-${engineName}-${width}.png` });
    await page.locator('.conversion-opening').scrollIntoViewIfNeeded();
    await page.screenshot({ path:`test-results/mobile-goals-${engineName}-${width}.png` });
    await page.locator('.conversion-offer').scrollIntoViewIfNeeded();
    assert.match(await page.locator('.conversion-price').innerText(), /\$200/);
    await page.screenshot({ path:`test-results/mobile-pricing-${engineName}-${width}.png` });
    await page.locator('.mobile-home-nav').getByRole('button', {name:'More'}).click();
    const primary = page.getByRole('navigation', {name:'Primary navigation'});
    await primary.getByRole('link', {name:/FCI Support/}).waitFor({state:'visible'});
    assert.ok(await primary.getByRole('link', {name:/Tools of the trade/i}).isVisible());
    const paths = await primary.locator('a').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
    assert.equal(paths.indexOf('/tools-of-the-trade'), paths.indexOf('/fci-support') + 1, 'Tools immediately follows FCI');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '/#training', 'bottom menu moves keyboard focus to the revealed links');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-navigation-toggle')), true, 'Escape returns focus to the opener');
    await follow(page.locator('.mobile-home-nav').getByRole('link', {name:/Book now/}));
    await page.getByRole('heading', {name:'Let’s start with your dog.'}).waitFor();
    assert.equal(await page.locator('.mobile-home-nav').count(), 1, 'navigation persists on booking');
    await follow(page.locator('.mobile-home-nav').getByRole('link', {name:'Reviews',exact:true}));
    await page.waitForFunction(() => { const r=document.querySelector('#reviews')?.getBoundingClientRect(); return r && r.top >= 74 && r.top < 150; }).catch(async error=>{console.error('Review geometry',width,await page.evaluate(()=>({top:document.querySelector('#reviews')?.getBoundingClientRect().top,padding:getComputedStyle(document.documentElement).scrollPaddingTop,margin:getComputedStyle(document.querySelector('#reviews')).scrollMarginTop})));throw error;});
    await follow(page.locator('.mobile-home-nav').getByRole('link', {name:/Book now/}));
    await page.getByRole('button', {name:'Plan my entire month',exact:true}).waitFor();
    if (width === 390) {
      trainingCents = 27500; await navigate(origin);
      assert.match(await page.locator('.conversion-price').innerText(), /\$275/); trainingCents = 20000;
    }
   }
   if ([390,768,1440].includes(width)) {
    for (const route of ['/contact','/fci-support','/account','/portal']) {
      await navigate(origin+route);
      await page.locator('.mobile-home-nav').waitFor();
      const more=page.locator('.mobile-home-nav button[aria-controls="bravo-navigation"]');
      await more.click();
      assert.equal(await more.getAttribute('aria-expanded'),'true','cold/lazy route header stays synchronized');
      await more.press('Escape');
      assert.equal(await more.getAttribute('aria-expanded'),'false');
      await more.click();await more.click();
      assert.equal(await page.locator('.app-header .menu-toggle').getAttribute('aria-expanded'),'false');
      await page.evaluate(()=>scrollTo(0,400));
      const chrome = await page.evaluate(()=>{const h=document.querySelector('.app-header'), n=document.querySelector('.mobile-home-nav');return {left:h.getBoundingClientRect().left,right:h.getBoundingClientRect().right,top:h.getBoundingClientRect().top,nav:n.getBoundingClientRect().bottom,screen:innerHeight};});
      assert.ok(Math.abs(chrome.left)<1 && Math.abs(chrome.right-width)<1 && Math.abs(chrome.top)<1, 'full-width header stays fixed across routes');
      assert.ok(Math.abs(chrome.nav-chrome.screen)<2, 'shared navigation stays at the viewport bottom');
    }
    await follow(page.locator('.mobile-home-nav').getByRole('link',{name:'Reviews',exact:true}));
    await page.waitForFunction(()=>{const r=document.querySelector('#reviews')?.getBoundingClientRect();return r && r.top>=74 && r.top<150;});
   }
   if (width === 390) {
    await page.evaluate(()=>scrollTo(0,0));
    await follow(page.locator('.mobile-home-nav').getByRole('link',{name:'Reviews',exact:true}));
    await page.waitForFunction(()=>{const r=document.querySelector('#reviews')?.getBoundingClientRect();return r && r.top>=74 && r.top<150;});
   }
   assert.equal(await page.locator('.cinema-hero video').count(),0,'hero remains image-only');
   await navigate(origin+'/how-to#first-visit-guide');
   const guide=page.locator('#first-visit-guide');
   for (let step=0;step<4;step++) {
     assert.equal(await guide.locator('.first-guide-count').innerText(),`Step ${step+1} of 4`);
     if(step<3) await guide.getByRole('button',{name:/Next step/}).click();
   }
   assert.equal(await guide.getByRole('link',{name:/Start my training plan/}).getAttribute('href'),'/portal?program=training');
   assert.equal(await page.locator('.how-to-chapters button').count(),22);
   assert.equal(await page.locator('.how-to-player track[kind=captions]').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/first-visit-${engineName}-${width}.png`});
   const contentReads = await page.evaluate(async specs => Promise.all(Object.entries(specs).map(async ([path, key]) => {
     const response = await fetch(`/api/${path}`, { cache: 'no-store' });
     const data = await response.json();
     return { path, status: response.status, valid: ['entries','images','carousel','event'].includes(key) ? !!data[key] && typeof data[key] === 'object' : Array.isArray(data[key]) };
   })), publicReads);
   assert.deepEqual(contentReads, Object.keys(publicReads).map(path => ({ path, status: 200, valid: true })), 'all public content reads succeed after navigation');
   await writeFile(`test-results/mobile-navigation-${engineName}-${width}.json`, JSON.stringify({ errors, navigationDiagnostics, contentReads }, null, 2));
   assert.deepEqual(errors, []); console.log(`PASS shared layout, navigation, draft entry and first-visit guide: ${engineName}/${width}`); await page.close();
  }} finally { await browser.close(); }
 }
} finally { await new Promise(resolve => server.close(resolve)); }
