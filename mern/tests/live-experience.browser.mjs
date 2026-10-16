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
 const browser=await engine.launch(name==='chromium'?(process.env.BRAVO_CHROMIUM_PATH?{executablePath:process.env.BRAVO_CHROMIUM_PATH}:{channel:'chrome'}):{});
 let evidencePage;const pendingRequests=new Set(),failedRequests=[],errors=[];
 try {
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
  // Keep media lifecycle evidence as screenshots and request diagnostics.
  evidencePage=page;page.on('request',r=>pendingRequests.add(r.url()));page.on('requestfinished',r=>pendingRequests.delete(r.url()));page.on('requestfailed',r=>{pendingRequests.delete(r.url());failedRequests.push({url:r.url(),error:r.failure()?.errorText});});page.on('pageerror',error=>{
   // WebKit may surface the deliberately injected 503 as a page error.
   // Only this endpoint during the explicit outage scenario is expected;
   // successful-response, navigation, and unrelated errors still fail.
   if(name==='webkit' && failure && error.message.endsWith('/api/live due to access control checks.')) {
    console.log('Expected WebKit error during injected live-status outage',error.message);
    return;
   }
   console.log('Unexpected page error',{message:error.message,outage:failure,url:page.url()});
   errors.push(error.message);
  });
  let sessions=[],failure=false,ads=[{id:'fixture-video',title:'Recorded Bravo training — test ad placement',alt:'Existing Bravo footage used as a test advertisement',enabled:true,link:'/dog-training',src:'/images/training-education.webp',videoSrc:'/assets/bravo-opening-565c14182176.mp4'}];
  let statusRequests = 0;
  handleApi=async (req,res)=>{
   const path=new URL(req.originalUrl,origin).pathname;
   res.set('Cache-Control','no-store');
   let json={services:[],team:[],images:{},reviews:[],schedules:[],clips:[],count:0};
   if(path==='/api/auth/me')json={user:null,services:[]};
   if(path==='/api/site-ads')json={revision:0,settings:{autoplaySeconds:20},ads};
   if(path==='/api/site-content')json={entries:{}};
   if(path==='/api/site-banner')json={revision:0,settings:{motion:'never'},alerts:['Bravo is live now under live cams in menu on upper right-hand corner.','Test announcement — browser verification only.']};
   if(path==='/api/site-banner/weather')json={weather:null};
   if(path==='/api/live') {
    statusRequests++;
    if (statusRequests === 1) await new Promise(resolve => setTimeout(resolve, 6000));
    if(failure)return res.status(503).json({error:'Test status outage'});
    const fresh=sessions.map(s=>({...s,liveUntil:new Date(Date.now()+8000).toISOString()}));
    json={sessions:fresh.filter(s=>s.audience==='public'),announcements:fresh.map(({id,trainerId,trainerName,audience,status,liveUntil})=>({trainerId,trainerName,audience,status,liveUntil,href:`/live?${audience==='public'?'session':'trainer'}=${id}`})),availability:'available',serverTime:new Date().toISOString()};
   }
   if(path==='/api/proof-videos')json={clips:[{id:'recorded-test',title:'Recorded training test fixture',src:'/assets/bravo-opening-565c14182176.mp4',description:'Existing Bravo training footage'}]};
   res.json(json);
  };
  // Complete fixture API requests before replacing the document. WebKit can
  // report a navigation-cancelled fetch as an access-control page error.
  const waitForApiIdle = async () => {
   const deadline=Date.now()+5000;
   let quietSince=0;
   while(Date.now()<deadline) {
    const pending=[...pendingRequests].some(url=>new URL(url).pathname.startsWith('/api/'));
    if(pending) quietSince=0;
    else if(!quietSince) quietSince=Date.now();
    else if(Date.now()-quietSince>=100) return;
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   assert.fail('Fixture API requests did not settle before navigation');
  };
  // Public HTML can render its footer before React starts queued content reads.
  // Wait for hydration's content response before declaring a document settled.
  const visit = async (url, options = {}) => {
   const content = page.waitForResponse(response => new URL(response.url()).pathname === '/api/site-content');
   await page.goto(url, { waitUntil: 'domcontentloaded', ...options });
   await content; await waitForApiIdle();
  };
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('bravo-live-changed')));
  const firstStatus = page.waitForResponse(response => new URL(response.url()).pathname === '/api/live');
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await firstStatus;
  assert.equal(statusRequests, 1, 'six-second cold status read completes without cancellation or duplicate polling');
  assert.equal(failedRequests.filter(item => new URL(item.url).pathname === '/api/live').length, 0, 'cold status request is not aborted');
  assert.equal(await page.locator('.home-ad-dock').count(),0);
  assert.equal(await page.locator('.hero-live').count(),0);
  assert.ok(!(await page.locator('.home-status-banner').innerText()).includes('Bravo is live now'));
  for(const path of ['/workshops','/live','/contact','/']){
   await waitForApiIdle();
   await visit(origin+path,{waitUntil:'domcontentloaded'});
   await page.locator('footer').waitFor();
   assert.equal(await page.locator('.home-ad-dock').count(),0,'no ads or ad videos across routes');
   await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
   assert.ok(await page.evaluate(()=>document.querySelector('footer').getBoundingClientRect().bottom<=document.querySelector('.mobile-home-nav').getBoundingClientRect().top+2),'footer clears bottom navigation');
  }
  await page.evaluate(()=>scrollTo(0,0));
  sessions=[makeSession('one','David · TEST')];await refresh();await page.locator('.hero-live').waitFor();
  assert.equal(await page.locator('.hero-live li').count(),1);assert.equal(await page.locator('.hero-live li a').getAttribute('href'),'/live?session=one');
  sessions.push(makeSession('two','Ashley · TEST'));await refresh();await page.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===2);
  assert.equal(await page.locator('.ad-live-creative').count(),0,'live links remain in hero without reintroducing ads');
  // Explicitly label screenshots: isolated fixtures, not production on-air claims.
  await page.evaluate(()=>{const label=document.createElement('div');label.id='evidence-label';label.textContent='TEST DATA · isolated browser verification';label.style.cssText='position:fixed;top:0;left:0;z-index:9999;padding:4px 10px;background:#101010;color:#fff;font:11px sans-serif;border:1px solid #ba9a64';document.body.append(label);});
  for(const width of [320,390,768,1440]) {
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
   await page.waitForTimeout(300);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${width} horizontal overflow`);
   const geometry=await page.locator('.hero-live').evaluate(el=>{const badge=el.getBoundingClientRect(),nav=document.querySelector('header').getBoundingClientRect(),bottomNav=document.querySelector('.mobile-home-nav');return {top:badge.top,bottom:badge.bottom,nav:nav.bottom,dock:bottomNav?.getBoundingClientRect().height ? bottomNav.getBoundingClientRect().top : innerHeight};});
   assert.ok(geometry.top>=geometry.nav-1,`${name} ${width} hero badge clear of navigation`);assert.ok(geometry.bottom<geometry.dock,`${name} ${width} badge clear of dock`);
   await page.screenshot({path:`test-results/bravo-hero-dock-TEST-${name}-${width}.png`});
  }
  sessions[1].trainerName='Alexandra Long Public Display Name · TEST';await refresh();await page.getByRole('link',{name:sessions[1].trainerName,exact:true}).waitFor();
  sessions=sessions.filter(s=>s.id!=='one');await refresh();await page.waitForFunction(()=>document.querySelectorAll('.hero-live li').length===1);
  sessions[0].audience='client';await refresh();await page.locator('.hero-live').getByText('Client session').waitFor();
  assert.equal(await page.locator('.hero-live li a').getAttribute('href'),'/live?trainer=two');
  sessions=[];await refresh();await page.waitForFunction(()=>!document.querySelector('.hero-live'));assert.equal(await page.locator('.ad-live-creative').count(),0);
  failure=true;await refresh();await page.locator('.hero-live-unavailable').waitFor();assert.equal(await page.locator('.hero-live').count(),0);
  await waitForApiIdle();
  // WebKit can keep the document load event pending while media initializes.
  // Assert the rendered connection state, as for the live-document reload below.
  await visit(`${origin}/live`,{waitUntil:'domcontentloaded'});await page.bringToFront();await page.getByText('Live status is temporarily unavailable. Reconnecting…',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'OUT IN THE FIELD.'}).count(),0);
  failure=false;sessions=[makeSession('one','David · TEST'),makeSession('two','Ashley · TEST')];await refresh();await page.locator('.live-session-row').first().waitFor();
  await page.locator('.live-session-row').nth(1).click();await page.waitForFunction(()=>document.querySelector('.live-player-caption h2')?.textContent.includes('Ashley'));assert.match(await page.locator('.live-player-caption h2').innerText(),/Ashley/i);
  // A playing video can keep a media request open; UI and worker readiness,
  // not network idleness, determine when this live document can be refreshed.
  await page.waitForFunction(async()=>(await navigator.serviceWorker.getRegistration('/live/'))?.active?.state==='activated');
  const previousDocument=await page.evaluate(()=>performance.timeOrigin);
  await waitForApiIdle();
  await page.reload({waitUntil:'domcontentloaded'});
  assert.notEqual(await page.evaluate(()=>performance.timeOrigin),previousDocument,'refresh creates a new document');
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation')[0].type),'reload');
  assert.equal(new URL(page.url()).searchParams.get('session'),'two');
  await page.waitForFunction(()=>document.querySelector('.live-player-caption h2')?.textContent.includes('Ashley'));assert.match(await page.locator('.live-player-caption h2').innerText(),/Ashley/i);assert.match(await page.locator('.live-video-top .live-timer').innerText(),/^00:1[4-9]:/);
  assert.equal(await page.locator('.home-ad-dock').count(),0);
  assert.match(await page.locator('.live-player-caption').innerText(),/Central Time/);
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
   const hero=page.locator('.live-hero');await hero.waitFor();
   const framing=await hero.evaluate(el=>{const style=getComputedStyle(el);return {background:style.backgroundImage,size:style.backgroundSize,position:style.backgroundPosition,heading:getComputedStyle(el.querySelector('h1')).fontSize};});
   assert.match(framing.background,/linear-gradient.*hero-bravo-launch\.webp/);
   assert.match(framing.size,/cover/);
   assert.ok(framing.position.endsWith(width<=760?'58% 50%':'50% 48%'));
   if(width<=760)assert.equal(framing.heading,'65px');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/bravo-live-framing-TEST-${name}-${width}.png`});
  }
  sessions=[];await refresh();await page.getByRole('heading',{name:'OUT IN THE FIELD.'}).waitFor();await page.getByRole('region',{name:'Recorded Bravo training'}).waitFor();
  await page.setViewportSize({width:390,height:900});
  await waitForApiIdle();
  await visit(`${origin}/portal?program=walking`);await page.locator('.mobile-booking-bar').waitFor();
  assert.ok(await page.evaluate(()=>{const access=document.querySelector('.accessibility-tools').getBoundingClientRect(),nav=document.querySelector('.mobile-home-nav').getBoundingClientRect();return nav.bottom<=innerHeight+1 && access.bottom<nav.top && getComputedStyle(document.querySelector('.mobile-booking-bar')).position==='static';}),'booking action and accessibility clear persistent navigation');
  await page.locator('.mobile-booking-bar a').click();
  assert.equal(new URL(page.url()).hash,'#choose-dates','mobile booking action remains usable');
  await waitForApiIdle();
  await visit(origin,{waitUntil:'networkidle'});await page.emulateMedia({reducedMotion:'reduce'});
  const access=page.getByRole('button',{name:'Accessibility',exact:true});await access.focus();
  assert.ok(await access.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
  assert.equal(await page.locator('.home-ad-dock').count(),0);
  assert.ok(await page.evaluate(()=>{const nav=document.querySelector('.mobile-home-nav').getBoundingClientRect();return parseFloat(getComputedStyle(document.querySelector('#root')).paddingBottom)>=nav.height && parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ad-dock-height'))===0;}),'no ad spacing remains and mobile navigation clearance is preserved');
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: offline/one/two/rename/stop/private/unavailable, persistent elapsed, 320–1440px framing, ad-free routes/footer/floating controls, keyboard focus and reduced motion`);
  await context.close();
 }catch(error){
  console.log('Request diagnostics',{pending:[...pendingRequests],failed:failedRequests,errors});
  if(evidencePage){await evidencePage.screenshot({path:`test-results/FAILED-live-experience-${name}.png`}).catch(()=>{});console.log('Failure diagnostics',await evidencePage.evaluate(()=>({ready:document.readyState,body:document.body.innerText.slice(0,2500),visibility:document.visibilityState,url:location.href,videos:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,paused:v.paused,muted:v.muted,ready:v.readyState,error:v.error?.message,time:v.currentTime})),dock:document.querySelector('.home-ad-dock')?.outerHTML,dialogs:document.querySelectorAll('dialog[open]').length})).catch(()=>({})));}
  throw error;
 }finally{await browser.close();}
}}finally{server.close();}
