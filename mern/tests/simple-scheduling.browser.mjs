import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const id='aaaaaaaaaaaaaaaaaaaaaaaa',bookingId='bbbbbbbbbbbbbbbbbbbbbbbb',start=DateTime.now().setZone('America/Chicago').plus({months:1}).startOf('month');
const dates=[start.toISODate(),start.plus({days:1}).toISODate()],month=start.toFormat('yyyy-MM');
await mkdir('test-results',{recursive:true});
try {for(const [engineName,engine] of Object.entries({chromium,webkit})){
 if(process.env.BRAVO_BROWSER_ENGINES&&!process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName))continue;
 const browser=await engine.launch();
 try {for(const access of ['member','staff','administrator','owner']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),page=await context.newPage();
  let signedIn=true,failLogout=true,body=null;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;let json={};
   if(path==='/api/config')json={connected:true,services:SERVICES,schedule:{enabled:true,hours:['09:00','10:00','12:00','13:00']}};
   else if(path==='/api/auth/me')json={user:signedIn?{id,name:'Fixture Person',role:access==='administrator'?'owner':access,isPrimaryOwner:access==='owner'}:null,services:access==='member'?['training']:[],membership:{active:access==='member'}};
   else if(path==='/api/auth/logout'){
    if(failLogout){failLogout=false;return route.fulfill({status:503,json:{error:'Try again shortly.'}});}
    signedIn=false;json={ok:true};
   }
   else if(path==='/api/membership-terms')json={terms:[]};
   else if(path==='/api/bookings')json={bookings:[]};
   else if(path==='/api/notifications')json={items:[]};
   else if(path==='/api/trainers')json={trainers:[{id,name:'David',spotsRemaining:4,limit:5}]};
   else if(path==='/api/team')json={team:[{id,_id:id,name:'David',role:'owner'}]};
   else if(path==='/api/availability'){
    const from=DateTime.fromISO(url.searchParams.get('from')),to=DateTime.fromISO(url.searchParams.get('to'));
    json={days:Array.from({length:Math.floor(to.diff(from,'days').days)+1},(_,i)=>({date:from.plus({days:i}).toISODate(),slots:['09:00','10:00','12:00','13:00'],businessHours:['09:00','10:00','11:00','12:00','13:00'],reservedTimes:['11:00']}))};
   }
   else if(path==='/api/client-schedule')json={client:{id,name:'Fixture Person'},month,terms:[{serviceIds:['training'],status:'active',validFrom:start.minus({days:3}).toISO(),validUntil:start.plus({days:60}).toISO()}],visits:[],trainingBookings:[{_id:bookingId,staffId:id,dogName:'Fixture Dog',visits:[],updatedAt:start.toISO()}]};
   else if(path==='/api/client-schedule/changes'){body=route.request().postDataJSON();json={message:'Schedule saved.'};}
   await route.fulfill({json});
  });
  try {
   await page.goto(`${origin}/schedule?month=${month}`);
   await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).click();
   const editor=page.getByRole('region',{name:'Add or Cancel Date',exact:true});
   for(const date of dates){
    const label=new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    await editor.getByRole('button',{name:new RegExp(`^${label},`)}).click();
   }
   assert.equal(body,null);
   await editor.getByRole('button',{name:'12:00 PM',exact:true}).click();
   assert.equal(await editor.getByRole('button',{name:'12:00 PM',exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await editor.getByRole('button',{name:'12:00 PM',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(237, 201, 117)');
   assert.match(await editor.locator('.schedule-change-summary').innerText(),/2 to add/);
   await editor.getByText('Change one date',{exact:true}).click();
   await editor.getByLabel('Date to change',{exact:true}).selectOption(dates[1]);
   await editor.getByRole('checkbox',{name:'12:00 PM',exact:true}).uncheck();
   await editor.getByRole('checkbox',{name:'1:00 PM',exact:true}).check();
   assert.equal(await editor.getByRole('button',{name:'12:00 PM',exact:true}).getAttribute('aria-pressed'),'false');
   assert.equal(await editor.getByRole('checkbox',{name:'1:00 PM',exact:true}).evaluate(el=>getComputedStyle(el.closest('label')).backgroundColor),'rgb(237, 201, 117)');
   assert.equal(await editor.getByLabel(access==='member'?'Note to Bravo':'Note to the client',{exact:true}).getAttribute('required'),null);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/bulk-schedule-${engineName}-${access}.png`,fullPage:true});
   await editor.getByRole('button',{name:'Save changes',exact:true}).click();
   await page.getByText('Schedule saved.',{exact:true}).waitFor();
   assert.equal(body.note,'');
   assert.deepEqual(body.additions,[{date:dates[0],time:'12:00'},{date:dates[1],time:'13:00'}]);
   if(access==='member'){
    await page.goto(`${origin}/portal`);
    await page.getByRole('heading',{name:'Fixture Person’s schedule.',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/schedule');
    await page.goto(`${origin}/portal?new=1`);
    assert.equal(await page.locator('.booking-extra-options select').last().isVisible(),false);
    await page.getByText('More scheduling options (optional)',{exact:true}).click();
    await page.locator('.booking-extra-options select').last().waitFor({state:'visible'});
    await page.locator('.booking-extra-options select').last().selectOption('morning');
    await page.getByText('More scheduling options (optional)',{exact:true}).click();
    await page.getByText(/Time filters are on:/).waitFor();
    await page.getByText('More scheduling options (optional)',{exact:true}).click();
    await page.locator('.booking-extra-options select').last().selectOption('any');
    await page.getByText('More scheduling options (optional)',{exact:true}).click();
    await page.getByLabel('Choose my trainer',{exact:true}).selectOption(id);
    await page.getByLabel('Start date',{exact:true}).fill(dates[0]);
    await page.getByLabel('End date',{exact:true}).fill(dates[1]);
    await page.getByRole('button',{name:'Find available days & times',exact:true}).click();
    await page.locator('.date-grid button:not([disabled])').nth(0).click();
    await page.locator('.date-grid button:not([disabled])').nth(1).click();
    await page.getByRole('button',{name:'12:00 PM',exact:true}).click();
    await page.getByText('Change one date',{exact:true}).click();
    assert.deepEqual(await page.locator('.visit-row select').evaluateAll(items=>items.map(item=>item.value)),['12:00','12:00']);
    await page.locator('.visit-row select').nth(1).selectOption('13:00');
    assert.deepEqual(await page.locator('.visit-row select').evaluateAll(items=>items.map(item=>item.value)),['12:00','13:00']);
   }
   await page.getByRole('link',{name:'Contact & visit help',exact:true}).click();
   await page.locator('main').getByRole('button',{name:'Back',exact:true}).click();
   assert.notEqual(new URL(page.url()).pathname,'/contact');
   await page.getByRole('button',{name:'Menu',exact:true}).click();
   const nav=page.getByRole('navigation',{name:'Primary navigation',exact:true});
   assert.equal(await nav.locator('button').last().innerText(),'Sign out');
   if(access==='member'){
    assert.equal(await nav.getByRole('link',{name:'My schedule',exact:true}).count(),1);
    assert.equal(await nav.getByRole('link',{name:'Message Bravo',exact:true}).getAttribute('href'),'/community?tab=direct');
   }else{
    assert.equal(await nav.getByRole('link',{name:'Team schedule',exact:true}).getAttribute('href'),'/admin?tab=schedule');
    assert.equal(await nav.getByRole('link',{name:'People & access',exact:true}).getAttribute('href'),'/admin?tab=people');
   }
   await nav.getByRole('button',{name:'Sign out',exact:true}).click();
   await nav.getByRole('alert').waitFor();assert.equal(signedIn,true);
   await nav.getByRole('button',{name:'Sign out',exact:true}).click();
   await page.getByLabel('Name or email',{exact:true}).waitFor();assert.equal(signedIn,false);
   await page.getByRole('button',{name:'Menu',exact:true}).click();assert.equal(await nav.getByRole('button',{name:'Sign out',exact:true}).count(),0);
   assert.deepEqual(errors,[]);console.log(`${engineName} ${access}: bulk noon, individual override, save, menu sign-out failure/retry passed`);
  } finally {await context.close();}
 }
 }finally{await browser.close();}
}}finally{server.close();}
