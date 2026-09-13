import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { trainerOptions } from '../shared/trainer-selection.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
const david={id:'aaaaaaaaaaaaaaaaaaaaaaaa',_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'David Northrop',role:'owner',isPrimaryOwner:true,email:'owner@example.test',spotsRemaining:5,limit:5};
const ashley={id:'bbbbbbbbbbbbbbbbbbbbbbbb',_id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:'Ashley Northrop',role:'staff',spotsRemaining:5,limit:5};
try {
 for(const [engineName,engine] of Object.entries({chromium,webkit})) {
  const browser=await engine.launch();
  try {for(const width of [320,390,1440]) {
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700});const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
   let added=null,updated=null,users=[],membership=null;
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),method=route.request().method();let json={};
    if(url.pathname==='/api/config')json={connected:true,paymentsReady:false};
    else if(url.pathname==='/api/auth/me')json={user:david,services:[],membership:{active:false}};
    else if(url.pathname==='/api/admin')json={role:'owner',bookings:[],team:[david,ashley],inbox:[],blocks:[],settings:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00']}};
    else if(url.pathname==='/api/admin/reviews')json={reviews:[]};
    else if(url.pathname==='/api/admin/services')json={services:[]};
    else if(url.pathname==='/api/admin/membership-status')json={remindersConfigured:true,automaticPlans:0};
    else if(url.pathname==='/api/notifications')json={items:[]};
    else if(url.pathname==='/api/site-images')json={images:{}};
    else if(url.pathname==='/api/team')json={team:[david,ashley]};
    else if(url.pathname==='/api/trainers')json={trainers:trainerOptions([david,ashley])};
    else if(url.pathname==='/api/admin/users'&&method==='POST'){
      added=route.request().postDataJSON();const user={id:'cccccccccccccccccccccccc',_id:'cccccccccccccccccccccccc',name:added.name,email:added.email,role:'member'};
      membership={enabled:true,manual:false,revision:1,startsAt:'2026-01-01T06:00:00.000Z',endsAt:'2026-02-01T06:00:00.000Z',serviceIds:added.membership.serviceIds,dogCount:added.membership.dogCount};users=[user];json={user,temporaryPassword:'fixture-password-only',membership};
    } else if(url.pathname==='/api/admin/users')json={users};
    else if(url.pathname==='/api/admin/memberships')json={memberships:{cccccccccccccccccccccccc:membership}};
    else if(url.pathname.startsWith('/api/admin/memberships/')&&method==='PATCH'){
      updated=route.request().postDataJSON();membership={...membership,revision:2,startsAt:'2026-01-31T06:00:00.000Z',endsAt:'2026-02-28T06:00:00.000Z'};json={membership,message:'Membership dates saved.'};
    } else if(url.pathname==='/api/availability')json={days:[],enabled:true};
    await route.fulfill({json,status:method==='POST'&&url.pathname==='/api/admin/users'?201:200});
   });
   await page.goto(`${origin}/admin?tab=people`);
   await page.getByText('Add a client',{exact:true}).click();const form=page.locator('.add-client-panel');
   await form.getByLabel('Client name',{exact:true}).fill('Fixture Client');await form.getByLabel('Email',{exact:true}).fill('client@example.test');
   await form.getByRole('checkbox',{name:'Set this client’s membership dates now'}).check();
   await form.getByLabel('Membership start date',{exact:false}).fill('2026-01-01');
   assert.equal(await form.getByLabel('Membership end date',{exact:false}).inputValue(),'2026-02-01');
   assert.equal(await form.getByLabel('Membership start date',{exact:false}).getAttribute('min'),null);
   await form.getByLabel('Member services',{exact:true}).selectOption('training');await form.getByLabel('Dogs covered',{exact:true}).fill('2');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/membership-dates-${engineName}-${width}.png`,fullPage:true});
   await form.getByRole('button',{name:'Create client account',exact:true}).click();await form.getByText('Client account created.',{exact:true}).waitFor();
   assert.deepEqual(added.membership,{startDate:'2026-01-01',serviceIds:['training'],dogCount:2});
   assert.equal(added.membershipStartDate,undefined);
   await page.locator('.owner-person>summary').filter({hasText:'Fixture Client'}).click();const access=page.locator('.member-access-control');
   await access.getByLabel('Membership start date',{exact:false}).fill('2026-01-31');
   assert.equal(await access.getByLabel('Membership end date',{exact:false}).inputValue(),'2026-02-28');
   await access.getByRole('button',{name:'Save membership dates',exact:true}).click();await access.getByText('Membership dates saved.',{exact:true}).waitFor();
   assert.equal(updated.startDate,'2026-01-31');assert.equal(updated.expectedRevision,1);
   await page.goto(`${origin}/portal?program=training`);
   await page.getByLabel('Choose my trainer',{exact:true}).selectOption('david-and-ashley');
   assert.equal(await page.getByLabel('Choose my trainer',{exact:true}).inputValue(),'david-and-ashley');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/shared-trainers-${engineName}-${width}.png`,fullPage:true});
   assert.deepEqual(errors,[]);await context.close();console.log(`${engineName} ${width}: backdated onboarding, editable month-end preview, shared trainer option and layout passed`);
  }}finally{await browser.close();}
 }
}finally{server.close();}
