// Presentation/interaction fixtures only. Real WebRTC is tested separately in live-direct.browser.mjs.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url));
const html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
const startedAt=new Date(Date.now()-14*60000).toISOString();
const makeSession=(id,trainerName,audience='public')=>({id,trainerId:id,trainerName,dogName:`Test dog ${id}`,trainingFocus:'Test field obedience',audience,status:'live',startedAt});
try {for(const [name,engine] of Object.entries({chromium,webkit})) {
 const browser=await engine.launch(name==='chromium'?{channel:'chrome'}:{});
 let evidencePage;
 try {
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
  evidencePage=page;const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let sessions=[],failure=false,ads=[{id:'fixture-video',title:'Recorded Bravo training — test ad placement',alt:'Existing Bravo footage used as a test advertisement',enabled:true,link:'/dog-training',src:'/images/training-education.webp',videoSrc:'/assets/bravo-opening-565c14182176.mp4'}];
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   let json={services:[],team:[],images:{},reviews:[],schedules:[],clips:[],count:0};
   if(path==='/api/auth/me')json={user:null,services:[]};
   if(path==='/api/site-ads')json={revision:0,settings:{autoplaySeconds:20},ads};
   if(path==='/api/site-content')json={entries:{}};
   if(path==='/api/site-banner')json={revision:0,settings:{motion:'never'},alerts:['Bravo is live now under live cams in menu on upper right-hand corner.','Test announcement — browser verification only.']};
   if(path==='/api/site-banner/weather')json={weather:null};
   if(path==='/api/live') {
    if(failure)return route.fulfill({status:503,json:{error:'Test status outage'}});
    const fresh=sessions.map(s=>({...s,liveUntil:new Date(Date.now()+8000).toISOString()}));
    json={sessions:fresh.filter(s=>s.audience==='public'),announcements:fresh.map(({id,trainerId,trainerName,audience,status,liveUntil})=>({trainerId,trainerName,audience,status,liveUntil,href:`/live?${audience==='public'?'session':'trainer'}=${id}`})),availability:'available',serverTime:new Date().toISOString()};
   }
   if(path==='/api/proof-videos')json={clips:[{id:'recorded-test',title:'Recorded training test fixture',src:'/assets/bravo-opening-565c14182176.mp4',description:'Existing Bravo training footage'}]};
   await route.fulfill({json});
  });
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('bravo-live-changed')));
  await page.goto(origin);await page.locator('.home-ad-dock').waitFor();
  await page.waitForResponse(r=>r.url().endsWith('/api/live'));
  assert.equal(await page.locator('.hero-live').count(),0);assert.equal(await page.locator('.ad-live-creative').count(),0);
  assert.ok(!(await page.locator('.home-status-banner').innerText()).includes('Bravo is live now'));
  const ad=page.locator('.home-ad-dock video');
  await page.waitForFunction(()=>document.querySelector('.home-ad-dock video')?.currentTime>0.3);
  await page.evaluate(()=>{window.__ad=document.querySelector('.home-ad-dock video');window.__adTime=window.__ad.currentTime;window.scrollTo({top:document.body.scrollHeight,behavior:"instant"});});
  await page.waitForFunction(()=>window.__ad.currentTime>window.__adTime+0.3);
  assert.equal(await ad.evaluate(el=>el===window.__ad && el.muted && getComputedStyle(el).objectFit==='contain'),true);
  const layout=await page.evaluate(()=>{const dock=document.querySelector('.home-ad-dock').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect(),floating=document.querySelector('.accessibility-tools')?.getBoundingClientRect();return {bottom:dock.bottom,height:dock.height,footer:footer.bottom,top:dock.top,floating:floating?.bottom,reserved:parseFloat(getComputedStyle(document.querySelector('.bravo-home')).paddingBottom),screen:innerHeight};});
  assert.ok(Math.abs(layout.bottom-layout.screen)<2);assert.ok(layout.reserved>=layout.height);assert.ok(layout.footer<=layout.top+2);if(layout.floating)assert.ok(layout.floating<layout.top);
  await page.getByRole('button',{name:'Pause advertisements',exact:true}).click();assert.equal(await ad.evaluate(el=>el.paused),true);
  await page.getByRole('button',{name:'Resume advertisements',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.home-ad-dock video').paused);
  await page.getByRole('button',{name:'Expand advertisement'}).click();await page.locator('.ad-expanded[open]').waitFor();
  assert.equal(await page.locator('.home-ad-dock').isVisible(),false);await page.getByRole('button',{name:'Close advertisement ×'}).click();await page.locator('.home-ad-dock').waitFor({state:'visible'});
  await page.evaluate(()=>document.activeElement?.blur());
  sessions=[makeSession('one','David · TEST')];await refresh();await page.locator('.hero-live').waitFor();
  assert.equal(await page.locator('.hero-live li').count(),1);assert.equal(await page.locator('.hero-live li a').getAttribute('href'),'/live?session=one');
  sessions.push(makeSession('two','Ashley · TEST'));await refresh();await page.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===2);
  assert.equal(await page.locator('.ad-live-creative').count(),2);
  // Explicitly label screenshots: isolated fixtures, not production on-air claims.
  await page.evaluate(()=>{const label=document.createElement('div');label.id='evidence-label';label.textContent='TEST DATA · isolated browser verification';label.style.cssText='position:fixed;top:0;left:0;z-index:9999;padding:4px 10px;background:#101010;color:#fff;font:11px sans-serif;border:1px solid #ba9a64';document.body.append(label);});
  for(const width of [320,390,768,1440]) {
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
   await page.waitForTimeout(300);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${width} horizontal overflow`);
   const geometry=await page.locator('.hero-live').evaluate(el=>{const badge=el.getBoundingClientRect(),nav=document.querySelector('header').getBoundingClientRect(),dock=document.querySelector('.home-ad-dock').getBoundingClientRect();return {top:badge.top,bottom:badge.bottom,nav:nav.bottom,dock:dock.top};});
   assert.ok(geometry.top>=geometry.nav-1,`${name} ${width} hero badge clear of navigation`);assert.ok(geometry.bottom<geometry.dock,`${name} ${width} badge clear of dock`);
   await page.screenshot({path:`test-results/bravo-hero-dock-TEST-${name}-${width}.png`});
  }
  sessions[1].trainerName='Alexandra Long Public Display Name · TEST';await refresh();await page.getByRole('link',{name:sessions[1].trainerName,exact:true}).waitFor();
  sessions=sessions.filter(s=>s.id!=='one');await refresh();await page.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===1);
  sessions[0].audience='client';await refresh();await page.locator('.hero-live').getByText('Client session').waitFor();
  assert.equal(await page.locator('.hero-live li a').getAttribute('href'),'/live?trainer=two');
  sessions=[];await refresh();await page.waitForFunction(()=>!document.querySelector('.hero-live'));assert.equal(await page.locator('.ad-live-creative').count(),0);
  failure=true;await refresh();await page.locator('.hero-live-unavailable').waitFor();assert.equal(await page.locator('.hero-live').count(),0);
  await page.goto(`${origin}/live`);await page.getByText('Live status is temporarily unavailable. Reconnecting…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'OUT IN THE FIELD.'}).count(),0);
  failure=false;sessions=[makeSession('one','David · TEST'),makeSession('two','Ashley · TEST')];await refresh();await page.locator('.live-session-row').first().waitFor();
  await page.locator('.live-session-row').nth(1).click();assert.match(await page.locator('.live-player-caption h2').innerText(),/Ashley/i);
  await page.reload();await page.locator('.live-player-caption').waitFor();assert.match(await page.locator('.live-player-caption h2').innerText(),/Ashley/i);assert.match(await page.locator('.live-video-top .live-timer').innerText(),/^00:1[4-9]:/);
  assert.match(await page.locator('.live-player-caption').innerText(),/Central Time/);
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
   const photo=page.locator('.live-hero-photo');await photo.waitFor();assert.equal(await photo.evaluate(el=>getComputedStyle(el).objectFit),'contain');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/bravo-live-framing-TEST-${name}-${width}.png`});
  }
  sessions=[];await refresh();await page.getByRole('heading',{name:'OUT IN THE FIELD.'}).waitFor();await page.getByRole('region',{name:'Recorded Bravo training'}).waitFor();
  await page.goto(origin);await page.locator('.home-ad-dock').waitFor();await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Resume advertisements',exact:true}).waitFor();
  assert.equal(await page.locator('.home-ad-dock video').evaluate(el=>el.paused),true);
  const resume=page.getByRole('button',{name:'Resume advertisements',exact:true});await page.keyboard.press('Tab');await resume.focus();assert.ok(await resume.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
  ads=ads.map(ad=>({...ad,enabled:false}));await page.evaluate(()=>window.dispatchEvent(new Event('bravo-ads-changed')));await page.waitForFunction(()=>!document.querySelector('.home-ad-dock'));
  assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.bravo-home')).paddingBottom)),0);
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: offline/one/two/rename/stop/private/unavailable, persistent elapsed, 320–1440px framing, dock media continuity/footer/floating controls/dialogs, pause, keyboard focus, reduced motion, hidden collection`);
  await context.close();
 }catch(error){
  if(evidencePage){await evidencePage.screenshot({path:`test-results/FAILED-live-experience-${name}.png`}).catch(()=>{});console.log('Failure diagnostics',await evidencePage.evaluate(()=>({videos:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,paused:v.paused,muted:v.muted,ready:v.readyState,error:v.error?.message,time:v.currentTime})),dock:document.querySelector('.home-ad-dock')?.outerHTML,dialogs:document.querySelectorAll('dialog[open]').length})).catch(()=>({})));}
  throw error;
 }finally{await browser.close();}
}}finally{server.close();}
