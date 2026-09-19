import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url)),html=await readFile(`${dist}/bravo-shell.html`,'utf8');
const app=express();app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try{for(const [name,engine]of Object.entries({chromium,webkit})){const browser=await engine.launch();try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true}),page=await context.newPage(),errors=[];let role='owner',entries={},failSave=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let status=200,json={services:[],team:[],reviews:[],images:{},clips:[],schedules:[],alerts:[],revision:0};
    if(path==='/api/auth/me')json={user:role?{id:'fixture',name:'Fixture',role}:null,services:[]};
    if(path==='/api/site-content')json={entries};
    if(path.startsWith('/api/site-content/')){const key=path.split('/').at(-1),body=route.request().postDataJSON();if(failSave){status=409;json={error:'Someone else changed this item. Reopen the editor.'};}else{const old=entries[key]||{revision:0,value:{}};assert.equal(body.expectedRevision,old.revision);entries[key]={value:body.undo?old.previous:body.value,previous:old.value,revision:old.revision+1,canUndo:true};json={entry:entries[key]};}}
    await route.fulfill({status,json});});
  async function hold(locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();await page.mouse.move(b.x+Math.min(30,b.width/2),b.y+Math.min(12,b.height/2));await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();}
  try{
    await page.goto(origin);await page.waitForLoadState('networkidle');const intro=page.locator('.home-intro'),key=await intro.getAttribute('data-site-content-key'),original=await intro.innerText();
    assert.equal(await page.getByRole('button',{name:'Edit photos & videos',exact:true}).isVisible(),false);
    await hold(intro);const dialog=page.getByRole('dialog',{name:'Edit website section',exact:true});await dialog.waitFor();
    await dialog.getByLabel('Text',{exact:true}).fill('Training edited by the owner. <script>plain text</script>');
    await dialog.getByLabel('Font',{exact:true}).selectOption('georgia');
    await dialog.getByLabel('Background',{exact:true}).selectOption('gradient');
    assert.ok((await intro.innerText()).includes('Training edited'));assert.ok((await intro.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('linear-gradient'));
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await intro.innerText(),original);
    await hold(intro);await dialog.waitFor();await dialog.getByLabel('Edit this part',{exact:true}).selectOption('site-theme');await dialog.getByLabel('Font',{exact:true}).selectOption('georgia');
    await dialog.getByLabel('Text color',{exact:true}).evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'#abcdef');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.ok((await page.locator('#home-title').evaluate(el=>getComputedStyle(el).fontFamily)).includes('Georgia'));assert.equal(await page.locator('#home-title').evaluate(el=>getComputedStyle(el).color),'rgb(171, 205, 239)');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await hold(intro);await dialog.waitFor();await dialog.getByLabel('Text',{exact:true}).fill('Owner published training information.');
    failSave=true;await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),'Owner published training information.');
    failSave=false;await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(entries[key].value.text,'Owner published training information.');await page.reload();await page.waitForLoadState('networkidle');assert.equal(await intro.innerText(),'Owner published training information.');
    await hold(intro);await dialog.waitFor();await page.screenshot({path:`test-results/site-content-editor-${name}-${width}.png`});await dialog.getByRole('button',{name:'Reset this part to original',exact:true}).click();await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await intro.innerText(),original);
    await hold(intro);await dialog.waitFor();await dialog.getByRole('button',{name:'Restore previous published edit',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await intro.innerText(),'Owner published training information.');
    await page.goto(`${origin}/dog-training`);await page.waitForLoadState('networkidle');const title=page.getByRole('heading',{level:1});await hold(title);await dialog.waitFor();await dialog.getByLabel('Text',{exact:true}).fill('Private dog training with Bravo.');await dialog.getByRole('button',{name:'Publish website changes',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.reload();await page.waitForLoadState('networkidle');assert.equal(await title.textContent(),'Private dog training with Bravo.');
    for(const visitorRole of ['staff','member',null]){role=visitorRole;await page.goto(origin);await page.waitForLoadState('networkidle');await hold(intro);assert.equal(await page.getByRole('dialog').count(),0);}
    assert.deepEqual(errors,[]);console.log(`PASS ${name}/${width}: hold-only editor, preview, cancel, publish, conflicts, reset, undo, page navigation and role restrictions`);
  }catch(error){await page.screenshot({path:`test-results/site-content-failure-${name}-${width}.png`,fullPage:true});await writeFile(`test-results/site-content-failure-${name}-${width}.json`,JSON.stringify({error:error.message,errors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();}
}}finally{await browser.close();}}}finally{server.close();}
