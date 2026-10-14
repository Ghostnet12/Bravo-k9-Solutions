// Isolated browser checks: public fixtures only; no real client or payment APIs.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url));
const app=express(); app.use(express.static(dist)); app.get('/{*rest}',(_req,res)=>res.sendFile(dist+'bravo-shell.html'));
const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch(), checks=[],errors=[], requests=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin || req.resourceType()==='media')return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    let json={items:[],entries:{},images:{},ads:[],clips:[],alerts:[],team:[],reviews:[]};
    if(url.pathname==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:false}};
    if(url.pathname==='/api/auth/me')json={user:null,services:[],membership:{active:false}};
    if(url.pathname==='/api/live')json={sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()};
    if(url.pathname==='/api/site-ads')json={revision:1,settings:{autoplaySeconds:5},ads:[{id:'workshop-fixture',title:'Workshop fixture',alt:'Workshop artwork',enabled:true,link:'/workshops',src:'/images/training-education.webp'}]};
    if(url.pathname==='/api/proof-videos')json={clips:DEFAULT_PROOF_VIDEOS};
    if(url.pathname==='/api/team')json={team:[{id:'fixture-david',name:'David Northrop',title:'Lead Trainer',role:'owner',image:'/images/david-northrop.webp'},{id:'fixture-ashley',name:'Ashley Leverock',title:'Trainer',role:'staff',image:'/images/ashley-leverock.webp'}]};
    return route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/graphics/'))requests.push({path:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('.goal-result').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.locator('#find-training').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: no page overflow`);
    const icons=await page.locator('.goal-choice-link').evaluateAll(links=>links.map(link=>{const s=getComputedStyle(link,'::before');return{mask:s.maskImage,events:s.pointerEvents,content:s.content,width:parseFloat(s.width)};}));
    assert.equal(icons.length,4);for(const icon of icons){assert.match(icon.mask,/graphics/);assert.equal(icon.events,'none');assert.equal(icon.content,'""');assert.ok(icon.width>=40);}
    assert.equal(await page.locator('button.goal-choice-link').count(),4);
    assert.equal(await page.locator('.goal-choice a').count(),0,'cards select a plan rather than mixing two actions');
    await page.getByRole('button',{name:'Preview Aggression concerns',exact:true}).click();
    assert.equal(await page.locator('.goal-result .goal-actions .button').getAttribute('href'),'/portal?program=aggression');
    await page.getByRole('button',{name:'Preview Pulling, jumping & puppy manners',exact:true}).click();
    await page.locator('#method').scrollIntoViewIfNeeded();
    const signature=await page.locator('.cinema-method-signature').innerText();assert.match(signature,/Trust/);assert.match(signature,/Train/);assert.match(signature,/Deploy/);
    assert.equal(await page.locator('.cinema-method-signature > span').count(),3);
    for(const section of ['#find-training','#method','#specialist-training','#team']) {
      await page.locator(section).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${section}/${width}: no overflow`);
      if([390,1440].includes(width))await page.locator(section).screenshot({path:`test-results/graphics-${section.slice(1)}-${width}.png`});
    }
    checks.push(`${width}px: visible noninteractive icons, intact destinations, method text and no horizontal overflow`);
  }
  await page.setViewportSize({width:390,height:1000});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'enlarged text fits');
  await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
  await page.locator('.goal-choice-link').first().focus();
  assert.ok(await page.locator('.goal-choice-link').first().evaluate(el=>document.activeElement===el));
  await page.keyboard.press('Enter');assert.equal(new URL(page.url()).pathname,'/');
  await page.locator('.goal-program-link').focus();await page.keyboard.press('Enter');await page.waitForURL(origin+'/dog-training',{waitUntil:'domcontentloaded'});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('.goal-result').waitFor();
  await page.evaluate(()=>document.documentElement.classList.add('access-reduced-motion'));
  assert.ok(await page.locator('.goal-choice-link').first().evaluate(el=>parseFloat(getComputedStyle(el,'::before').transitionDuration)<=0.00001 && getComputedStyle(el,'::before').transform==='none'));
  await page.evaluate(()=>document.documentElement.classList.add('access-high-contrast'));
  assert.equal(await page.locator('.goal-choice-link').first().evaluate(el=>getComputedStyle(el,'::before').display),'none');
  assert.ok(await page.getByRole('button',{name:'Preview Aggression concerns',exact:true}).count());
  await page.evaluate(()=>document.documentElement.classList.remove('access-high-contrast','access-reduced-motion'));
  await page.emulateMedia({forcedColors:'active'});
  assert.equal(await page.locator('#method').evaluate(el=>getComputedStyle(el,'::before').display),'none');
  await page.emulateMedia({forcedColors:'none'});
  await page.locator('.home-ad-slide.is-active').getByRole('link',{name:'Workshop fixture',exact:true}).click();
  await page.waitForURL(origin+'/workshops',{waitUntil:'domcontentloaded'});
  await page.goto(origin+'/portal?program=training',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Plan my entire month',exact:true}).waitFor();
  await page.getByLabel('Dog’s name',{exact:true}).fill('Graphics regression');
  assert.equal(await page.locator('.cinema-home').count(),0,'graphics scope does not leak into booking');
  assert.equal(await page.getByLabel('Dog’s name',{exact:true}).inputValue(),'Graphics regression');
  assert.deepEqual(errors,[]);assert.ok(requests.length>=9);assert.ok(requests.every(r=>r.status===200));
  checks.push('Keyboard navigation, 200% text, reduced-motion, contrast modes, ad link and booking entry passed');
  await writeFile('test-results/graphics-checks.json',JSON.stringify({checks,errors,assetRequests:requests},null,2));
  console.log(JSON.stringify({checks,errors,assetRequests:requests.length},null,2));
  await context.close();
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}

