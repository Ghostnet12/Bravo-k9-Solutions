// Production-build browser regression using synthetic APIs only. Linux needs system fonts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import app from '../server/app.js';
import { SERVICES } from '../shared/catalog.js';
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,trainerId='111111111111111111111111';
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  let signedIn=false;const writes=[],saved=[],errors=[];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const ep=url.pathname.slice(4);
   let data={services:[],images:{},entries:{},team:[],schedules:[],reviews:[],recommendations:[],count:0,clips:[],bookings:[],terms:[],items:[],alerts:[],revision:0};
   if(ep==='/config')data={connected:true,paymentsReady:false,services:SERVICES,schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['09:00','10:00']}};
   if(ep==='/auth/me')data={user:signedIn?{id:'fixture',name:'Fixture Client',role:'member',phone:'6055550100',address:'Fixture address'}:null,services:[],membership:{active:false}};
   if(ep==='/auth/login'){signedIn=true;data={user:{id:'fixture',name:'Fixture Client',role:'member'}};}
   if(ep==='/team')data={team:[{id:trainerId,name:'Fixture Trainer',role:'staff',title:'Private dog trainer',bio:'Private training at home.'}]};
   if(ep==='/trainers')data={trainers:[{id:trainerId,name:'Fixture Trainer',spotsRemaining:4,full:false,limit:5}]};
   if(ep==='/availability'){const start=url.searchParams.get('from');data={days:[{date:start,slots:['09:00','10:00']},{date:new Date(Date.parse(start+'T12:00:00Z')+86400000).toISOString().slice(0,10),slots:['09:00','10:00']}]};}
   if(ep==='/bookings'&&req.method()==='POST'){saved.push(req.postDataJSON());data={booking:{_id:'fixture-booking',status:'requested',paymentStatus:'unpaid',quote:{dueNowCents:30000}}};}
   if(ep==='/live')data={sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()};
   if(req.method()!=='GET')writes.push(ep);
   return route.fulfill({json:data});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  try {
   await page.goto(origin+'/portal?program=training');
   await page.getByLabel('Dog’s name',{exact:true}).fill('Biscuit');
   await page.getByLabel('Number of dogs',{exact:true}).fill('2');
   await page.getByLabel('What would you like help with?',{exact:true}).selectOption('basic-obedience');
   await page.getByLabel('Anything you’d like your trainer to know? (optional)',{exact:true}).fill('Jumps when visitors arrive.');
   assert.ok((await page.locator('.first-visit-intro .price-total').innerText()).includes('$300/month'));
   await page.getByRole('button',{name:'Choose a trainer →',exact:true}).focus();await page.keyboard.press('Enter');
   await page.getByRole('heading',{name:'Choose your trainer.',exact:true}).waitFor();
   assert.equal(await page.locator('.date-grid').count(),0);
   assert.equal(await page.getByRole('button',{name:'Choose a date & time →',exact:true}).isEnabled(),false);
   await page.getByLabel('Choose my trainer',{exact:true}).selectOption(trainerId);
   await page.getByRole('button',{name:'Choose a date & time →',exact:true}).click();
   const dates=page.locator('.date-grid button');await dates.first().click();
   assert.equal(await page.getByRole('button',{name:'Review my request →',exact:true}).isEnabled(),false,'a date alone does not confirm a time');
   await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();
   await page.getByRole('button',{name:'Review my request →',exact:true}).click();
   await page.getByRole('heading',{name:'Review your first visit.',exact:true}).waitFor();
   assert.deepEqual(writes,[],'guest planning is a local draft');
   assert.equal(await page.getByRole('button',{name:'Send my request • no charge',exact:true}).count(),0);
   await page.getByRole('link',{name:'Sign in or create your account',exact:true}).click();
   await page.getByLabel('Name or email',{exact:true}).fill('Fixture Client');
   await page.getByLabel('Password',{exact:true}).fill('isolated-fixture-password');
   await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
   await page.getByRole('heading',{name:'Review your first visit.',exact:true}).waitFor();
   assert.equal(await page.getByLabel('Dogs’ names',{exact:true}).inputValue(),'Biscuit');
   assert.equal(await page.getByLabel('Anything the team should know?',{exact:true}).inputValue(),'Jumps when visitors arrive.');
   assert.ok((await page.locator('.guided-visit-summary').innerText()).includes('10:00 AM'));
   await page.getByRole('button',{name:'Change date or time',exact:true}).click();await dates.nth(1).click();
   assert.equal(await page.getByRole('button',{name:'Review my request →',exact:true}).isEnabled(),false,'changing dates requires explicit time confirmation');
   await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();
   await page.getByRole('button',{name:'Review my request →',exact:true}).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.getByRole('button',{name:'Send my request • no charge',exact:true}).click();
   await page.getByText('Request saved. Bravo will confirm the visit details. No card has been charged.',{exact:true}).waitFor();
   assert.equal(saved.length,1);assert.equal(saved[0].visits.length,1);assert.equal(saved[0].visits[0].time,'10:00');assert.equal(saved[0].preferredTrainerId,trainerId);assert.equal(saved[0].dogCount,2);assert.equal(saved[0].trainingFocus,'basic-obedience');
   assert.equal(await page.getByRole('button',{name:'Send my request • no charge',exact:true}).count(),0);
   await page.goto(origin+'/portal?program=training');
   await page.getByLabel('Dog’s name',{exact:true}).fill('Whole Month Dog');
   await page.getByLabel('Anything you’d like your trainer to know? (optional)',{exact:true}).fill('Retain this full-month note.');
   await page.getByRole('button',{name:'Plan my whole month',exact:true}).click();
   await page.getByRole('heading',{name:'Build your schedule',exact:true}).waitFor();
   assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Whole Month Dog');
   await page.getByLabel('Choose my trainer',{exact:true}).selectOption(trainerId);
   await page.getByRole('button',{name:'Find available days & times',exact:true}).click();
   await page.locator('.date-grid button:not([disabled])').first().click();
   await page.locator('.date-grid button:not([disabled])').nth(1).click();
   await page.locator('.bulk-times').getByRole('button',{name:/10:00/}).click();
   await page.getByText('Change one date',{exact:true}).click();
   assert.deepEqual(await page.locator('.visit-row select').evaluateAll(items=>items.map(item=>item.value)),['10:00','10:00']);
   assert.equal(await page.getByLabel('Anything the team should know?',{exact:true}).inputValue(),'Retain this full-month note.');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.deepEqual(writes,['/auth/login','/quote','/bookings']);
   assert.deepEqual(errors,[]);
   console.log(`PASS Chromium/${width}: first visit through sign-in, retained draft, explicit date/time, review and request save; full-month entry and shared-time selection. No real customer writes or payments.`);
  } catch(error) { console.error(error.message,(await page.locator('main').innerText()).slice(-2500));throw error; }
  finally {await context.close();}
 }
} finally {await browser.close();server.close();}
