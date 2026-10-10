// Exercise the real route-focus timer at a deterministic point during text entry.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { once } from 'node:events';
import app from '../server/app.js';
import { SERVICES } from '../shared/catalog.js';
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
try {for(const [name,engine] of Object.entries({chromium,webkit})) {
 if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name))continue;
 const browser=await engine.launch();
 try {for(const mode of ['normal-navigation','immediate-notes-entry']) {
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{
   const set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window),queued=new Map();
   window.routeFocusTimersSeen=0;
   window.setTimeout=(callback,delay,...args)=>{
    if(delay===100 && typeof callback==='function' && callback.toString().includes('main-content')) {
     const id=set(()=>{},60000);queued.set(id,()=>callback(...args));window.routeFocusTimersSeen++;return id;
    }
    return set(callback,delay,...args);
   };
   window.clearTimeout=id=>{queued.delete(id);return clear(id);};
   window.flushRouteFocus=()=>{const jobs=[...queued];queued.clear();for(const [id,callback] of jobs){clear(id);callback();}return jobs.length;};
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   let json={items:[],entries:{},images:{},clips:[],alerts:[],ads:[],team:[],reviews:[],services:[]};
   if(url.pathname==='/api/config')json={connected:true,paymentsReady:false,services:SERVICES};
   if(url.pathname==='/api/auth/me')json={user:null,services:[],membership:{active:false}};
   if(url.pathname==='/api/live')json={sessions:[],announcements:[],availability:'available',serverTime:new Date().toISOString()};
   await route.fulfill({json});
  });
  try {
   await page.goto(origin+'/portal?program=training');
   const notes=page.getByLabel('Anything you’d like your trainer to know? (optional)',{exact:true});await notes.waitFor();
   await page.waitForFunction(()=>window.routeFocusTimersSeen>0);
   if(mode==='normal-navigation') {
    assert.equal(await page.evaluate(()=>window.flushRouteFocus()),1);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content','ordinary navigation still announces the page');
   } else {
    await notes.focus();
    await page.evaluate(()=>window.flushRouteFocus());
    assert.ok(await notes.evaluate(el=>el===document.activeElement),'deferred route focus cannot steal an active notes field');
    await page.keyboard.insertText('Jumps when visitors arrive.');
    assert.equal(await notes.inputValue(),'Jumps when visitors arrive.','input without pointer or keydown is retained');
   }
   assert.deepEqual(errors,[]);console.log(`PASS ${name}: ${mode}`);
  }finally{await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
