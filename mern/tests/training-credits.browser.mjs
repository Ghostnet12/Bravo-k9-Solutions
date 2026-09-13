import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
const dist = new URL('../client/dist/', import.meta.url).pathname, html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req,res) => res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const clientId='cccccccccccccccccccccccc',ownerId='aaaaaaaaaaaaaaaaaaaaaaaa',staffId='bbbbbbbbbbbbbbbbbbbbbbbb',bookingId='dddddddddddddddddddddddd';
const now=DateTime.now().setZone('America/Chicago'),today=now.toISODate(),team=[{_id:ownerId,id:ownerId,name:'Owner fixture',role:'owner'},{_id:staffId,id:staffId,name:'Trainer fixture',role:'staff'}];
await mkdir('test-results',{recursive:true});
try {
  for(const [engineName,engine] of Object.entries({chromium,webkit})){
    if(process.env.BRAVO_BROWSER_ENGINES&&!process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName))continue;
    const browser=await engine.launch(process.env.BRAVO_BROWSER_EXECUTABLE?{executablePath:process.env.BRAVO_BROWSER_EXECUTABLE,args:['--no-sandbox']} : {});
    try { for(const role of ['owner','administrator','staff','member']) for(const width of [320,390,1440]){
      const ctx=await browser.newContext({viewport:{width,height:900},isMobile:width<700}),page=await ctx.newPage();page.setDefaultTimeout(8000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      const user={id:role==='member'?clientId:role==='staff'?staffId:ownerId,name:role,role:role==='administrator'?'owner':role,isPrimaryOwner:role==='owner'};
      let end=now.plus({days:6}).toJSDate().toISOString(),credits=[],savedBody,postCount=0;
      const term=()=>({stripeId:'manual:browser',serviceIds:['training'],dogCount:1,status:'active',source:'manual',autoPayDisabled:true,validFrom:now.minus({days:24}).toJSDate().toISOString(),validUntil:end});
      const booking=()=>({_id:bookingId,dogName:'Fixture dog',dogCount:1,staffId,staffIds:[staffId],visits:[],updatedAt:now.toJSDate().toISOString(),termStartsAt:term().validFrom,termEndsAt:end});
      await page.route('**/api/**',async route=>{
        const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let json={};
        if(path==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES,schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00']}};
        else if(path==='/api/auth/me')json={user,services:['training'],membership:{active:true},subscriptions:[term()]};
        else if(path==='/api/notifications')json={items:[]};
        else if(path==='/api/site-images')json={images:{}};
        else if(path==='/api/client-schedule')json={client:{id:clientId,name:'Synthetic Client'},month:now.toFormat('yyyy-MM'),visits:[],terms:[term()],trainingBookings:[booking()]};
        else if(path==='/api/training-credits')json={terms:[term()],credits,today,canCredit:role!=='member'};
        else if(path==='/api/admin/training-credits/clients')json={clients:[{_id:clientId,name:'Synthetic Client',dogName:'Fixture dog'}]};
        else if(path==='/api/admin/training-credits'&&method==='POST'){
          assert.notEqual(role,'member');postCount++;savedBody=route.request().postDataJSON();assert.equal(savedBody.days,1);assert.equal(savedBody.reason,'snow');assert.equal(savedBody.cancelVisits,true);assert.equal(savedBody.clientId,clientId);assert.match(savedBody.requestKey,/^[a-f0-9-]{36}$/);
          const previousEnd=end;end=DateTime.fromISO(end).setZone('America/Chicago').plus({days:1}).toJSDate().toISOString();
          credits=[{id:'credit-browser',days:1,reason:'Snow / ice',missedDate:today,newEnd:end,previousEnd,actorName:role,createdAt:now.toJSDate().toISOString(),note:savedBody.note,cancelledVisits:[]}];json={ok:true,credit:credits[0],message:'1 day credited. Client notified. No charge made.'};
        } else if(path==='/api/admin')json={role:user.role,team,bookings:[],inbox:[],blocks:[],settings:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00'],overrides:[]}};
        else if(path.startsWith('/api/admin/trainer-schedules/'))json={schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['10:00'],overrides:[],revision:0},today,maxDate:now.plus({days:92}).toISODate(),team:{enabled:true},inherited:false};
        else if(path==='/api/admin/reviews')json={reviews:[]};else if(path==='/api/admin/services')json={services:SERVICES};else if(path==='/api/trainers')json={trainers:team};else if(path==='/api/team')json={team};else if(path==='/api/admin/users')json={users:[]};
        await route.fulfill({json});
      });
      try {
        await page.goto(`${origin}/schedule?month=${now.toFormat('yyyy-MM')}${role==='member'?'':`&client=${clientId}`}`);
        await page.getByText(role==='member'?'Training day credits':'Credit training days',{exact:true}).click();
        if(role==='member'){
          await page.getByText('No day credits yet.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save day credit & notify client',exact:true}).count(),0);assert.equal(postCount,0);
        }else{
          await page.getByLabel('Reason',{exact:true}).selectOption('snow');await page.getByLabel('Note to the client (optional)',{exact:true}).fill('Weather make-up');
          assert.match(await page.locator('.day-credit-preview').innerText(),/6 → 7/);
          await page.getByRole('button',{name:'Save day credit & notify client',exact:true}).click();
          await page.locator('.day-credit-history').waitFor();assert.equal(postCount,1);assert.equal(savedBody.missedDate,today);
          assert.equal(await page.getByRole('button',{name:'Save day credit & notify client',exact:true}).isDisabled(),true);
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'schedule overflow');assert.deepEqual(errors,[]);
        await page.screenshot({path:`test-results/credit-${engineName}-${role}-${width}.png`,fullPage:true});
        if(role!=='member'){
          await page.goto(`${origin}/admin?tab=schedule`);await page.getByText('Credit client days',{exact:true}).click();
          await page.getByLabel('Client to credit',{exact:true}).selectOption(clientId);await page.getByLabel('Days to credit',{exact:true}).waitFor();
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'staff desk overflow');assert.deepEqual(errors,[]);
        }
        console.log(`${engineName} ${role} ${width}: credit controls, preview, duplicate block, history and layout passed`);
      }catch(e){await page.screenshot({path:`test-results/credit-failure-${engineName}-${role}-${width}.png`,fullPage:true});console.log(await page.locator('body').innerText());throw e}finally{await ctx.close()}
    }}finally{await browser.close()}
  }
}finally{server.close()}
