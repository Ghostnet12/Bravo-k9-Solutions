// The shared goal cards replace the retired desktop-only program preview.
// Exercise their real text/photo editing controls at tablet and desktop sizes.
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url));
const html=await readFile(`${dist}/bravo-shell.html`,'utf8'), app=express();
app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try { for (const [name,engine] of Object.entries({chromium,webkit})) {
 if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name))continue;
 const browser=await engine.launch();
 try { for (const width of [390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  let role='owner',primary=true,entries={},fail=false,writes=0;
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   let json={images:{},entries:{},clips:[],services:[],team:[],reviews:[],schedules:[],notifications:[],alerts:[]};
   if(path==='/api/auth/me')json={user:role?{id:'fixture',role,isPrimaryOwner:primary,name:'Fixture'}:null,services:[]};
   if(path==='/api/config')json={services:SERVICES};
   if(path==='/api/site-content')json={entries};
   if(path.startsWith('/api/site-content/')) {
    if(fail)return route.fulfill({status:503,json:{error:'Fixture save failed. Try again.'}});
    const key=path.split('/').at(-1),body=route.request().postDataJSON();
    const changes=key==='batch'?body.changes:[{key,...body}];
    for(const change of changes){assert.equal(change.expectedRevision,entries[change.key]?.revision||0);entries[change.key]={value:change.value,revision:change.expectedRevision+1};writes++;}
    json=key==='batch'?{entries}:{entry:entries[key]};
   }
   await route.fulfill({json});
  });
  const hold=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.waitForTimeout(800);await page.mouse.up();};
  try {
   for(const administrator of [false,true]) {
    primary=!administrator;await page.goto(origin+'/training',{waitUntil:'networkidle'});
    const title=administrator?'Admin training title':'Owner training title';
    await hold(page.locator('.conversion-goal h3').first());
    const dialog=page.getByRole('dialog',{name:'Edit website section',exact:true});await dialog.waitFor();
    await dialog.getByLabel('Text',{exact:true}).fill(title);fail=true;
    await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();
    await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),title);
    fail=false;await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:title,exact:true}).waitFor();
    const photo=page.locator('.conversion-goal img').first();await photo.scrollIntoViewIfNeeded();await photo.press('F2');
    const editor=page.getByRole('dialog',{name:'Edit this photo',exact:true});await editor.waitFor();
    assert.equal(await editor.getByLabel('Choose a replacement from files').count(),1);
    await editor.getByRole('button',{name:'Close media editor'}).click();
   }
   assert.equal(writes,2,'failed publications never count as saved changes');
   for(const outsider of [null,'member','staff']) {
    role=outsider;await page.goto(origin+'/training',{waitUntil:'networkidle'});
    assert.equal(await page.getByRole('button',{name:'Edit page text & design',exact:true}).count(),0);
    assert.equal(await page.locator('.conversion-goal img[data-site-image-editable]').count(),0);
   }
   console.log(`PASS ${name}/${width}: shared goal text publication, failed-save recovery, photo controls and permissions`);
  } catch(error) { await page.screenshot({path:`test-results/program-editor-${name}-${width}-failure.png`,fullPage:true});throw error; }
  finally { await page.close(); }
 }} finally { await browser.close(); }
}} finally { await new Promise(resolve=>server.close(resolve)); }
