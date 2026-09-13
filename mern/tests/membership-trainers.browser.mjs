import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {SERVICES} from '../shared/catalog.js';
import {manualMonthTerm} from '../shared/membership-terms.js';
import {trainerOptions,JOINT_TRAINER_ID} from '../shared/trainers.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const serverApp=express();serverApp.use(express.static(dist));serverApp.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=serverApp.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const david={id:'aaaaaaaaaaaaaaaaaaaaaaaa',_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'David Northrop',role:'owner',spotsRemaining:5,limit:5},ashley={id:'bbbbbbbbbbbbbbbbbbbbbbbb',_id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:'Ashley Northrop',role:'staff',spotsRemaining:5,limit:5};
const clientId='cccccccccccccccccccccccc',bookingId='dddddddddddddddddddddddd';
await mkdir('test-results',{recursive:true});
try{
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch();
  try{for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width<700}),page=await context.newPage();
   let createdBody=null,assignment=null,acceptance=null,availabilityTrainer=null,assigned=[],accepted=false;const errors=[];
   try {
             page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;let json={};
    if(path==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES,schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00']}};
    else if(path==='/api/auth/me')json={user:{...david,isPrimaryOwner:true},services:[],membership:{active:false}};
    else if(path==='/api/notifications')json={items:[]};
    else if(path==='/api/site-images')json={images:{}};
    else if(path==='/api/admin')json={role:'owner',team:[david,ashley],bookings:[],inbox:[],blocks:[],settings:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00']}};
    else if(path==='/api/admin/reviews')json={reviews:[]};
    else if(path==='/api/admin/services')json={services:SERVICES};
    else if(path==='/api/admin/membership-status')json={remindersConfigured:true,automaticPlans:0};
    else if(path==='/api/admin/memberships')json={memberships:{}};
    else if(path==='/api/admin/users'&&route.request().method()==='POST'){
      createdBody=route.request().postDataJSON();json={user:{id:clientId,name:createdBody.name,email:createdBody.email,role:'member'},temporaryPassword:'Isolated-browser-fixture-only',membership:{...manualMonthTerm(createdBody.membershipStartDate),active:false}};
    }else if(path==='/api/admin/users')json={users:[]};
    else if(path==='/api/team')json={team:[david,ashley]};
    else if(path==='/api/trainers')json={trainers:trainerOptions([david,ashley])};
    else if(path==='/api/availability'){availabilityTrainer=url.searchParams.get('staffId');json={enabled:true,days:[]};}
    else if(path.endsWith('/assignment')){assignment=route.request().postDataJSON();assigned=[david.id,ashley.id];accepted=false;json={ok:true};}
    else if(path.endsWith('/accept-client')){acceptance=route.request().postDataJSON();accepted=true;json={ok:true,message:'Client accepted by both trainers.'};}
    else if(path==='/api/client-schedule')json={client:{id:clientId,name:'Added Client'},month:'2026-09',terms:[],visits:[],trainingBookings:[{_id:bookingId,dogName:'Fixture dog',dogCount:1,staffId:assigned[0]||null,staffIds:assigned,trainerAcceptanceRequired:assigned.length>0&&!accepted,trainerAcceptedAt:accepted?'2026-09-13T00:00:00.000Z':null,trainerAcceptedIds:accepted?assigned:[],updatedAt:'2026-09-13T00:00:00.000Z',visits:[]}]};
    return route.fulfill({json});
   });
   await page.goto(`${origin}/admin?tab=people`);await page.locator('.add-client-panel > summary').click();
   const panel=page.locator('.add-client-panel'),start=panel.locator('input[name="membershipStartDate"]'),end=panel.getByLabel('Membership end date',{exact:true});
   assert.equal(await start.getAttribute('min'),null);
   for(const [from,to] of [['2026-01-01','2026-02-01'],['2026-01-31','2026-02-28'],['2028-01-31','2028-02-29']]){await start.fill(from);await page.waitForFunction(({to})=>[...document.querySelectorAll('.add-client-panel input[readonly]')].some(i=>i.value===to),{to});assert.equal(await end.inputValue(),to);}
   await start.fill('2026-01-01');await panel.getByLabel('Client name',{exact:true}).fill('Added Client');await panel.getByLabel('Email',{exact:true}).fill('added@example.test');
   await panel.locator('input[name="trainingDogCount"]').fill('2');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/membership-dates-${engineName}-${width}.png`,fullPage:true});
   await panel.getByRole('button',{name:'Create client account',exact:true}).click();await panel.getByRole('heading',{name:'Client account created.',exact:true}).waitFor();
   assert.equal(createdBody.membershipStartDate,'2026-01-01');assert.equal(createdBody.trainingDogCount,'2');assert.equal(createdBody.validUntil,undefined);
   await page.goto(`${origin}/portal?program=training`);
   const choices=page.getByLabel('Choose my trainer',{exact:true});await choices.locator(`option[value="${JOINT_TRAINER_ID}"]`).waitFor({state:'attached'});
   assert.ok((await choices.locator('option').nth(3).textContent()).startsWith('David and Ashley'));
   await Promise.all([page.waitForResponse(r=>r.url().includes('/api/availability?')&&r.url().includes(JOINT_TRAINER_ID)),choices.selectOption(JOINT_TRAINER_ID)]);assert.equal(availabilityTrainer,JOINT_TRAINER_ID);
   await page.goto(`${origin}/schedule?client=${clientId}&month=2026-09`);await page.getByText('Assign trainer & accept client',{exact:true}).click();
   const assignedChoice=page.getByLabel('Assigned trainer',{exact:true});await assignedChoice.locator(`option[value="${JOINT_TRAINER_ID}"]`).waitFor({state:'attached'});await assignedChoice.selectOption(JOINT_TRAINER_ID);
   await page.getByRole('button',{name:'Assign trainer',exact:true}).click();await page.getByText('Trainer assigned. Each assigned trainer can now accept from their staff profile.',{exact:true}).waitFor();
   assert.equal(assignment.staffId,JOINT_TRAINER_ID);
   await page.getByText('Assign trainer & accept client',{exact:true}).click();await page.getByRole('button',{name:'Accept for both trainers',exact:true}).click();
   await page.getByText('Client accepted by both trainers.',{exact:true}).waitFor();assert.equal(acceptance.staffId,JOINT_TRAINER_ID);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   await page.screenshot({path:`test-results/joint-trainer-${engineName}-${width}.png`,fullPage:true});
   } catch(error) { await page.screenshot({path:`test-results/feature-failure-${engineName}-${width}.png`,fullPage:true}); console.log('BROWSER FAILURE DOM:',await page.locator('body').innerText()); throw error; } finally { await context.close(); }
             console.log(`${engineName} ${width}: start/end dates, backdating, month-end, onboarding, joint choice, assignment, owner acceptance and layout passed`);
  }}finally{await browser.close()}
 }
}finally{server.close()}
