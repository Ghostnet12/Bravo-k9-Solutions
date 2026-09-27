import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {SERVICES} from '../shared/catalog.js';
import {CONTENT_KEYS} from '../shared/site-content-keys.js';
import {renderSiteContent} from '../server/content-html.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try{for(const [engineName,engine] of Object.entries({chromium,webkit})){
 if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(engineName))continue;
 const browser=await engine.launch();try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  let role='owner',entries={},catalog=SERVICES.map(row=>({...row,enabled:row.id!=='online',revision:0})),failPrice=false,failConfig=false;
  const team=[{id:'111111111111111111111111',name:'David Northrop',title:'Owner & Lead Trainer',role:'owner',profileKey:'david',imageKey:'team-david-northrop',image:'/images/david-northrop.webp',revision:0,bio:'David fixture introduction.'},{id:'222222222222222222222222',name:'Ashley Leverock',title:'Trainer / Pit Bull Specialist',role:'staff',profileKey:'ashley',imageKey:'team-ashley-northrop',image:'/images/ashley-northrop.webp',revision:0,bio:'Ashley fixture introduction.'}];
  const workshop={title:'Workshop fixture',date:'2026-10-03',time:'10 am',location:'Aberdeen',duration:'One hour',cents:10000,description:'Workshop details fixture.',published:true,revision:0};
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   let json={services:[],team:[],reviews:[],images:{},clips:[],schedules:[],alerts:[],revision:0},status=200;
   if(path==='/api/auth/me')json={user:role?{id:team[0].id,name:'Fixture',role,isPrimaryOwner:width===390}:null,services:[]};
   if(path==='/api/config'){json={connected:true,paymentsReady:false,services:catalog,lessonLibrary:{open:false,lessonCents:7500,bundleCents:25000}};if(failConfig){status=503;json={error:'Temporary outage fixture'};}}
   if(path==='/api/team')json={team};
   if(path==='/api/admin/services')json={services:catalog};
   if(path.startsWith('/api/admin/services/')){
    if(failPrice){status=409;json={error:'This program changed. Reopen the editor before publishing.'};}
    else{const id=path.split('/').at(-1),body=request.postDataJSON(),old=catalog.find(row=>row.id===id);assert.equal(body.expectedRevision,old.revision);const {expectedRevision,...fields}=body;Object.assign(old,fields,{revision:expectedRevision+1});json={service:old};}
   }
   if(path.startsWith('/api/admin/team/')){const id=path.split('/').at(-1),body=request.postDataJSON(),old=team.find(row=>row.id===id);assert.equal(body.expectedRevision,old.revision);Object.assign(old,{name:body.name,title:body.title,bio:body.bio,revision:old.revision+1});json={person:old};}
   if(path==='/api/site-content')json={entries};
   const publish=item=>{assert.ok(CONTENT_KEYS[item.key]);const old=entries[item.key]||{revision:0,value:{}};assert.equal(item.expectedRevision,old.revision);entries[item.key]={value:item.value,revision:old.revision+1,canUndo:true,previous:old.value};return entries[item.key];};
   if(path==='/api/site-content/batch'){for(const item of request.postDataJSON().changes)publish(item);json={entries};}
   else if(path.startsWith('/api/site-content/')){const key=path.split('/').at(-1);json={entry:publish({key,...request.postDataJSON()})};}
   if(path==='/api/workshops')json={event:workshop};
   if(path==='/api/trainers')json={trainers:team};
   if(path.startsWith('/api/site-images/background-')){
    if(request.method()==='PUT'){const key=path.split('/').at(-1);json={image:{src:`/api/site-images/${key}/image?v=1`,revision:1,framed:true}};}
    else return route.fulfill({path:`${dist}/images/bravo-client-training.jpeg`,contentType:'image/jpeg'});
   }
   await route.fulfill({status,json});
  });
  const hold=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();await page.mouse.move(box.x+Math.min(24,box.width/2),box.y+Math.min(12,box.height/2));await page.mouse.down();await page.waitForTimeout(780);await page.mouse.up();};
  const content=page.getByRole('dialog',{name:'Edit website section',exact:true});
  try{
   await page.goto(origin);await page.waitForLoadState('networkidle');
   assert.equal(await page.locator('.home-status-banner').evaluate(el=>el.previousElementSibling.classList.contains('home-hero')),true);
   await hold(page.locator('#goal-tab-manners'));await content.waitFor();
   await content.getByLabel('Text',{exact:true}).fill('Everyday confidence');
   await content.getByLabel('Edit this part').selectOption('goal-manners-choice');
   await content.getByLabel('Link address').fill('/portal?program=training&focus=puppy-foundations');
   await content.getByRole('button',{name:'Publish website changes',exact:true}).click();await content.waitFor({state:'hidden'});
   assert.equal(entries['goal-manners-label'].value.text,'Everyday confidence');assert.match(entries['goal-manners-choice'].value.link,/puppy-foundations/);assert.equal(new URL(page.url()).pathname,'/','holding never follows the card');
   await hold(page.locator('#goal-price-manners [data-site-price]'));const pricing=page.getByRole('dialog',{name:'Edit program and pricing'});await pricing.waitFor();
   await pricing.getByLabel('Monthly price (USD)').fill('225');await pricing.getByLabel('Each additional dog / month (USD)').fill('125');
   failPrice=true;await pricing.getByRole('button',{name:'Publish program & prices'}).click();await pricing.getByRole('alert').waitFor();assert.equal(await pricing.getByLabel('Monthly price (USD)').inputValue(),'225');
   failPrice=false;await pricing.getByRole('button',{name:'Publish program & prices'}).click();await pricing.waitFor({state:'hidden'});
   assert.match(await page.locator('#goal-price-manners').innerText(),/\$225/);assert.match(await page.locator('#goal-price-specialist').innerText(),/\$225/);assert.match(await page.locator('#goal-price-walks').innerText(),/\$25/);
   const ashley=page.locator('[data-site-trainer="222222222222222222222222"]'),photoKey=await ashley.locator('img').getAttribute('data-site-image-key');
   await hold(ashley.locator('h3'));const trainer=page.getByRole('dialog',{name:'Edit trainer profile'});await trainer.waitFor();
   await trainer.getByLabel('Public name',{exact:true}).fill('Ashley Example');await trainer.getByLabel('Public title',{exact:true}).fill('Bravo trainer');await trainer.getByLabel('Introduction',{exact:true}).fill('Updated Ashley biography.');
   await trainer.getByRole('button',{name:'Publish trainer profile'}).click();await trainer.waitFor({state:'hidden'});assert.equal(await ashley.locator('h3').innerText(),'Ashley Example');assert.equal(await ashley.locator('img').getAttribute('data-site-image-key'),photoKey);
   await ashley.locator('summary').first().click();assert.match(await ashley.innerText(),/Updated Ashley biography/);
   await page.reload();await page.waitForLoadState('networkidle');assert.equal(await ashley.locator('h3').innerText(),'Ashley Example');assert.match(await page.locator('#goal-price-manners').innerText(),/\$225/);
   await hold(ashley.locator('h3'));await trainer.waitFor();await trainer.getByRole('button',{name:'Colors & layout'}).click();await content.waitFor();assert.equal(await content.getByLabel('Edit this part').inputValue(),'trainer-ashley-card');await content.getByRole('button',{name:'Cancel',exact:true}).click();
   await hold(page.locator('#method .cinema-eyebrow'));await content.waitFor();await content.getByLabel('Edit this part').selectOption('copy-home-9');await content.getByLabel('Background',{exact:true}).selectOption('image');await content.getByLabel('Background photo',{exact:true}).setInputFiles(`${dist}/images/bravo-client-training.jpeg`);
   await page.waitForFunction(()=>document.querySelector('.content-background-preview')?.getAttribute('src')?.includes('/api/site-images/background-'));
   await content.getByRole('button',{name:'Publish website changes',exact:true}).click();await content.waitFor({state:'hidden'});assert.ok(entries['copy-home-9'].value.backgroundImage.startsWith('/api/site-images/background-'));
   await hold(page.locator('.goal-consult img'));const media=page.getByRole('dialog',{name:'Edit program media',exact:true});await media.waitFor();await media.getByRole('button',{name:'Close program media'}).click();
   await hold(page.locator('.workshop-details h3'));await page.getByRole('dialog',{name:'Edit workshop',exact:true}).waitFor();await page.getByRole('dialog',{name:'Edit workshop',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
   await page.screenshot({path:`test-results/website-editor-${engineName}-${width}.png`});
   // Ordinary scrolling cancels a hold; the next tap must still navigate.
   await page.locator('#goal-tab-manners').scrollIntoViewIfNeeded();const box=await page.locator('#goal-tab-manners').boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+45,box.y+40);await page.waitForTimeout(750);await page.mouse.up();assert.equal(await page.locator('dialog[open]').count(),0);
   role=null;await page.reload();await page.waitForLoadState('networkidle');await page.locator('.goal-choice-link').first().click();await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).waitFor();await page.getByLabel('Number of dogs',{exact:true}).fill('2');assert.match(await page.locator('.price-total').innerText(),/\$350/);assert.equal(new URL(page.url()).searchParams.get('focus'),'puppy-foundations');
   for(const outsider of [null,'member','staff']){role=outsider;await page.goto(origin);await page.waitForLoadState('networkidle');await hold(page.locator('#goal-price-manners'));assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.getByRole('button',{name:'Edit page text & design'}).count(),0);}
   role=null;failConfig=true;
   await page.route(`${origin}/?config-failure`,route=>route.fulfill({contentType:'text/html',body:renderSiteContent(html,{},undefined,catalog)}));
   await page.goto(`${origin}/?config-failure`);await page.waitForLoadState('networkidle');assert.match(await page.locator('#goal-price-manners').innerText(),/\$225/,'failed API refresh retains server-published prices');
   assert.deepEqual(errors,[]);console.log(`PASS ${engineName}/${width}: all-part publication, price sync, trainer identity, backgrounds, media/workshop holds, scrolling, navigation and permissions`);
  }catch(error){await page.screenshot({path:`test-results/website-editor-failure-${engineName}-${width}.png`,fullPage:true});await writeFile(`test-results/website-editor-failure-${engineName}-${width}.json`,JSON.stringify({error:error.message,errors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
