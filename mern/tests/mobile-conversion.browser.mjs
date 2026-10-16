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
app.get('/api/proof-videos', (_req, res) => res.json({ clips: DEFAULT_PROOF_VIDEOS, nextCursor: null }));
app.get('/api/site-ads', (_req, res) => res.json({ revision: 0, settings: { autoplaySeconds: 7 }, ads: [{ id: 'fci-support-bravo', title: 'FCI Support', src: '/images/fci-official-identity.jpeg', creative: 'fci', link: '/fci-support', enabled: true }] }));
app.get('/api/config', (_req, res) => res.json({ connected: false, paymentsReady: false, services: SERVICES.map(service => service.id === 'training' ? { ...service, cents: trainingCents } : service), schedule: { enabled: false, weekdays: [1,2,3,4,5], hours: [] } }));
app.get('/api/auth/me', (_req, res) => res.json({ user: null, services: [], membership: { active: false } }));
app.get('/api/site-images', (_req, res) => res.json({ images: {} }));
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
  try { for (const width of [320,375,390,430,768,1440]) {
   const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
   const errors = []; page.on('pageerror', error => errors.push(error.message));
   await page.goto(origin, { waitUntil: 'networkidle' });
   const readingOrder = await page.evaluate(() => ['training','method','results','reviews','team','training-programs','workshops'].map(id=>({id,top:document.getElementById(id).getBoundingClientRect().top})));
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
       await page.locator(`#${id} img`).evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
       await page.screenshot({path:`test-results/optimization-${id}-${width}.png`});
     }
     await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   }
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${engineName}-${width} overflow`);
   if (width <= 700) {
    assert.ok(await page.locator('.brand-lockup').first().isVisible());
    const brandBox = await page.locator('.brand-lockup').first().boundingBox(); assert.ok(brandBox.x >= 0 && brandBox.x + brandBox.width <= width);
    const hero = page.locator('.polish-hero-actions').getByRole('link', { name: /Book your first session/i });
    const box = await hero.boundingBox(), nav = await page.locator('.mobile-home-nav').boundingBox();
    assert.ok(box.y > 0 && box.y + box.height < nav.y, 'hero action immediately visible above sticky controls');
    assert.equal(await page.locator('.home-ad-dock').count(),0); assert.ok(Math.abs(nav.y+nav.height-page.viewportSize().height)<2, 'navigation sits at the phone bottom without ad space');
    const access = await page.locator('.accessibility-tools').boundingBox(); assert.ok(access.y + access.height <= nav.y, 'accessibility stays above navigation');
    assert.equal(await hero.getAttribute('href'), '/portal?program=training');
    assert.equal(await page.locator('.conversion-goal').count(), 4);
    assert.equal(await page.locator('.goal-finder').isVisible(), false, 'no duplicate mobile training selector');
    assert.equal(await page.locator('.home-training-offer').count(), 0, 'one visible standard offer');
    assert.equal(await page.locator('.conversion-goal').filter({hasText:'Aggression'}).getAttribute('href'), '/portal?program=aggression');
    await page.screenshot({ path:`test-results/mobile-first-${engineName}-${width}.png` });
    await page.locator('.conversion-opening').scrollIntoViewIfNeeded();
    await page.screenshot({ path:`test-results/mobile-goals-${engineName}-${width}.png` });
    await page.locator('.conversion-offer').scrollIntoViewIfNeeded();
    assert.match(await page.locator('.conversion-price').innerText(), /\$200/);
    await page.screenshot({ path:`test-results/mobile-pricing-${engineName}-${width}.png` });
    await page.locator('.mobile-home-nav').getByRole('button', {name:'More'}).click();
    await page.getByRole('navigation', {name:'Primary navigation'}).getByRole('link', {name:/FCI Support/}).waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '/#training', 'bottom menu moves keyboard focus to the revealed links');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-navigation-toggle')), true, 'Escape returns focus to the opener');
    await page.locator('.mobile-home-nav').getByRole('link', {name:/Book now/}).click();
    await page.getByRole('heading', {name:'Let’s start with your dog.'}).waitFor();
    assert.equal(await page.locator('.mobile-home-nav').count(), 1, 'navigation persists on booking');
    await page.locator('.mobile-home-nav').getByRole('link', {name:'Reviews',exact:true}).click();
    await page.waitForFunction(() => { const r=document.querySelector('#reviews')?.getBoundingClientRect(); return r && r.top >= 74 && r.top < 150; }).catch(async error=>{console.error('Review geometry',width,await page.evaluate(()=>({top:document.querySelector('#reviews')?.getBoundingClientRect().top,padding:getComputedStyle(document.documentElement).scrollPaddingTop,margin:getComputedStyle(document.querySelector('#reviews')).scrollMarginTop})));throw error;});
    await page.locator('.mobile-home-nav').getByRole('link', {name:/Book now/}).click();
    await page.getByRole('button', {name:'Plan my entire month',exact:true}).waitFor();
    if (width === 390) {
      trainingCents = 27500; await page.goto(origin, {waitUntil:'networkidle'});
      assert.match(await page.locator('.conversion-price').innerText(), /\$275/); trainingCents = 20000;
    }
   }
   if (width === 390) {
    for (const route of ['/contact','/fci-support','/account','/portal']) {
      await page.goto(origin+route, {waitUntil:'networkidle'});
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
    await page.locator('.mobile-home-nav').getByRole('link',{name:'Reviews',exact:true}).click();
    await page.waitForFunction(()=>{const r=document.querySelector('#reviews')?.getBoundingClientRect();return r && r.top>=74 && r.top<150;});
   }
   if (width === 390) {
    await page.evaluate(()=>scrollTo(0,0));
    await page.locator('.mobile-home-nav').getByRole('link',{name:'Reviews',exact:true}).click();
    await page.waitForFunction(()=>{const r=document.querySelector('#reviews')?.getBoundingClientRect();return r && r.top>=74 && r.top<150;});
   }
   assert.equal(await page.locator('.cinema-hero video').count(),0,'hero remains image-only');
   assert.deepEqual(errors, []); await page.close();
  }} finally { await browser.close(); }
 }
} finally { await new Promise(resolve => server.close(resolve)); }
