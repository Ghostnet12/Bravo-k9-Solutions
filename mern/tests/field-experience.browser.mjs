// Isolated public fixtures. No production accounts, bookings, uploads or payments.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { FIELD_STORIES } from '../shared/field-experience.js';
const app=express(),dist=path.resolve('client/dist');app.use(express.static(dist));app.get('/{*rest}',(_req,res)=>res.sendFile(path.join(dist,'bravo-shell.html')));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(), errors=[], checks=[];
const fixtures=[
 {id:FIELD_STORIES[0].clipId,title:'Cleo and Patrick',description:'First day of school.',src:'/fixture.mp4',poster:'/images/bravo-client-training.jpeg',order:1,revision:1},
 {id:FIELD_STORIES[1].clipId,title:'Confidence around distractions',description:'Beau’s first exposure visit.',facebookUrl:'https://www.facebook.com/reel/1079472767813329/',poster:'/images/bravo-client-training.jpeg',order:2,revision:1},
 {id:FIELD_STORIES[2].clipId,title:'Off-leash vocal direction',description:'Recorded training.',src:'/fixture.mp4',poster:'/images/bravo-client-training.jpeg',order:3,revision:1},
];
try {for(const width of [320,390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',hasTouch:width<600});let removed=false;
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin||req.resourceType()==='media')return route.abort();
  if(!u.pathname.startsWith('/api/'))return route.continue();
  assert.ok(['GET','HEAD'].includes(req.method())||u.pathname.includes('telemetry'),'no app writes');
  let json={entries:{},images:{},items:[],team:[],reviews:[],clips:[],ads:[],alerts:[]};
  if(u.pathname==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:false}};
  if(u.pathname==='/api/auth/me')json={user:null,services:[],membership:{active:false}};
  if(u.pathname==='/api/live')json={sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()};
  if(u.pathname==='/api/proof-videos')json={clips:removed?[]:fixtures,nextCursor:null};
  if(u.pathname==='/api/site-ads')json={revision:1,settings:{autoplaySeconds:5},ads:[{id:'ad-2b5c8355-930e-40dc-b036-4c99a92cf18c',title:'Gunner',alt:'Gunner hunting training',src:'/api/site-ads/ad-2b5c8355-930e-40dc-b036-4c99a92cf18c/image?v=1',link:'/hunting-dog-training',enabled:true}]};
  if(u.pathname.includes('/api/site-ads/')&&u.pathname.endsWith('/image'))return route.fulfill({path:path.join(dist,'images/training-education.webp'),contentType:'image/webp'});
  return route.fulfill({json});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.locator('.field-story-image img').first().waitFor({state:'attached'});
 if(width===390)assert.equal(await page.locator('.field-story-image img').first().getAttribute('src'),null,'below-fold story posters wait until nearby');
 if(width>700){
 await page.getByText('See training examples by goal',{exact:true}).click();
 await page.locator('.goal-select').first().waitFor();
 assert.equal(await page.locator('.goal-choice').count(),3);assert.equal(await page.locator('.goal-choice a').count(),0);assert.equal(await page.locator('.goal-choice button').count(),3);
 const ids=['manners','handling','specialist'];const details=['/dog-training','/behavior-assessment','/#specialist-training'];
 for(let i=0;i<ids.length;i++){
  const button=page.locator('.goal-select').nth(i);await button.click();assert.equal(new URL(page.url()).pathname,'/');assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.goal-program-link').getAttribute('href'),details[i]);
  assert.equal(await page.locator('.goal-select[aria-pressed=true]').count(),1);
 }
 await page.locator('.goal-select').first().focus();await page.keyboard.press('Space');assert.equal(await page.locator('.goal-select').first().getAttribute('aria-pressed'),'true');assert.equal(new URL(page.url()).pathname,'/');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'homepage fit');
 await page.locator('#find-training').screenshot({path:`test-results/field-goals-${width}.png`});
 }else{
 assert.equal(await page.locator('.conversion-goal').count(),4);
 assert.equal(await page.locator('.goal-finder').isVisible(),false);
 assert.equal(await page.locator('.conversion-goal').filter({hasText:'Aggression'}).getAttribute('href'),'/portal?program=aggression');
 }
 await page.getByText('Explore the stories behind these sessions', { exact: true }).click();
 assert.equal(await page.locator('.field-story-card').count(),3);
 await page.locator('.field-story-card').first().locator('summary').click();assert.ok(await page.locator('.field-story-card').first().locator('details').getAttribute('open')!==null);
 await page.waitForFunction(()=>{const image=document.querySelector('.field-story-image img');return image?.complete&&image.naturalWidth>0;});
 await page.locator('.field-stories').screenshot({path:`test-results/field-stories-${width}.png`});
 for(let repeat=0;repeat<2;repeat++){
  await page.getByRole('button',{name:'View session: Cleo and Patrick',exact:true}).click();
  const clip=page.locator(`[data-proof-video="${fixtures[0].id}"]`);assert.equal(await clip.getAttribute('data-story-selected'),'true');assert.ok(await clip.evaluate(el=>document.activeElement===el));
  assert.ok(await page.locator('.proof-video-carousel video').evaluateAll(videos=>videos.every(v=>v.paused)),'selection does not autoplay');
 }
 await page.getByRole('button',{name:'View session: Confidence around distractions',exact:true}).click();assert.equal(await page.locator('[data-story-selected=true] a').first().getAttribute('href'),fixtures[1].facebookUrl);
 await page.goto(origin+'/hunting-dog-training');await page.getByRole('heading',{name:'Drive meets direction.',exact:true}).waitFor();await page.locator('.hunting-hero-media.has-artwork').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'hunting fit');assert.ok(!(await page.locator('main').innerText()).includes('$200'));
 await page.getByRole('button',{name:'Recall & steadiness',exact:true}).click();await page.getByRole('link',{name:'Discuss my dog with Bravo →',exact:true}).click();await page.waitForURL(origin+'/contact?interest=hunting&goal=recall');
 await page.getByRole('heading',{name:'You’re asking about hunting training.',exact:true}).waitFor();assert.match(await page.locator('.contact-interest').innerText(),/Recall & steadiness/);
 await page.getByRole('link',{name:'Clear selected interest',exact:true}).click();await page.waitForURL(origin+'/contact');await page.locator('.contact-interest').waitFor({state:'detached'});assert.equal(await page.locator('.contact-interest').count(),0);
 await page.goto(origin+'/hunting-dog-training');await page.locator('.hunting-goals').waitFor();await page.screenshot({path:`test-results/hunting-page-${width}.png`,fullPage:true});
 removed=true;await page.goto(origin);await page.locator('.home-work-proof').waitFor();await page.waitForFunction(()=>document.querySelector('.home-work-proof')?.textContent.includes('No training videos published yet.'));assert.equal(await page.locator('.field-story-card').count(),0);
 if(width===390){await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'200 percent text fit');}
 checks.push(`${width}px: one-action goals, preserved program paths, story details/focus/reselection, no autoplay, hunting inquiry/clear, removed-story safety and responsive fit`);
 }catch(error){await page.screenshot({path:`test-results/field-failure-${width}.png`,fullPage:true});await writeFile(`test-results/field-failure-${width}.txt`,await page.locator('body').innerText());throw error;}finally{await context.close();}
}
assert.deepEqual(errors,[]);await writeFile('test-results/field-checks.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
