// Focused homepage and separate public pages; isolated fixtures, no production writes.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { DEFAULT_PROOF_VIDEOS } from '../shared/proof-videos.js';
import { HOME_SECTION_ROUTES } from '../shared/home-routes.js';
import { renderSiteContent } from '../server/content-html.js';
const dist=path.resolve('client/dist'), app=express();
const pages=['/','/training','/our-approach','/team','/results','/reviews'];
const team=[{id:'trainer',name:'David Northrop',role:'owner',title:'Lead Trainer',bio:'Fixture profile',image:'/images/david-northrop.webp'}];
app.get('/api/{*rest}',(req,res)=>{
 const fixtures={
  '/api/config':{connected:true,services:SERVICES},'/api/auth/me':{user:null,services:[]},
  '/api/live':{sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()},
  '/api/team':{team},'/api/team/schedules':{schedules:[]},'/api/site-images':{images:{}},'/api/site-content':{entries:{}},
  '/api/reviews':{reviews:[],recommendations:DEFAULT_REVIEWS,count:0,average:0},'/api/proof-videos':{clips:DEFAULT_PROOF_VIDEOS,nextCursor:null},
  '/api/lessons':{lessons:[]},'/api/hero-photos':{photos:[]},'/api/hero-videos':{clips:[]},
 };res.json(fixtures[req.path]||{});
});
app.post('/api/{*rest}',(req,res)=>{assert.match(req.path,/telemetry/);res.json({ok:true});});
for(const route of pages)app.get(route,async(_req,res)=>res.type('html').send(renderSiteContent(await readFile(path.join(dist,route==='/'?'bravo-shell.html':`${route.slice(1)}.html`),'utf8'),{},undefined,SERVICES,DEFAULT_REVIEWS)));
app.use(express.static(dist,{extensions:['html']}));app.get('/{*rest}',(_req,res)=>res.sendFile(path.join(dist,'bravo-shell.html')));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try{
 for(const name of (process.env.BRAVO_BROWSER_ENGINES||'chromium,webkit').split(',')){
  const browser=await({chromium,webkit}[name]).launch();
  try{
   const rawContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),raw=await rawContext.newPage();
   for(const route of pages){await raw.goto(origin+route);assert.equal(await raw.locator('h1').count(),1);assert.equal(await raw.locator('link[rel=canonical]').getAttribute('href'),`https://bravounleashed.com${route}`);assert.ok((await raw.locator('main').innerText()).length>150);}
   await rawContext.close();
   for(const width of [390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
    await page.goto(origin);await page.locator('.bravo-hub').waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('#method,#team,#reviews,#training-programs').count(),0,'detail sections are no longer mounted on home');
    const cta=await page.locator('.polish-hero-actions .conversion-button').boundingBox();assert.ok(cta.y>0&&cta.y+cta.height<900);
    for(const route of pages.slice(1))assert.ok(await page.locator(`main a[href="${route}"]`).count()>0,`${route} discoverable from home`);
    for(const selector of ['#explore-bravo','.hub-results','.hub-team','.hub-transport','.hub-close']){await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForFunction(s=>getComputedStyle(document.querySelector(s)).opacity==='1',selector);}
    const height=await page.locator('main').evaluate(e=>e.offsetHeight);assert.ok(height<4400,`home content remains focused: ${height}px`);
    await page.screenshot({path:`test-results/focused-home-${name}-${width}.png`,fullPage:true});
    await page.locator('main a[href="/our-approach"]').click();await page.getByRole('tab',{name:'Trust.',exact:true}).waitFor();
    for(const tabName of ['Train.','Deploy.','Trust.']){await page.getByRole('tab',{name:tabName,exact:true}).click();assert.equal(await page.getByRole('tabpanel').count(),1);}
    await page.goto(origin+'/team');await page.getByRole('heading',{name:'David Northrop',exact:true}).waitFor();
    await page.goto(origin+'/reviews');await page.locator('.facebook-recommendations article').first().waitFor();await page.locator('.facebook-recommendations article').first().getByText('Read full review',{exact:true}).click();assert.ok(await page.locator('.review-full blockquote').first().isVisible());
    await page.goto(origin+'/training');await page.locator('.conversion-goal').first().waitFor();assert.match(await page.locator('.conversion-offer').innerText(),/\$200/);await page.getByText('See training examples by goal',{exact:true}).click();await page.locator('#find-training').waitFor();
    for(const route of pages){await page.goto(origin+route);await page.locator('.bravo-redesign').waitFor();assert.equal(await page.locator('h1').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} ${width}: no overflow`);}
    await page.locator('.mobile-home-nav').getByRole('link',{name:'Reviews',exact:true}).click();await page.waitForURL('**/reviews');
    if(width===390)for(const hash of ['#training','#training-programs','#method','#team','#reviews','#results','#dogs']){await page.goto(origin+'/'+hash);await page.waitForURL(origin+HOME_SECTION_ROUTES[hash]);await page.locator('h1').waitFor();assert.ok(await page.locator('h1').isVisible());}
    await page.goto(origin);await page.locator('.bravo-hub').waitFor();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.bravo-hub').dataset.motion==='off');assert.equal(await page.locator('#home-title em').evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.addScriptTag({path:path.resolve('node_modules/axe-core/axe.min.js')});const audit=await page.evaluate(async()=>await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
    assert.deepEqual(errors,[]);console.log(`PASS ${name} ${width}: focused home ${height}px; five public pages, links, old bookmarks, tabs, reviews, reduced motion and accessibility`);await context.close();
   }
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
