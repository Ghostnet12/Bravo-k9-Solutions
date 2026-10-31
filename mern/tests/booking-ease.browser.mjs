// Isolated fixtures: no production identities, bookings, messages or payments.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { routineDates, routineWeekday } from '../shared/booking-routine.js';

const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const axe = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const trainer = '111111111111111111111111', specialist = '222222222222222222222222', bookingId = '333333333333333333333333';
const team = [{ id:trainer,name:'Fixture Lead',role:'owner',title:'Lead trainer' },{ id:specialist,name:'Fixture Specialist',role:'staff',title:'Pitbull Specialist' }];
const member = { id:'444444444444444444444444',name:'Routine Client',role:'member',phone:'6055550100',address:'Saved fixture address',dogName:'Routine Dog' };
let state;
const app = express(); app.use(express.json());
app.use('/api', (req,res) => {
  const path = req.path;
  if (req.method !== 'GET') state.writes.push({ path, body:req.body });
  let data = { images:{},entries:{},reviews:[],recommendations:[],count:0,clips:[],items:[],alerts:[],revision:0,bookings:[] };
  if (path === '/config') data = { connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:false},schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00','11:00','17:00']} };
  if (path === '/auth/me') {
    if (state.failRefresh) { state.failRefresh=false; return res.status(503).json({error:'Fixture account check interrupted'}); }
    data = { user:state.user,services:state.user&&state.membership?['training']:[],membership:{active:!!state.user&&state.membership} };
  }
  if (path === '/team') data = { team };
  if (path === '/trainers') data = { trainers:team.map(person=>({...person,full:false,spotsRemaining:5,limit:5})) };
  if (path === '/membership-terms') data={terms:[]};
  if (path === '/availability') data={days:routineDates(req.query.from,req.query.to).map(date=>({date,slots:state.stale || [0,6].includes(routineWeekday(date)) || date === '2026-11-04' ? [] : ['10:00','11:00','17:00'],workingHours:['10:00','11:00','17:00'],reservedTimes:date === '2026-11-04'?['10:00','11:00','17:00']:[]}))};
  if (path === '/auth/login' || path === '/auth/register') {
    if (state.mfa && req.body.code !== '123456') return res.status(401).json({error:'Enter your authenticator code.',code:'MFA_REQUIRED'});
    state.user=member; state.failRefresh=state.interruptRefresh; state.interruptRefresh=false; data={user:member};
  }
  if (path === '/client-schedule') data={client:{id:member.id,name:member.name},terms:[{stripeId:'fixture-term',serviceIds:['training'],status:'active',dogCount:1,validFrom:'2026-10-01T05:00:00.000Z',validUntil:'2026-11-16T06:00:00.000Z'}],dayCredits:[],
    trainingBookings:[{_id:bookingId,dogName:member.dogName,dogCount:1,staffId:trainer,visits:state.visits,updatedAt:'2026-11-01T15:00:00.000Z',termStartsAt:'2026-10-01T05:00:00.000Z',termEndsAt:'2026-11-16T06:00:00.000Z'},
      {_id:'555555555555555555555555',dogName:'Another household dog',staffId:trainer,visits:[{date:'2026-10-27',time:'17:00',service:'training'}]}],
    visits:state.visits.filter(visit=>visit.date.startsWith(req.query.month)).map(visit=>({...visit,bookingId,dogName:member.dogName,status:'confirmed',paymentStatus:'covered',trainer:'Fixture Lead',staffId:trainer}))};
  if (path === '/client-schedule/changes') {state.visits.push(...req.body.additions.map(visit=>({...visit,service:'training'})));data={message:'Fixture routine saved.'};}
  if (path === '/bookings' && req.method==='POST') data={booking:{...req.body,_id:bookingId,status:'requested',paymentStatus:'unpaid',quote:{dueNowCents:20000}}};
  res.json(data);
});
app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try {for(const [engineName,engine] of Object.entries({chromium,webkit})) {
  if(process.env.BRAVO_BROWSER_ENGINES&&!process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName))continue;
  const browser=await engine.launch();
  try {for(const width of [390,1440]) {
    state={user:null,membership:false,writes:[],visits:[],mfa:false};
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
    await page.clock.setFixedTime(new Date('2026-11-02T14:00:00Z'));
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
    const fits=async()=>{ assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)); await page.addScriptTag({content:axe}); const audit=await page.evaluate(()=>window.axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})); assert.deepEqual(audit.violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})),[]); };
    try {
      await page.goto(`${origin}/portal?program=training`);
      assert.equal(await page.getByLabel('Number of dogs',{exact:true}).isVisible(),false);
      assert.equal(await page.getByLabel('Anything you’d like your trainer to know? (optional)',{exact:true}).isVisible(),false);
      await page.getByLabel('Dog’s name',{exact:true}).fill('Guided Dog');
      await page.getByLabel('What would you like help with?',{exact:true}).selectOption('not-sure');
      await fits();await page.screenshot({path:`test-results/easier-entry-${engineName}-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:'Choose a trainer →',exact:true}).click();
      await page.locator('.trainer-guidance > summary').click();
      await page.getByRole('link',{name:'Talk through your dog’s needs →',exact:true}).waitFor();
      await page.getByLabel('What kind of help do you need?',{exact:true}).selectOption('aggression');
      assert.equal(await page.getByRole('link',{name:'Explore the behavior assessment →'}).getAttribute('href'),'/behavior-assessment');
      assert.equal(await page.locator('.trainer-recommendation button').count(),0);
      await page.getByLabel('What kind of help do you need?',{exact:true}).selectOption('pitbull');
      await page.getByRole('button',{name:'See Fixture Specialist’s dates →',exact:true}).waitFor();
      await page.getByLabel('What kind of help do you need?',{exact:true}).selectOption('everyday');
      await page.getByRole('button',{name:'See Fixture Lead’s dates →',exact:true}).click();
      await page.getByRole('button',{name:'Use this time & review →',exact:true}).click();
      await page.getByRole('button',{name:'I have an account — sign in →',exact:true}).click();
      state.mfa=true;state.interruptRefresh=true;
      await page.getByLabel('Name or email',{exact:true}).fill('fixture@example.test');
      await page.getByLabel('Password',{exact:true}).fill('fixture-secure-password');
      await page.locator('.booking-inline-auth form').getByRole('button',{name:'Sign in',exact:true}).click();
      await page.getByLabel('Authenticator or recovery code',{exact:true}).fill('123456');
      assert.equal(new URL(page.url()).pathname,'/portal');
      assert.ok(!(await page.evaluate(()=>sessionStorage.getItem('bravo-booking-draft-v1'))).includes('fixture-secure-password'));
      await fits();await page.screenshot({path:`test-results/easier-inline-auth-${engineName}-${width}.png`,fullPage:true});
      await page.locator('.booking-inline-auth form').getByRole('button',{name:'Sign in',exact:true}).click();
      await page.getByRole('button',{name:'Retry account check',exact:true}).click();
      await page.getByRole('button',{name:'Send my request • no charge',exact:true}).waitFor();
      assert.equal(state.writes.filter(write=>write.path==='/auth/login').length,2,'one MFA challenge and one successful login; refresh retry never repeats authentication');
      assert.equal(await page.getByLabel('Visit address',{exact:true}).inputValue(),member.address);
      assert.equal(state.writes.filter(write=>write.path==='/bookings').length,0);
      await page.getByRole('button',{name:'Send my request • no charge',exact:true}).click();
      await page.getByRole('list',{name:'Request, payment and appointment status'}).waitFor();
      assert.match(await page.locator('.booking-finish-status').innerText(),/Request received[\s\S]*not paid yet[\s\S]*awaiting Bravo confirmation/);
      assert.equal(state.writes.filter(write=>write.path.includes('checkout')).length,0);
      assert.equal(state.writes.find(write=>write.path==='/bookings').body.trainingFocus,'not-sure');

      // First-time full-month planning: preview and add are both local drafts.
      await page.goto(`${origin}/portal?program=training`);
      await page.getByLabel('Dog’s name',{exact:true}).fill('Routine Dog');
      await page.getByRole('button',{name:'Plan my entire month',exact:true}).click();
      await page.getByLabel('Choose my trainer',{exact:true}).selectOption(trainer);
      const planner=page.getByRole('region',{name:'Plan a weekly routine',exact:true});
      await planner.getByRole('button',{name:'Preview my routine',exact:true}).click();
      assert.match(await planner.innerText(),/Wed, Nov 4[\s\S]*unavailable/);
      const before=state.writes.length;
      await planner.getByRole('button',{name:'Add available visits to draft',exact:true}).click();
      assert.equal(state.writes.length,before);
      const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bravo-booking-draft-v1')).draft);
      assert.ok(draft.visits.length>8);assert.ok(draft.visits.every(visit=>visit.time==='17:00'&&[1,3,5].includes(routineWeekday(visit.date))));
      assert.ok(!draft.visits.some(visit=>visit.date==='2026-11-04'));
      await fits();await page.screenshot({path:`test-results/easier-month-${engineName}-${width}.png`,fullPage:true});

      // Returning member: same dog/trainer, exact routine, fresh coverage and no cancellation.
      state.membership=true;state.visits=[['2026-10-26','10:00'],['2026-10-28','10:00'],['2026-10-30','10:00'],['2026-11-06','11:00']].map(([date,time])=>({date,time,service:'training'}));
      await page.goto(`${origin}/schedule?month=2026-11`);
      await page.getByRole('button',{name:'Plan my weekly routine',exact:true}).click();
      await planner.getByRole('button',{name:'Repeat my usual schedule',exact:true}).click();
      assert.match(await planner.innerText(),/4 available · 8 need another time · 1 already planned/);
      assert.match(await planner.innerText(),/Outside this request’s paid membership/);
      assert.equal(await planner.getByLabel('Tuesday',{exact:true}).isChecked(),false,'another dog’s routine is not copied');
      await planner.getByRole('button',{name:'Add available visits to draft',exact:true}).click();
      await page.getByText('4 to add · 0 to cancel',{exact:true}).waitFor();
      assert.equal(state.writes.filter(write=>write.path==='/client-schedule/changes').length,0);
      await fits();await page.screenshot({path:`test-results/easier-repeat-${engineName}-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:'Save changes',exact:true}).click();
      await page.getByText('Fixture routine saved.',{exact:true}).waitFor();
      const save=state.writes.find(write=>write.path==='/client-schedule/changes').body;
      assert.deepEqual(save.additions.map(visit=>visit.date),['2026-11-02','2026-11-09','2026-11-11','2026-11-13']);
      assert.deepEqual(save.removals,[]);assert.equal(save.openWeekends,false);assert.equal(save.bookingId,bookingId);assert.equal(save.staffId,undefined);
      assert.equal(state.visits.find(visit=>visit.date==='2026-11-06').time,'11:00');assert.deepEqual(errors,[]);
      // Resolving a paid membership must not change the route's chosen mode.
      await page.evaluate(()=>sessionStorage.clear());
      await page.goto(`${origin}/portal`);await page.waitForURL(`${origin}/schedule`);
      await page.evaluate(()=>sessionStorage.clear());
      await page.goto(`${origin}/portal?program=training`);await page.waitForLoadState('networkidle');
      await page.getByRole('heading',{name:'Build your schedule',exact:true}).waitFor();
      assert.equal(await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).count(),0,'a signed-in member keeps the full scheduler after draft persistence');
      await page.getByLabel('Dog’s name',{exact:true}).fill('Member full-schedule draft');await page.reload();
      await page.getByRole('heading',{name:'Build your schedule',exact:true}).waitFor();
      state.user=null;state.mfa=false;await page.evaluate(()=>sessionStorage.clear());
      await page.goto(`${origin}/portal`);
      await page.getByLabel('Dog’s name',{exact:true}).fill('Existing Member Dog');
      await page.getByRole('button',{name:'Choose a trainer →',exact:true}).click();
      await page.locator('.guided-trainer-cards button').filter({hasText:'Fixture Lead'}).click();
      await page.getByRole('button',{name:'Use this time & review →',exact:true}).click();
      await page.getByRole('button',{name:'I have an account — sign in →',exact:true}).click();
      await page.getByLabel('Name or email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-secure-password');
      await page.locator('.booking-inline-auth form').getByRole('button',{name:'Sign in',exact:true}).click();
      await page.getByRole('button',{name:'Send my request • no charge',exact:true}).waitFor();
      assert.equal(new URL(page.url()).pathname,'/portal','inline sign-in must not redirect an active member away from their draft');
      assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Existing Member Dog','an inline login keeps the guided request even with an active membership');
      await page.reload();await page.getByRole('button',{name:'Send my request • no charge',exact:true}).waitFor();
      assert.equal(new URL(page.url()).pathname,'/portal','reloading the resumed member draft keeps the review open');
      await page.getByRole('button',{name:'Send my request • no charge',exact:true}).click();
      await page.getByRole('list',{name:'Request, payment and appointment status'}).waitFor();
      assert.equal(new URL(page.url()).pathname,'/portal','clearing a submitted draft must not redirect away from its success screen');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engineName}/${width}: lighter entry, honest trainer guidance, inline MFA and retry, no credential storage, explicit request/payment state, weekly preview, conflicts, member routine and no silent renewal`);
    } catch(error) {await page.screenshot({path:`test-results/easier-failure-${engineName}-${width}.png`,fullPage:true});throw error;}
    finally {await context.close();}
  }} finally {await browser.close();}
}} finally {await new Promise(resolve=>server.close(resolve));}
