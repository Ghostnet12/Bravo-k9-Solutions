import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {SERVICES} from '../shared/catalog.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;await mkdir('test-results',{recursive:true});
try {for(const [engineName,engine]of Object.entries({chromium,webkit})){const browser=await engine.launch();try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:true}),page=await context.newPage(),errors=[];let signedIn=false, trainingDisabled=false;const writes=[],savedRequests=[];
 await page.addInitScript(()=>{window.__renderErrors=[];window.addEventListener('error',event=>window.__renderErrors.push({message:event.message,stack:event.error?.stack,cause:event.error?.cause?.message,causeStack:event.error?.cause?.stack,url:location.href}));window.addEventListener('error',event=>console.error('Render cause:',event.error?.cause?.message,event.error?.cause?.stack||event.error?.stack));});
 page.on('pageerror',e=>errors.push(e.message));
 const consoleErrors=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let json={services:[],images:{},entries:{},team:[],schedules:[],reviews:[],count:0,clips:[],bookings:[],terms:[],messages:[],notifications:[],alerts:[],revision:0};
  if(path==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES.map(item=>item.id==='training'?{...item,enabled:!trainingDisabled}:item),schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['09:00','10:00']}};
  if(path==='/api/auth/me')json={user:signedIn?{id:'fixture',name:'Fixture Client',role:'member',phone:'6055550100',address:'Fixture address'}:null,services:[],subscriptions:[],membership:{active:false}};
  if(path==='/api/auth/login'){signedIn=true;json={user:{id:'fixture',name:'Fixture Client',role:'member'}};}
  if(path==='/api/trainers')json={trainers:[{id:'111111111111111111111111',name:'Fixture Trainer',spotsRemaining:4,limit:5}]};
  if(path==='/api/site-banner')json={alerts:[],settings:{motion:'never'},revision:0};
  if(path==='/api/site-banner/weather')json={weather:{temperature:63,description:'Cloudy',observedAt:new Date().toISOString()}};
  if(path==='/api/availability'){const start=new URL(route.request().url()).searchParams.get('from');json={days:[{date:start,slots:['09:00','10:00']},{date:new Date(Date.parse(start+'T12:00:00Z')+86400000).toISOString().slice(0,10),slots:['09:00','10:00']}]};}
  if(path==='/api/bookings' && route.request().method()==='POST'){const body=route.request().postDataJSON();savedRequests.push(body);json={booking:{_id:'fixture-booking',status:'requested',paymentStatus:'unpaid',quote:{dueNowCents:30000}}};}
  if(route.request().method()!=='GET')writes.push(path);
  await route.fulfill({json});
 });
 try{
  await page.goto(origin);await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.home-hero-image').getAttribute('src'),'/images/bravo-client-training.jpeg');
  assert.equal(await page.locator('.home-hero-image').evaluate(el=>el.complete && el.naturalWidth>0),true);
  assert.equal(await page.locator('.home-hero-image').evaluate(el=>getComputedStyle(el).objectFit),'contain');
  assert.ok(await page.getByText('One hour per day · Monday–Friday',{exact:true}).isVisible());
  await page.screenshot({path:`test-results/authentic-home-${engineName}-${width}.png`});
  assert.equal(await page.locator('.review-stars').count(),0);assert.equal(await page.locator('.banner-track').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.getByRole('link',{name:'Start private training',exact:true}).click();await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).waitFor();
  assert.equal(await page.getByText('IMPORTANT APPOINTMENT NOTICE',{exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'Build your schedule',exact:true}).count(),0);
  await page.getByLabel('Dog’s name',{exact:true}).fill('Biscuit');await page.getByLabel('Number of dogs',{exact:true}).fill('2');await page.getByLabel('What would you like help with?',{exact:true}).selectOption('puppy-foundations');await page.getByLabel('Anything you’d like your trainer to know? (optional)',{exact:true}).fill('Jumps when visitors arrive.');
  assert.ok((await page.locator('.first-visit-intro .price-total').innerText()).includes('$300/month'));
  await page.screenshot({path:`test-results/first-visit-${engineName}-${width}.png`});await page.getByRole('button',{name:'Choose a first visit →',exact:true}).click();await page.getByRole('heading',{name:'Keep your first visit together.',exact:true}).waitFor();
  assert.equal(await page.locator('.date-grid').count(),0,'no calendar before sign-in and trainer selection');assert.equal(await page.locator('#visit-details').count(),0);
  await page.getByRole('link',{name:'Sign in or create an account to choose your trainer',exact:true}).click();await page.getByLabel('Name or email',{exact:true}).fill('Fixture Client');await page.getByLabel('Password',{exact:true}).fill('isolated-fixture-password');await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Choose your trainer.',exact:true}).waitFor();
  assert.equal(await page.locator('.date-grid').count(),0);assert.equal(await page.getByRole('button',{name:'Choose a date & time →',exact:true}).isEnabled(),false);
  assert.ok((await page.locator('.guided-booking-price').innerText()).includes('$300/month'));
  await page.getByLabel('Choose my trainer',{exact:true}).selectOption('111111111111111111111111');await page.getByRole('button',{name:'Choose a date & time →',exact:true}).click();
  await page.getByRole('heading',{name:'Choose your first visit',exact:true}).waitFor();assert.equal(await page.locator('#choose-program').count(),0);assert.equal(await page.locator('#visit-details').count(),0);
  assert.equal(await page.getByRole('button',{name:'Find available days & times',exact:true}).isVisible(),false);assert.equal(await page.locator('.single-date-editor').isVisible(),false);assert.equal(await page.locator('.first-visit-date-range').getAttribute('open'),null);
  const dates=page.locator('.date-grid button');await dates.first().click();await dates.nth(1).click();assert.equal(await page.locator('.date-grid button[aria-pressed=true]').count(),1);await dates.nth(1).click();assert.equal(await page.locator('.date-grid button[aria-pressed=true]').count(),0);
  await dates.first().click();assert.equal(await page.getByRole('button',{name:'Review my request →',exact:true}).isEnabled(),false,'date alone cannot silently choose a time');
  assert.equal(await page.locator('.bulk-times button[aria-pressed=true]').count(),0);
  await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();assert.equal(await page.locator('.bulk-times button[aria-pressed=true]').count(),1);
  await page.screenshot({path:`test-results/first-visit-schedule-${engineName}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Review my request →',exact:true}).click();await page.getByRole('heading',{name:'Review your first visit.',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Dogs’ names',{exact:true}).inputValue(),'Biscuit');assert.equal(await page.getByLabel('Anything the team should know?',{exact:true}).inputValue(),'Jumps when visitors arrive.');
  assert.ok((await page.locator('.guided-visit-summary').innerText()).includes('Puppy foundations'));assert.ok((await page.locator('.guided-visit-summary').innerText()).includes('10:00 AM'));assert.equal(await page.locator('.date-grid').count(),0);
  await page.getByRole('button',{name:'Change date or time',exact:true}).click();await page.getByRole('heading',{name:'Choose your first visit',exact:true}).waitFor();
  await dates.nth(1).click();assert.equal(await page.getByRole('button',{name:'Review my request →',exact:true}).isEnabled(),false,'changing dates requires confirming the new time');await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();await page.getByRole('button',{name:'Review my request →',exact:true}).click();
  await page.screenshot({path:`test-results/first-visit-review-${engineName}-${width}.png`,fullPage:true});assert.equal(await page.getByText('IMPORTANT APPOINTMENT NOTICE',{exact:true}).count(),1);
  await page.getByRole('button',{name:'Send my request • no charge',exact:true}).click();await page.getByText('Request saved. Bravo will confirm the visit details. No card has been charged.',{exact:true}).waitFor();assert.equal(savedRequests.length,1);assert.equal(savedRequests[0].visits.length,1);assert.equal(savedRequests[0].visits[0].time,'10:00');assert.equal(savedRequests[0].preferredTrainerId,'111111111111111111111111');assert.equal(savedRequests[0].dogCount,2);assert.equal(savedRequests[0].trainingFocus,'puppy-foundations');assert.equal(await page.getByRole('button',{name:'Send my request • no charge',exact:true}).count(),0);
  await page.goto(origin+'/portal?program=training');await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).waitFor();await page.getByLabel('Dog’s name',{exact:true}).fill('Biscuit');await page.getByRole('button',{name:'Choose a first visit →',exact:true}).click();
  await page.getByText('Need more scheduling options?',{exact:true}).click();await page.getByRole('button',{name:'Plan multiple visits instead',exact:true}).click();await page.getByRole('heading',{name:'Build your schedule',exact:true}).waitFor();assert.equal(await page.locator('.program-choices').isVisible(),true);await page.getByRole('button',{name:'Find available days & times',exact:true}).click();await dates.first().click();await dates.nth(1).click();assert.equal(await page.locator('.date-grid button[aria-pressed=true]').count(),2);
  trainingDisabled=true;await page.goto(origin+'/portal?program=training');await page.waitForLoadState('networkidle');assert.equal(await page.locator('.first-visit-intro').count(),0);await page.getByRole('button',{name:/^Dog Walking /}).click();assert.equal(await page.getByText('A selected service is temporarily unavailable. Choose an available program before saving.',{exact:true}).count(),0);
  assert.deepEqual(writes,['/api/auth/login','/api/quote','/api/bookings']);if(errors.length)console.log('Render diagnostics',consoleErrors,await page.evaluate(()=>window.__renderErrors));assert.deepEqual(errors,[]);console.log(`PASS ${engineName}/${width}: guided first visit, sign-in resume, explicit time choice, review, save payload, full scheduler and quiet banner`);
 }catch(error){await page.screenshot({path:`test-results/clarity-failure-${engineName}-${width}.png`,fullPage:true});await writeFile(`test-results/clarity-failure-${engineName}-${width}.json`,JSON.stringify({error:error.message,errors,consoleErrors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}}}finally{server.close();}
