// Isolated fixtures and real browser gestures; never contact production APIs.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {SERVICES} from '../shared/catalog.js';
import {FIELD_STORIES} from '../shared/field-experience.js';
const app=express(),dist=path.resolve('client/dist');
app.get('/api/live',(_req,res)=>res.json({sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()}));
app.use(express.static(dist));app.get('/{*rest}',(_req,res)=>res.sendFile(path.join(dist,'bravo-shell.html')));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const clips=FIELD_STORIES.map((story,i)=>({id:story.clipId,title:['Cleo and Patrick','Confidence around distractions','Off-leash vocal direction'][i],description:['First day of school.','Beau’s first exposure visit.','Recorded training.'][i],src:'/fixture.mp4',poster:'/images/bravo-client-training.jpeg',order:i,revision:1}));
const ads=[['motion-one','Workshop ad','/workshops'],['motion-two','Hunting ad','/hunting-dog-training'],['motion-three','Training ad','/dog-training']].map(([id,title,link])=>({id,title,alt:title,link,src:'/images/training-education.webp',enabled:true}));
const browser=await chromium.launch(),checks=[],errors=[];
await mkdir('test-results',{recursive:true});
async function setup(width,role=null,reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width,height:950},hasTouch:true,isMobile:width<600,reducedMotion});
 await context.route('**/*',route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.origin!==origin||request.resourceType()==='media')return route.abort();
  if(!u.pathname.startsWith('/api/')||u.pathname==='/api/live')return route.continue();
  if(!['GET','HEAD'].includes(request.method()))assert.match(u.pathname,/telemetry/,'no app writes');
  let json={entries:{},images:{},items:[],team:[],reviews:[],clips:[],ads:[],alerts:[]};
  if(u.pathname==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:false}};
  if(u.pathname==='/api/auth/me')json={user:role?{id:'motion-fixture',name:'Fixture user',role,isPrimaryOwner:role==='owner'}:null,services:[],membership:{active:false}};
  if(u.pathname==='/api/proof-videos')json={clips,nextCursor:null};
  if(u.pathname==='/api/site-ads')json={revision:1,settings:{autoplaySeconds:3},ads};
  return route.fulfill({json});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 return {context,page};
}
async function swipe(page,x,y,dx,dy){
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let n=1;n<=8;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/8,y:y+dy*n/8}]});await page.waitForTimeout(25);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
async function position(page,selector){
 await page.locator(selector).evaluate(node=>window.scrollTo({top:node.getBoundingClientRect().top+scrollY-140,behavior:'instant'}));
 await page.waitForTimeout(550);
}
try{
 for(const width of [320,390,768,1440]){
  const {context,page}=await setup(width);
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);
   {
   await page.getByText('See training examples by goal',{exact:true}).click();
   await position(page,'#find-training');
   await page.locator('.goal-select').nth(2).click();
   assert.equal(await page.locator('.goal-result').count(),1);
   assert.equal(await page.locator('.goal-select[aria-pressed=true]').count(),1);
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.goal-select[aria-pressed=true]')).color==='rgb(16, 16, 16)',null,{timeout:2000});
   assert.equal(await page.locator('.goal-select[aria-pressed=true]').evaluate(el=>getComputedStyle(el).color),'rgb(16, 16, 16)');
   assert.equal(await page.locator('.goal-result .goal-actions .button').getAttribute('href'),'/portal?program=aggression');
   assert.equal(await page.locator('.goal-result').evaluate(el=>getComputedStyle(el).animationName),'bravo-plan-in');
   const glow=await page.locator('.goal-choice[data-selected=true]').evaluate(el=>({pointer:getComputedStyle(el,'::after').pointerEvents,shadow:getComputedStyle(el,'::after').boxShadow}));
   assert.equal(glow.pointer,'none');assert.notEqual(glow.shadow,'none');
   await page.locator('#find-training').screenshot({path:`test-results/motion-goals-${width}.png`});
   }
   assert.equal(await page.locator('.conversion-goal').filter({hasText:'Aggression'}).getAttribute('href'),'/portal?program=aggression');

 await page.getByText('Explore the stories behind these sessions', { exact: true }).click();
   await position(page,'#field-stories');await page.locator('.field-story-card').first().waitFor();
   const rail=page.locator('#field-story-rail');
   if(width<=650){
    assert.ok(await rail.evaluate(el=>el.scrollWidth>el.clientWidth));
    await page.getByRole('button',{name:'Next Field Story',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.field-story-controls')?.textContent.includes('2 of 3'));
    assert.ok(await rail.evaluate(el=>el.scrollLeft>50));
    await page.getByRole('button',{name:'Previous Field Story',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.field-story-controls')?.textContent.includes('1 of 3'));
    await position(page,'#field-story-rail');
    const box=await rail.boundingBox();await swipe(page,box.x+box.width*.72,box.y+70,-box.width*.58,0);
    await page.waitForFunction(()=>document.querySelector('#field-story-rail')?.scrollLeft>50);
    assert.equal(await page.locator('[data-story-selected=true]').count(),0,'swiping never activates a session');
    assert.equal(new URL(page.url()).pathname,'/');
    await rail.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));
    await page.waitForFunction(()=>document.querySelector('.field-story-controls')?.textContent.includes('1 of 3'));
   }else assert.equal(await page.locator('.field-story-controls').isVisible(),false);
   await page.locator('.field-story-card').first().locator('summary').click();
   assert.ok(await page.locator('.field-story-card').first().locator('details').getAttribute('open')!==null);
   await page.locator('#field-stories').screenshot({path:`test-results/motion-stories-${width}.png`});
   await page.getByRole('button',{name:'View session: Cleo and Patrick',exact:true}).focus();await page.keyboard.press('Enter');
   assert.ok(await page.locator(`[data-proof-video="${clips[0].id}"]`).evaluate(el=>el===document.activeElement));
   assert.ok(await page.locator('.proof-video-carousel video').evaluateAll(videos=>videos.every(v=>v.paused)));
   await page.evaluate(()=>document.documentElement.classList.add('access-reduced-motion'));
   await page.locator('.goal-select').first().click();
   assert.equal(await page.locator('.goal-result').evaluate(el=>getComputedStyle(el).animationName),'none');
   assert.ok(await page.locator('[data-reveal]').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).opacity==='1')));
   await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
   assert.equal(await page.locator('.goal-choice').first().evaluate(el=>getComputedStyle(el,'::after').display),'none');
   await page.goto(origin+'/hunting-dog-training');await page.locator('.hunting-goals').waitFor();
   assert.equal(await page.locator('.hunting-goals').evaluate(el=>getComputedStyle(el).opacity),'1');
   await page.getByRole('button',{name:'Recall & steadiness',exact:true}).click();
   assert.equal(await page.getByRole('link',{name:'Discuss my dog with Bravo →',exact:true}).getAttribute('href'),'/contact?interest=hunting&goal=recall');
   await page.evaluate(()=>document.documentElement.style.fontSize='200%');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
   checks.push(`${width}px: glow and contrast, single-plan fade, native story browsing, keyboard selection, reduced motion and hunting routes`);
  }catch(e){await page.screenshot({path:`test-results/motion-failure-${width}.png`,fullPage:true});await writeFile(`test-results/motion-failure-${width}.txt`,await page.locator('body').innerText());throw e;}finally{await context.close();}
 }
 for(const role of [null,'owner']){
  const {context,page}=await setup(390,role,'reduce');
  await page.goto(origin+'/contact',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.home-ad-dock').count(),0,'no ad surface intercepts touch gestures');
  await page.getByRole('button',{name:'Accessibility',exact:true}).click();
  const manage=page.getByRole('button',{name:'Manage advertisements',exact:true});
  assert.equal(await manage.count(),role?1:0);
  if(role){await manage.click();await page.getByRole('dialog',{name:'Manage advertisements',exact:true}).waitFor();await page.getByRole('button',{name:'Close ad editor',exact:true}).click();}
  checks.push(`${role||'guest'}: ad-free layout, reduced motion and authorized archive management`);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors,realApplicationWrites:0},null,2));
 await writeFile('test-results/motion-checks.json',JSON.stringify({checks,errors,realApplicationWrites:0},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
