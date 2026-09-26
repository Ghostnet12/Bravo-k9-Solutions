import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)), html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const fixture=fileURLToPath(new URL('../client/public/images/training-education.webp',import.meta.url));
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try{
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch();
  try{
   const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
   let role='owner', collection={revision:0,settings:{autoplaySeconds:3},ads:[
    {id:'saturday-workshop-october-3',title:'Saturday Dog Training Workshop',alt:'Workshop banner',link:'/contact',enabled:true,src:'/images/saturday-workshop-october-3.webp'},
    {id:'fixture-second',title:'Second promotion',alt:'Second promotion',link:'/contact',enabled:true,src:'/images/training-education.webp'}
   ]};
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let json={services:[],team:[],images:{},reviews:[],schedules:[],clips:[],count:0},status=200;
    if(path==='/api/auth/me')json={user:role?{id:'fixture',role,name:'Fixture'}:null,services:[]};
    else if(path==='/api/site-ads'){
      if(method==='POST'){const body=route.request().postDataJSON();assert.equal(body.expectedRevision,collection.revision);assert.ok(body.image?.data);collection={...collection,revision:collection.revision+1,ads:[...collection.ads,{id:'added-ad',title:body.title,alt:body.alt,link:body.link,enabled:true,src:'/images/saturday-workshop-october-3.webp'}]};json=collection;}
      else if(method==='PUT'){const body=route.request().postDataJSON();collection={...collection,revision:collection.revision+1,settings:body.settings,ads:body.ids.map(id=>collection.ads.find(ad=>ad.id===id))};json=collection;}
      else json=collection;
    } else if(path.startsWith('/api/site-ads/')&&method==='DELETE'){const id=path.split('/').pop(),body=route.request().postDataJSON();assert.equal(body.expectedRevision,collection.revision);collection={...collection,revision:collection.revision+1,ads:collection.ads.filter(ad=>ad.id!==id)};json=collection;
    } else if(path.startsWith('/api/site-ads/')&&method==='PUT'){const id=path.split('/').pop(),body=route.request().postDataJSON();collection={...collection,revision:collection.revision+1,ads:collection.ads.map(ad=>ad.id===id?{...ad,...body,src:ad.src}:ad)};json=collection;
    } else if(path==='/api/site-banner')json={revision:0,alerts:[],settings:{}};
    else if(path==='/api/site-banner/weather')json={weather:null};
    else if(path==='/api/site-content')json={entries:{}};
    await route.fulfill({status,json});
   });
   await page.goto(origin);await page.locator('[data-ad-editable]').waitFor();
   const carousel=page.locator('.home-ad-carousel');
   assert.equal(await carousel.evaluate(el=>el.previousElementSibling?.classList.contains('home-status-banner')),true);
   assert.equal(await carousel.getByRole('img',{name:'Workshop banner'}).count(),1);
   const workshopImage=page.locator('.home-ad-slide img[alt="Workshop banner"]');await workshopImage.waitFor();assert.equal(await workshopImage.getAttribute('src'),'/images/saturday-workshop-october-3.webp');
   await page.waitForFunction(()=>{const image=document.querySelector('.home-ad-slide img[alt="Workshop banner"]');return image?.complete&&image.naturalWidth>0;},null,{timeout:15000});
   assert.equal(await page.locator('.home-ad-controls').count(),0);
   assert.equal(await page.locator('.home-ad-slide.is-active img').getAttribute('alt'),'Workshop banner');
   const activeLink=page.getByRole('link',{name:'Saturday Dog Training Workshop'});await activeLink.focus();await page.waitForTimeout(3400);
   assert.equal(await page.locator('.home-ad-slide.is-active img').getAttribute('alt'),'Workshop banner');
   await page.evaluate(()=>document.activeElement?.blur());
   await page.waitForFunction(()=>document.querySelector('.home-ad-slide.is-active img')?.getAttribute('alt')==='Second promotion',null,{timeout:5000});

   const box=await carousel.boundingBox();await page.mouse.move(box.x+80,box.y+80);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
   await page.getByRole('dialog',{name:/Manage homepage ads/i}).waitFor();
   assert.equal(await page.locator('.ad-editor-card').first().getByLabel('Ad name').inputValue(),'Saturday Dog Training Workshop');
   const addPanel=page.locator('.ad-editor-add');await addPanel.getByRole('heading',{name:'Add advertisement'}).scrollIntoViewIfNeeded();
   await addPanel.getByLabel('Banner artwork').setInputFiles(fixture);
   await addPanel.getByLabel('Ad name').fill('New community workshop');
   await addPanel.getByLabel('Image description').fill('Bravo community workshop advertisement');
   await addPanel.getByRole('button',{name:'+ Add ad',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.ad-editor-card').length===3);
   const addedCard=page.locator('.ad-editor-card').nth(2);
   assert.equal(await addedCard.getByLabel('Ad name').inputValue(),'New community workshop');

   page.once('dialog',d=>d.accept());
   await addedCard.getByRole('button',{name:'Delete'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.ad-editor-card').length===2);

   await page.getByRole('button',{name:'Done',exact:true}).click();
   role='staff';await page.reload();await page.waitForLoadState('networkidle');
   assert.equal(await page.locator('[data-ad-editable]').count(),0);
   const publicCarousel=page.locator('.home-ad-carousel'),b=await publicCarousel.boundingBox();await page.mouse.move(b.x+50,b.y+50);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
   assert.equal(await page.getByRole('dialog',{name:/Manage homepage ads/i}).count(),0);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`test-results/home-ad-carousel-${engineName}.png`});
   console.log(`PASS ${engineName}: placement, automatic fade, no public controls, hold editor, add/delete, and staff restriction`);
   await context.close();
  }finally{await browser.close();}
 }
}finally{server.close();}
