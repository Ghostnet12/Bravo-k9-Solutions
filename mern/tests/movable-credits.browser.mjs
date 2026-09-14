import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
import { planCreditDays, creditPlacementDates } from '../shared/day-credits.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const staffId='aaaaaaaaaaaaaaaaaaaaaaaa',clientId='bbbbbbbbbbbbbbbbbbbbbbbb',bookingId='cccccccccccccccccccccccc';
const now=DateTime.fromISO('2026-09-14T08:00',{zone:'America/Chicago'});
const name=date=>new RegExp(`^${DateTime.fromISO(date).toFormat('ccc, LLL d')},`);
await mkdir('test-results',{recursive:true});
try{for(const [engineName,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch();try{for(const access of ['staff','administrator','owner']){
  const context=await browser.newContext({viewport:{width:access==='owner'?1440:390,height:844}}),page=await context.newPage();await page.clock.setFixedTime(now.toJSDate());
  let role=access==='staff'?'staff':'owner',lastCredit,lastMove;
  const errors=[];page.on('pageerror',e=>errors.push({message:e.message,cause:e.cause?.message,url:page.url()}));
  let term={stripeId:'grant:test',bookingId,serviceIds:['training'],status:'active',validFrom:'2026-09-01T05:00:00.000Z',validUntil:'2026-09-21T05:00:00.000Z',creditedDays:1};
  let credits=[{_id:'legacy-credit',termId:term.stripeId,days:1,reason:'Other',note:'',beforeEnd:'2026-09-20T05:00:00.000Z',afterEnd:term.validUntil,createdAt:now.toISO()}];
  let booking={_id:bookingId,dogName:'Gunner',staffId,staffIds:[staffId],termStartsAt:term.validFrom,termEndsAt:term.validUntil,updatedAt:now.toISO(),visits:['2026-09-16','2026-09-17'].map(date=>({date,time:'10:00',service:'training'})),cancelledVisits:[]};
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;let json={};
   const person={id:staffId,_id:staffId,name:'Trainer',role,isPrimaryOwner:access==='owner'};
   if(path==='/api/auth/me')json={user:role==='member'?{id:clientId,name:'Client',role}:person,services:['training'],membership:{active:true}};
   else if(path==='/api/config')json={connected:true,services:SERVICES,schedule:{enabled:true,hours:['10:00','11:00']}};
   else if(path==='/api/notifications')json={items:[]};else if(path==='/api/team')json={team:[person]};
   else if(path==='/api/client-schedule')json={client:{id:clientId,name:'Client'},terms:[term],dayCredits:credits,trainingBookings:[booking],visits:[...booking.visits.map(v=>({...v,status:'confirmed'})),...booking.cancelledVisits.map(v=>({...v,status:'cancelled'}))].filter(v=>v.date.startsWith(url.searchParams.get('month'))).map(v=>({...v,bookingId,dogName:'Gunner',trainer:'Trainer',paymentStatus:'covered'}))};
   else if(path==='/api/availability'){const start=DateTime.fromISO(url.searchParams.get('from'));json={days:Array.from({length:start.daysInMonth},(_,i)=>({date:start.plus({days:i}).toISODate(),slots:['10:00','11:00'],businessHours:['10:00','11:00'],reservedTimes:[]}))};}
   else if(path==='/api/client-schedule/credits/move'){
    lastMove=route.request().postDataJSON();
    if(!lastMove.includeWeekends&&DateTime.fromISO(lastMove.to).weekday>=6)return route.fulfill({status:400,json:{error:'Turn on Include weekends to move a credit to Saturday or Sunday.'}});
    const item=credits.find(c=>c._id===lastMove.creditId);item.creditDates=creditPlacementDates(item).map(d=>d===lastMove.from?lastMove.to:d).sort();item.revision=(item.revision||0)+1;
    const end=DateTime.fromISO(lastMove.to,{zone:'America/Chicago'}).plus({days:1}).startOf('day').toUTC().toISO();if(end>term.validUntil){term={...term,validUntil:end};booking={...booking,termEndsAt:end};}
    json={ok:true,date:lastMove.to,message:`Credit moved to ${lastMove.to}.`};
   }else if(path==='/api/client-schedule/credits'){
    lastCredit=route.request().postDataJSON();const plan=planCreditDays(term.validUntil,lastCredit.days,lastCredit.includeWeekends);
    const credit={_id:`credit-${credits.length}`,termId:term.stripeId,days:lastCredit.days,missedDates:lastCredit.missedDates,note:lastCredit.note,beforeEnd:term.validUntil,afterEnd:plan.afterEnd.toISOString(),creditDates:plan.dates,createdAt:now.toISO()};credits.push(credit);
    term={...term,validUntil:credit.afterEnd,creditedDays:term.creditedDays+lastCredit.days};
    const missed=lastCredit.missedDates||[];booking={...booking,termEndsAt:credit.afterEnd,cancelledVisits:[...booking.cancelledVisits,...booking.visits.filter(v=>missed.includes(v.date))],visits:booking.visits.filter(v=>!missed.includes(v.date))};
    json={ok:true,credit,message:'Credits saved.'};
   }
   await route.fulfill({json});
  });
  try{
   await page.goto(`${origin}/schedule?client=${clientId}&month=2026-09`);await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).waitFor();
   const grid=page.getByLabel('Saved monthly schedule');await grid.getByRole('button',{name:name('2026-09-20')}).click();
   const move=page.getByRole('region',{name:'Move credit',exact:true});await move.getByRole('button',{name:'Move credit',exact:true}).click();
   assert.equal(await move.getByLabel('Include weekends',{exact:true}).isChecked(),false);
   assert.equal(await move.getByLabel('Note (optional)',{exact:true}).getAttribute('required'),null);
   await move.getByLabel('Move credit to',{exact:true}).fill('2026-09-26');await move.getByRole('button',{name:'Save credit',exact:true}).click();
   await move.getByText('Turn on Include weekends to move a credit to Saturday or Sunday.',{exact:true}).waitFor();
   await move.getByLabel('Move credit to',{exact:true}).fill('2026-09-21');await move.getByRole('button',{name:'Save credit',exact:true}).click();
   await page.getByText('Credit moved to 2026-09-21.',{exact:true}).waitFor();
   assert.equal(lastMove.note,'');assert.equal(lastMove.includeWeekends,false);assert.equal(booking.visits.length,2);assert.equal(term.creditedDays,1);
   assert.equal(await grid.getByRole('button',{name:name('2026-09-20')}).locator('.credit-day-label').count(),0);
   assert.equal(await grid.getByRole('button',{name:name('2026-09-21')}).getAttribute('aria-pressed'),'true');
   await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).click();const editor=page.getByRole('region',{name:'Add or Cancel Date',exact:true});
   await page.getByText('Checking available times…').waitFor({state:'hidden'});
   const toggle=editor.getByRole('checkbox',{name:'Open the selected weekend times when saving',exact:true});assert.equal(await toggle.isChecked(),false);
   const editGrid=editor.getByLabel('Choose training days');assert.equal(await editGrid.getByRole('button',{name:name('2026-09-19')}).isDisabled(),true);
   await toggle.check();assert.equal(await editGrid.getByRole('button',{name:name('2026-09-19')}).isEnabled(),true);await toggle.uncheck();
   for(const date of ['2026-09-16','2026-09-17'])await editGrid.getByRole('button',{name:name(date)}).click();
   await editor.getByRole('checkbox',{name:'Give credit for selected days',exact:true}).check();await editor.getByRole('button',{name:'Save',exact:true}).click();
   await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).waitFor();assert.deepEqual(lastCredit.missedDates,['2026-09-16','2026-09-17']);assert.equal(lastCredit.days,2);assert.equal(lastCredit.note,'');
   assert.equal(booking.visits.length,0);assert.equal(booking.cancelledVisits.length,2);assert.deepEqual(credits[1].creditDates,['2026-09-22','2026-09-23']);
   await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).click();await page.getByText('Checking available times…').waitFor({state:'hidden'});
   await editGrid.getByRole('button',{name:name('2026-09-22')}).click();await move.getByRole('button',{name:'Move credit',exact:true}).click();
   await move.getByLabel('Move credit to',{exact:true}).fill('2026-10-01');await move.scrollIntoViewIfNeeded();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`test-results/move-credit-${engineName}-${access}.png`});
   await move.getByRole('button',{name:'Save credit',exact:true}).click();await page.getByText('Credit moved to 2026-10-01.',{exact:true}).waitFor();
   assert.match(page.url(),/month=2026-10/);assert.equal(await grid.getByRole('button',{name:name('2026-10-01')}).getAttribute('aria-pressed'),'true');assert.equal(term.creditedDays,3);
   const add=page.getByRole('region',{name:'Add credit days',exact:true});await add.getByRole('button',{name:'Add credit days',exact:true}).click();
   await add.getByLabel('Number of credit days',{exact:true}).fill('3');assert.equal(await add.getByLabel('Include weekends',{exact:true}).isChecked(),false);
   await add.getByRole('button',{name:'Save credit',exact:true}).click();await page.getByText('Credits saved.',{exact:true}).waitFor();
   assert.deepEqual(credits.at(-1).creditDates,['2026-10-02','2026-10-05','2026-10-06']);assert.equal(term.creditedDays,6);assert.equal(lastCredit.note,'');
   await page.waitForLoadState('networkidle');role='member';await page.goto(`${origin}/schedule?month=2026-10`);await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).waitFor();
   await grid.getByRole('button',{name:name('2026-10-06')}).click();assert.equal(await page.getByRole('button',{name:'Move credit',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Add credit days',exact:true}).count(),0);
   assert.deepEqual(errors,[]);console.log(`${engineName} ${access}: legacy Sunday move, opt-in weekends, batch cancellations, editor move across months, extra credits and client visibility passed`);
  }catch(error){await page.screenshot({path:`test-results/move-credit-failure-${engineName}-${access}.png`,fullPage:true});await writeFile(`test-results/move-credit-failure-${engineName}-${access}.txt`,JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
