// Presentation/interaction fixtures only. Real WebRTC is tested separately in live-direct.browser.mjs.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const requestedEngines = (process.env.BRAVO_BROWSER_ENGINES || 'chromium,webkit').split(',');
assert.ok(requestedEngines.length && requestedEngines.every(name => ['chromium', 'webkit'].includes(name)), 'supported browser engines required');
const engines = Object.entries({ chromium, webkit }).filter(([name]) => requestedEngines.includes(name));
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url));
const html=await readFile(`${dist}/bravo-shell.html`,'utf8'),liveHtml=await readFile(`${dist}/live.html`,'utf8');
let handleApi;
const app=express();app.use('/api',(req,res)=>handleApi(req,res));
// Match deployed response caching: private HTML is never stored; hashed build
// assets are immutable. Express's default revalidation is not Vercel's delivery.
app.get('/live',(_req,res)=>res.set('Cache-Control','private, no-store').type('html').send(liveHtml));
app.use('/assets',express.static(`${dist}/assets`,{maxAge:'1y',immutable:true}));
app.use(express.static(dist,{redirect:false}));
app.get('/{*path}',(_req,res)=>res.set('Cache-Control','private, no-store').type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
const startedAt=new Date(Date.now()-14*60000).toISOString();
const makeSession=(id,trainerName,audience='public')=>({id,trainerId:id,trainerName,dogName:`Test dog ${id}`,trainingFocus:'Test field obedience',audience,status:'live',startedAt});
try {for(const [name,engine] of engines) {
 const browser=await engine.launch(name==='chromium'?{channel:'chrome'}:{});
 let evidencePage;const pendingRequests=new Set(),failedRequests=[],errors=[];
 try {
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
  // Keep media lifecycle evidence as screenshots and request diagnostics.
  evidencePage=page;page.on('request',r=>pendingRequests.add(r.url()));page.on('requestfinished',r=>pendingRequests.delete(r.url()));page.on('requestfailed',r=>{pendingRequests.delete(r.url());failedRequests.push({url:r.url(),error:r.failure()?.errorText});});page.on('pageerror',error=>errors.push(error.message));
  let sessions=[],failure=false,ads=[{id:'fixture-video',title:'Recorded Bravo training — test ad placement',alt:'Existing Bravo footage used as a test advertisement',enabled:true,link:'/dog-training',src:'/images/training-education.webp',videoSrc:'/assets/bravo-opening-565c14182176.mp4'}];
  handleApi=(req,res)=>{
   const path=new URL(req.originalUrl,origin).pathname;
   res.set('Cache-Control','no-store');
   let json={services:[],team:[],images:{},reviews:[],schedules:[],clips:[],count:0};
   if(path==='/api/auth/me')json={user:null,services:[]};
   if(path==='/api/site-ads')json={revision:0,settings:{autoplaySeconds:20},ads};
   if(path==='/api/site-content')json={entries:{}};
   if(path==='/api/site-banner')json={revision:0,settings:{motion:'never'},alerts:['Bravo is live now under live cams in menu on upper right-hand corner.','Test announcement — browser verification only.']};
   if(path==='/api/site-banner/weather')json={weather:null};
   if(path==='/api/live') {
    if(failure)return res.status(503).json({error:'Test status outage'});
    const fresh=sessions.map(s=>({...s,liveUntil:new Date(Date.now()+8000).toISOString()}));
    json={sessions:fresh.filter(s=>s.audience==='public'),announcements:fresh.map(({id,trainerId,trainerName,audience,status,liveUntil})=>({trainerId,trainerName,audience,status,liveUntil,href:`/live?${audience==='public'?'session':'trainer'}=${id}`})),availability:'available',serverTime:new Date().toISOString()};
   }
   if(path==='/api/proof-videos')json={clips:[{id:'recorded-test',title:'Recorded training test fixture',src:'/assets/bravo-opening-565c14182176.mp4',description:'Existing Bravo training footage'}]};
   res.json(json);
  };
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('bravo-live-changed')));
  await page.goto(origin);await page.locator('.home-ad-dock').waitFor();
  await page.waitForResponse(r=>r.url().endsWith('/api/live'));
  assert.equal(await page.locator('.hero-live').count(),0);assert.equal(await page.locator('.ad-live-creative').count(),0);
  assert.ok(!(await page.locator('.home-status-banner').innerText()).includes('Bravo is live now'));
  const ad=page.locator('.home-ad-dock video');
  await page.waitForFunction(()=>document.querySelector('.home-ad-dock video')?.currentTime>0.3);
  await page.evaluate(()=>{window.__ad=document.querySelector('.home-ad-dock video');window.__adTime=window.__ad.currentTime;window.scrollTo({top:document.body.scrollHeight,behavior:"instant"});window.dispatchEvent(new Event('bravo-ads-changed'));});
  await page.waitForFunction(()=>!window.__ad.paused && (window.__ad.currentTime>window.__adTime+0.3 || window.__adTime>window.__ad.duration-0.5 && window.__ad.currentTime<window.__adTime));
  assert.equal(await ad.evaluate(el=>el===window.__ad && el.muted && getComputedStyle(el).objectFit==='contain'),true);
  assert.equal(await page.locator('.home-ad-dock .ad-dock-controls').count(),0);
  // Follow the artwork, then site navigation, without replacing the ad player.
  await page.locator('.home-ad-slide.is-active a').click();await page.waitForURL('**/dog-training');
  for (const path of ['/workshops','/live','/contact','/']) {
   if(path==='/') await page.locator('footer a[href="/"]').first().click();
   else { await page.getByRole('button',{name:'Menu',exact:true}).click();await page.locator(`header nav a[href="${path}"]`).first().click(); }
   await page.waitForURL(`${origin}${path}`);
   if(path==='/contact') {
    sessions=[makeSession('sitewide','Sitewide trainer TEST')];await refresh();
    await page.waitForFunction(()=>!!document.querySelector('.ad-live-creative'));
    await page.waitForTimeout(9000);
    assert.equal(await page.locator('.ad-live-creative').count(),1,'live promotions stay fresh beyond the lease on other pages');
    sessions=[];await refresh();await page.waitForFunction(()=>!document.querySelector('.ad-live-creative'));
   }
   await page.waitForFunction(()=>document.querySelector('.home-ad-dock video')===window.__ad && !window.__ad.paused);
   assert.equal(await page.locator('.home-ad-dock').count(),1,'one dock survives route changes');
   const before=await ad.evaluate(el=>el.currentTime);
   // Looping across the clip's end also proves playback has advanced.
   await page.waitForFunction(time=>{const video=document.querySelector('.home-ad-dock video');return !video.paused && (video.currentTime>time+0.2 || time>video.duration-0.5 && video.currentTime<time);},before,{timeout:10000});
   await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
   assert.ok(await page.evaluate(()=>document.querySelector('footer').getBoundingClientRect().bottom<=document.querySelector('.home-ad-dock').getBoundingClientRect().top+2),'route footer clears dock');
  }
  const layout=await page.evaluate(()=>{const dock=document.querySelector('.home-ad-dock').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect(),floating=document.querySelector('.accessibility-tools')?.getBoundingClientRect();return {bottom:dock.bottom,height:dock.height,footer:footer.bottom,top:dock.top,floating:floating?.bottom,reserved:parseFloat(getComputedStyle(document.querySelector('#root')).paddingBottom),screen:innerHeight};});
  assert.ok(Math.abs(layout.bottom-layout.screen)<2);assert.ok(layout.reserved>=layout.height);assert.ok(layout.footer<=layout.top+2);if(layout.floating)assert.ok(layout.floating<layout.top);
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('#root')).paddingBottom)===Math.ceil(document.querySelector('.home-ad-dock').getBoundingClientRect().height));
  const landscape=await page.evaluate(()=>{const dock=document.querySelector('.home-ad-dock').getBoundingClientRect();return {height:dock.height,top:dock.top,footer:document.querySelector('footer').getBoundingClientRect().bottom,floating:document.querySelector('.accessibility-tools').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.ok(landscape.height<=75 && landscape.footer<=landscape.top+2 && landscape.floating<landscape.top && !landscape.overflow,'landscape dock leaves reading space and reachable footer/controls');
  assert.equal(await ad.evaluate(el=>el===window.__ad),true,'orientation preserves the video element');
  await page.setViewportSize({width:390,height:900});
  await page.getByRole('button',{name:'Accessibility',exact:true}).click();
  await page.getByRole('button',{name:'Pause advertisements',exact:true}).click();assert.equal(await ad.evaluate(el=>el.paused),true);
  await page.getByRole('button',{name:'Resume advertisements',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.home-ad-dock video').paused);
  await page.getByRole('button',{name:'Expand advertisement'}).click();await page.locator('.ad-expanded[open]').waitFor();
  assert.equal(await page.locator('.home-ad-dock').isVisible(),false);await page.getByRole('button',{name:'Close advertisement ×'}).click();await page.locator('.home-ad-dock').waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:'Close accessibility options'}).isVisible(),false,'outside dialog interaction closes the options panel');
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
  await page.goto(`${origin}/live`);await page.bringToFront();await page.getByText('Live status is temporarily unavailable. Reconnecting…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'OUT IN THE FIELD.'}).count(),0);
  failure=false;sessions=[makeSession('one','David · TEST'),makeSession('two','Ashley · TEST')];await refresh();await page.locator('.live-session-row').first().waitFor();
  await page.locator('.live-session-row').nth(1).click();await page.waitForFunction(()=>document.querySelector('.live-player-caption h2')?.textContent.includes('Ashley'));assert.match(await page.locator('.live-player-caption h2').innerText(),/Ashley/i);
  // A playing video can keep a media request open; UI and worker readiness,
  // not network idleness, determine when this live document can be refreshed.
  await page.waitForFunction(async()=>(await navigator.serviceWorker.getRegistration('/live/'))?.active?.state==='activated');
  const previousDocument=await page.evaluate(()=>performance.timeOrigin);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.notEqual(await page.evaluate(()=>performance.timeOrigin),previousDocument,'refresh creates a new document');
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation')[0].type),'reload');
  assert.equal(new URL(page.url()).searchParams.get('session'),'two');
  await page.waitForFunction(()=>document.querySelector('.live-player-caption h2')?.textContent.includes('Ashley'));assert.match(await page.locator('.live-player-caption h2').innerText(),/Ashley/i);assert.match(await page.locator('.live-video-top .live-timer').innerText(),/^00:1[4-9]:/);
  await page.locator('.home-ad-dock').waitFor();
  assert.match(await page.locator('.live-player-caption').innerText(),/Central Time/);
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
   const hero=page.locator('.live-hero');await hero.waitFor();
   const framing=await hero.evaluate(el=>{const style=getComputedStyle(el);return {background:style.backgroundImage,size:style.backgroundSize,position:style.backgroundPosition,heading:getComputedStyle(el.querySelector('h1')).fontSize};});
   assert.match(framing.background,/linear-gradient.*hero-bravo-launch\.webp/);
   assert.match(framing.size,/cover/);
   assert.equal(framing.position,width<=760?'58% 50%':'50% 48%');
   if(width<=760)assert.equal(framing.heading,'65px');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/bravo-live-framing-TEST-${name}-${width}.png`});
  }
  sessions=[];await refresh();await page.getByRole('heading',{name:'OUT IN THE FIELD.'}).waitFor();await page.getByRole('region',{name:'Recorded Bravo training'}).waitFor();
  await page.setViewportSize({width:390,height:900});
  await page.goto(`${origin}/portal?program=walking`);await page.locator('.mobile-booking-bar').waitFor();await page.locator('.home-ad-dock').waitFor();
  assert.ok(await page.evaluate(()=>{const bar=document.querySelector('.mobile-booking-bar').getBoundingClientRect(),dock=document.querySelector('.home-ad-dock').getBoundingClientRect(),access=document.querySelector('.accessibility-tools').getBoundingClientRect();return bar.bottom<=dock.top+1 && access.bottom<bar.top;}),'booking action and accessibility control clear the dock');
  await page.locator('.mobile-booking-bar a').click();
  assert.equal(new URL(page.url()).hash,'#choose-dates','mobile booking action remains usable');
  await page.goto(origin);await page.locator('.home-ad-dock').waitFor();await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Accessibility',exact:true}).click();await page.getByRole('button',{name:'Resume advertisements',exact:true}).waitFor();
  assert.equal(await page.locator('.home-ad-dock video').evaluate(el=>el.paused),true);
  const resume=page.getByRole('button',{name:'Resume advertisements',exact:true});await page.keyboard.press('Tab');await resume.focus();assert.ok(await resume.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
  ads=ads.map(ad=>({...ad,enabled:false}));await page.evaluate(()=>window.dispatchEvent(new Event('bravo-ads-changed')));await page.waitForFunction(()=>!document.querySelector('.home-ad-dock'));
  assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('#root')).paddingBottom)),0);
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: offline/one/two/rename/stop/private/unavailable, persistent elapsed, 320–1440px framing, dock media continuity/footer/floating controls/dialogs, pause, keyboard focus, reduced motion, hidden collection`);
  await context.close();
 }catch(error){
  console.log('Request diagnostics',{pending:[...pendingRequests],failed:failedRequests,errors});
  if(evidencePage){await evidencePage.screenshot({path:`test-results/FAILED-live-experience-${name}.png`}).catch(()=>{});console.log('Failure diagnostics',await evidencePage.evaluate(()=>({ready:document.readyState,body:document.body.innerText.slice(0,2500),visibility:document.visibilityState,url:location.href,videos:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,paused:v.paused,muted:v.muted,ready:v.readyState,error:v.error?.message,time:v.currentTime})),dock:document.querySelector('.home-ad-dock')?.outerHTML,dialogs:document.querySelectorAll('dialog[open]').length})).catch(()=>({})));}
  throw error;
 }finally{await browser.close();}
}}finally{server.close();}
