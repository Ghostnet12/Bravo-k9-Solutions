// Isolated release checks: production build, synthetic APIs, no real customer data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import app from '../server/app.js';
import { DateTime } from 'luxon';
import { SERVICES, quote } from '../shared/catalog.js';
import { resolveWorkshop } from '../shared/workshop-schedule.js';
import { DEFAULT_WORKSHOP } from '../shared/workshops.js';
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`, tid='aaaaaaaaaaaaaaaaaaaaaaaa', uid='bbbbbbbbbbbbbbbbbbbbbbbb';
const future=DateTime.now().setZone('America/Chicago').plus({days:3}).toISODate();
const term={stripeId:'fixture-term',serviceIds:['training'],status:'active',validFrom:DateTime.now().minus({days:5}).toISO(),validUntil:DateTime.now().plus({days:25}).toISO(),autoPayDisabled:true};
const booking={_id:'fixture-booking',serviceIds:['training'],visits:[{date:future,time:'10:00',service:'training'}],dogName:'Fixture Dog',dogCount:1,staffId:tid,status:'requested',paymentStatus:'covered',quote:quote(['training'],[],{dogCount:1}),createdAt:new Date().toISOString()};
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const passed=[];
try {
for(const role of ['guest','member','staff','owner']) {
 let liveState='live', workshop={...DEFAULT_WORKSHOP,scheduleMode:'specific',date:future,startTime:'12:00',endTime:'14:00'}, failSchedule=false;
 const errors=[],writes=[];
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const ep=url.pathname.slice(4);if(req.method()!=='GET')writes.push(ep);
  let data={items:[],entries:{},images:{},clips:[],alerts:[],settings:{motion:'never'},ads:[],reviews:[],recommendations:[],average:0,count:0};
  if(ep==='/config')data={connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:true,lessonCents:7500},timezone:'America/Chicago'};
  if(ep==='/auth/me')data={user:role==='guest'?null:{id:uid,name:'Fixture Client',role,dogName:'Fixture Dog'},services:['training'],membership:{active:true,onlineAccess:true}};
  if(ep==='/bookings')data={bookings:[booking]};
  if(ep==='/membership-terms')data={terms:[term]};
  if(ep==='/team')data={team:[{id:tid,name:'David Northrop',role:'owner',title:'Lead Trainer',profileKey:'david'}]};
  if(ep==='/team/schedules')data={schedules:[]};
  if(ep==='/client-schedule') {
   if(failSchedule)return route.fulfill({status:503,json:{error:'Fixture connection interrupted'}});
   data={client:{id:uid,name:'Fixture Client'},month:url.searchParams.get('month'),terms:[term],visits:[{...booking.visits[0],bookingId:booking._id,dogName:'Fixture Dog',status:'requested',trainer:'David Northrop',paymentStatus:'covered'}],trainingBookings:[booking],dayCredits:[]};
  }
  if(ep==='/workshops')data={event:resolveWorkshop(workshop),configuration:workshop};
  if(ep==='/live') {
   if(liveState==='unavailable')return route.fulfill({status:503,json:{error:'Fixture network interrupted'}});
   data={sessions:liveState==='ended'?[]:[{id:'fixture-session',trainerId:tid,trainerName:'David Northrop',dogName:'Public Fixture Dog',status:liveState,audience:'public',startedAt:new Date(Date.now()-90000).toISOString(),liveUntil:new Date(Date.now()+60000).toISOString()}],announcements:[],availability:'available',serverTime:new Date().toISOString()};
  }
  if(ep==='/live/fixture-session/watch')return route.fulfill({status:503,json:{error:'Fixture stream interrupted'}});
  return route.fulfill({json:data});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(origin);await page.locator('.header-quick-action').waitFor();
  if(role!=='guest')await page.waitForFunction(()=>document.querySelector('.app-header')?.dataset.signedIn==='true');
  for(const width of [320,390,768]) {
   await page.setViewportSize({width,height:900});
   assert.ok(await page.locator('.header-quick-action').isVisible());
   assert.ok(await page.locator('.header-quick-action').evaluate(el=>el.getBoundingClientRect().height>=44));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role}/${width}: home fits`);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('.menu-toggle').click();
  const nav=page.locator('#bravo-navigation');
  assert.ok(await nav.getByRole('link',{name:'Workshops',exact:true}).isVisible());assert.ok(await nav.getByRole('link',{name:'Live Cams',exact:true}).isVisible());
  if(role==='member')assert.equal(await nav.locator('a[href="/learn"]').count(),1);
  if(['staff','owner'].includes(role))assert.ok(await nav.getByRole('link',{name:'People & access',exact:true}).isVisible());
  await nav.locator('.nav-about summary').click();assert.ok(await nav.getByRole('link',{name:'Contact & help',exact:true}).isVisible());
  await page.keyboard.press('Escape');assert.equal(await nav.locator('.nav-about').getAttribute('open'),null);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${role}: enlarged home fits`);await page.evaluate(()=>document.documentElement.style.fontSize='');
  if(role==='member') {
   await page.goto(origin+'/account');const summary=page.locator('.member-overview');await summary.getByText('David Northrop',{exact:true}).waitFor();
   assert.ok((await summary.innerText()).includes('Requested — awaiting Bravo’s confirmation'));
   assert.ok((await summary.innerText()).includes('Fixture Dog'));assert.ok((await summary.innerText()).includes('Training membership:'));
   assert.equal(await summary.getByRole('link',{name:'Message Bravo',exact:true}).getAttribute('href'),'/community?tab=direct');
   assert.ok(await summary.getByRole('link',{name:'My Lessons',exact:true}).isVisible());
   for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`member ${width}: account fits`);}
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'enlarged account fits');
   failSchedule=true;await page.reload();await page.getByRole('button',{name:'Retry details',exact:true}).waitFor();failSchedule=false;await page.getByRole('button',{name:'Retry details',exact:true}).click();await summary.getByText('David Northrop',{exact:true}).waitFor();
   passed.push('Member next visit, assigned trainer, requested status, term dates, lesson/message/schedule actions and responsive account');
  }
  if(role==='guest') {
   await page.goto(origin+'/workshops');await page.getByText('Contact Bravo to request a seat',{exact:true}).waitFor();
   workshop={...workshop,scheduleMode:'none',date:null};await page.evaluate(()=>window.dispatchEvent(new Event('bravo-workshop-changed')));
   await page.getByText('Date to be announced — contact Bravo',{exact:true}).waitFor();assert.equal(await page.locator('.workshop-details dt').filter({hasText:/^Date$|^Time$/}).count(),0);
   await page.goto(origin+'/live?session=fixture-session');await page.getByRole('button',{name:'Watch live',exact:false}).waitFor();
   await page.getByRole('button',{name:'Watch live',exact:false}).click();await page.getByRole('button',{name:'Retry connection',exact:false}).waitFor({timeout:30000});
   liveState='reconnecting';await page.evaluate(()=>window.dispatchEvent(new Event('bravo-live-changed')));await page.locator('.live-player-caption').getByText('Reconnecting',{exact:true}).waitFor();
   assert.equal(await page.locator('.live-player .live-badge').count(),0);
   liveState='unavailable';await page.evaluate(()=>window.dispatchEvent(new Event('bravo-live-changed')));await page.locator('.live-player-caption').getByText('Status unavailable',{exact:true}).waitFor();
   liveState='ended';await page.evaluate(()=>window.dispatchEvent(new Event('bravo-live-changed')));await page.getByText('This session has ended or requires client access.',{exact:true}).waitFor();
   assert.equal(await page.locator('.live-player').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   passed.push('Workshop inquiry/no-date states; live connection failure retry, reconnect, status outage and ended-session message');
  }
  assert.deepEqual(errors,[],`${role}: no runtime errors`);
  assert.ok(writes.every(ep=>/telemetry|analytics|^\/live\/fixture-session\//.test(ep)),`${role}: unexpected writes ${JSON.stringify(writes)}`);
  passed.push(`${role}: mobile navigation, 44px primary task, grouped links, keyboard close and enlarged text`);
 } catch(error) {console.log('FAIL',role,error.message,(await page.locator('main').innerText()).slice(-2200));throw error;}
 finally{await context.close();}
}
console.log(JSON.stringify({passed,realCustomerWrites:0,realPayments:0},null,2));
}finally{await browser.close();server.close();}
