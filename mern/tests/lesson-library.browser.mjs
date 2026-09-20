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
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:true}),page=await context.newPage(),errors=[];
 let actor=null,paid=false,library={open:false,revision:0,lessonCents:7500,bundleCents:25000},sections=[],lessons=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname,method=route.request().method();let json={services:[],images:{},entries:{},team:[],schedules:[],reviews:[],count:0,clips:[],bookings:[],terms:[],messages:[],notifications:[],alerts:[],revision:0};
  if(path==='/api/config')json={connected:true,paymentsReady:false,lessonLibrary:library,services:SERVICES.map(s=>({...s,enabled:s.id!=='online'||library.open})),schedule:{enabled:true,weekdays:[1,2,3,4,5],hours:['09:00']}};
  if(path==='/api/auth/me')json={user:actor?{id:'fixture',name:'Fixture',role:actor,isPrimaryOwner:false}:null,services:paid?['online']:[],membership:{active:paid,onlineAccess:paid},subscriptions:[]};
  if(path==='/api/site-banner')json={alerts:[],settings:{motion:'never'},revision:0};
  if(path==='/api/admin')json={role:actor,team:[],bookings:[],blocks:[],inbox:[],settings:{enabled:true,weekdays:[],hours:[]}};
  if(path==='/api/admin/services')json={services:SERVICES};
  if(path==='/api/admin/lesson-library'){if(method==='PUT'){const body=route.request().postDataJSON();assert.equal(body.expectedRevision,library.revision);library={...library,open:body.open,revision:library.revision+1};}json={library,sections,pendingCheckouts:0};}
  if(path==='/api/admin/lesson-sections'&&method==='POST'){const section={...route.request().postDataJSON(),_id:'section-one'};sections.push(section);json={section};}
  if(path==='/api/admin/lessons')json={lessons};
  if(path.startsWith('/api/admin/lessons/')&&method==='PUT'){const lesson={...route.request().postDataJSON(),_id:path.split('/').at(-1),media:{}};lessons=lessons.filter(l=>l._id!==lesson._id).concat(lesson);json={lesson};}
  if(path==='/api/lessons')json={lessons:lessons.filter(l=>actor==='owner'||l.published),sections};
  if(path.endsWith('/transcript'))json={transcript:'Look for relaxed posture. Give your dog space.'};
  if(path==='/api/trainers')json={trainers:[{id:'111111111111111111111111',name:'David Northrop',spotsRemaining:4,full:false,limit:5}]};
  await route.fulfill({json});
 });
 try{
  await page.goto(origin);await page.waitForLoadState('networkidle');assert.equal(await page.locator('a[href="/learn"]').count(),0);assert.equal(await page.locator('.lesson-offers').count(),0);
  await page.goto(origin+'/learn');await page.getByRole('heading',{name:'This page is unavailable.',exact:true}).waitFor();
  await page.goto(origin+'/portal?program=training&lessons=1');await page.getByRole('heading',{name:'This option is unavailable.',exact:true}).waitFor();
  actor='owner';await page.goto(origin+'/admin?tab=lessons');await page.getByRole('heading',{name:'Lesson studio.',exact:true}).waitFor();
  assert.equal(await page.getByRole('switch',{name:'Library closed',exact:true}).isChecked(),false);
  await page.getByRole('button',{name:'Add section',exact:true}).click();await page.getByLabel('Section name',{exact:true}).fill('Everyday foundations');await page.getByLabel('Section description',{exact:true}).fill('Understand your dog.');await page.getByRole('button',{name:'Save section',exact:true}).click();await page.getByText('Section saved.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'New lesson',exact:true}).click();await page.getByLabel('Lesson ID',{exact:true}).fill('body-language');await page.getByLabel('Title',{exact:true}).fill('Read your dog');await page.getByLabel('Instructor',{exact:true}).selectOption('David and Ashley');await page.getByLabel('Section',{exact:true}).selectOption('section-one');await page.getByLabel('Lesson format',{exact:true}).selectOption('text');await page.getByLabel('Lesson description',{exact:true}).fill('Learn the signals.');await page.getByLabel('Lesson instructions',{exact:true}).fill('Look for relaxed posture. Give your dog space.');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved. You can now upload its private media.',{exact:true}).waitFor();
  assert.equal(lessons[0].instructor,'David and Ashley');assert.equal(lessons[0].sectionId,'section-one');assert.equal(lessons[0].description,'Learn the signals.');
  for(const instructor of ['David Northrop','Ashley Northrop','David and Ashley'])await page.getByLabel('Instructor',{exact:true}).selectOption(instructor);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved. You can now upload its private media.',{exact:true}).waitFor();
  await page.getByLabel('Lesson format',{exact:true}).selectOption('video');await page.getByLabel('Lesson video',{exact:true}).waitFor({state:'attached'});await page.getByLabel('English captions (.vtt)',{exact:true}).waitFor({state:'attached'});assert.equal(await page.getByRole('button',{name:'Publish lesson',exact:true}).isEnabled(),false);
  await page.getByLabel('Lesson format',{exact:true}).selectOption('photo');await page.getByLabel('Lesson photo',{exact:true}).waitFor({state:'attached'});assert.equal(await page.getByLabel('Photo description (alternative text)',{exact:true}).isVisible(),true);await page.getByLabel('Thumbnail / cover photo',{exact:true}).waitFor({state:'attached'});
  await page.getByLabel('Lesson format',{exact:true}).selectOption('text');await page.getByRole('button',{name:'Publish lesson',exact:true}).click();await page.getByText('Lesson published. Clients can see it only while the library is open.',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'studio fits viewport');await page.screenshot({path:`test-results/lesson-studio-${engineName}-${width}.png`,fullPage:true});
  await page.getByRole('switch',{name:'Library closed',exact:true}).check();await page.getByText('Library open. Clients can browse and purchase access.',{exact:true}).waitFor();assert.equal(library.open,true);
  actor=null;await page.goto(origin+'/learn');await page.getByRole('heading',{name:'Read your dog',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open lesson',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Choose lessons',exact:true}).isVisible(),true);assert.equal(await page.getByRole('link',{name:'Choose the bundle',exact:true}).isVisible(),true);assert.match(await page.locator('.lesson-offers').innerText(),/\$75/);assert.match(await page.locator('.lesson-offers').innerText(),/\$250/);
  await page.getByRole('link',{name:'Choose the bundle',exact:true}).click();await page.getByRole('heading',{name:'Let’s start with your dog.',exact:true}).waitFor();assert.match(await page.locator('.price-total').innerText(),/\$250/);await page.getByLabel('Number of dogs',{exact:true}).fill('2');assert.match(await page.locator('.price-total').innerText(),/\$350/);
  actor='member';paid=true;await page.goto(origin+'/learn');await page.getByRole('button',{name:'Open lesson',exact:true}).click();await page.getByText('Look for relaxed posture. Give your dog space.',{exact:true}).waitFor();assert.equal(await page.locator('.lesson-offers').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'member library fits viewport');await page.screenshot({path:`test-results/lesson-library-${engineName}-${width}.png`,fullPage:true});
  library={...library,open:false,revision:library.revision+1};await page.reload();await page.getByRole('heading',{name:'This page is unavailable.',exact:true}).waitFor();assert.equal(await page.locator('.lesson-offers').count(),0);
  actor='owner';await page.reload();await page.getByRole('button',{name:'Open lesson',exact:true}).click();await page.getByText('Look for relaxed posture. Give your dog space.',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Choose the bundle',exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log(`PASS ${engineName}/${width}: private studio, sections, formats, instructors, public offers, bundle pricing, member reading and closed access`);
 }catch(error){console.log('Layout diagnostics',await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,classes:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).slice(-20)})));await page.screenshot({path:`test-results/lesson-failure-${engineName}-${width}.png`,fullPage:true});await writeFile(`test-results/lesson-failure-${engineName}-${width}.json`,JSON.stringify({error:error.message,errors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();}
 }}finally{await browser.close();}}}finally{server.close();}
