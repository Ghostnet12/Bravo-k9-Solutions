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
   else if(path==='/api/auth/me')json={user:signedIn?{id,name:'Fixture Person',role:access==='administrator'?'staff':access,staffAccess:access==='administrator'?'administrator':'staff'}:null,services:[]};
   else if(path==='/api/auth/logout'){
    if(failLogout){failLogout=false;return route.fulfill({status:503,json:{error:'Try again shortly.'}});}
    signedIn=false;json={ok:true};
   }
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
   await page.getByRole('button',{name:'Add Days and Times',exact:true}).click();
   const editor=page.getByRole('region',{name:'Add Days and Times',exact:true});
   await editor.locator('.edit-calendar button:not([disabled])').nth(0).click();
   await editor.locator('.edit-calendar button:not([disabled])').nth(1).click();
   assert.equal(body,null);
   await editor.getByRole('button',{name:'12:00 PM',exact:true}).click();
   assert.match(await editor.locator('.schedule-change-summary').innerText(),/2 to add/);
   await editor.getByText('Change one date',{exact:true}).click();
   await editor.getByLabel('Date to change',{exact:true}).selectOption(dates[1]);
   await editor.getByRole('checkbox',{name:'12:00 PM',exact:true}).uncheck();
   await editor.getByRole('checkbox',{name:'1:00 PM',exact:true}).check();
   await editor.getByLabel(access==='member'?'Note to Bravo':'Note to the client',{exact:true}).fill('Agreed schedule.');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/bulk-schedule-${engineName}-${access}.png`,fullPage:true});
   await editor.getByRole('button',{name:'Save changes',exact:true}).click();
   await page.getByText('Schedule saved.',{exact:true}).waitFor();
   assert.deepEqual(body.additions,[{date:dates[0],time:'12:00'},{date:dates[1],time:'13:00'}]);
   if(access==='member'){
    await page.goto(`${origin}/portal`);
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
   await page.getByRole('button',{name:'Menu',exact:true}).click();
   const nav=page.getByRole('navigation',{name:'Primary navigation',exact:true});
   assert.equal(await nav.locator('button').last().innerText(),'Sign out');
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
