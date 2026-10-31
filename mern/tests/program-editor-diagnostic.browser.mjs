import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const dist=fileURLToPath(new URL('../client/dist/',import.meta.url));
const html=await readFile(`${dist}/bravo-shell.html`,'utf8'),app=express();
app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.type('html').send(html));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir('test-results',{recursive:true});
try{for(const [name,engine] of Object.entries({chromium,webkit})){
 if(process.env.BRAVO_BROWSER_ENGINES && !process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name))continue;
 const browser=await engine.launch();try{for(const width of [768,1440]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 const diagnosticErrors=[];page.on('pageerror',error=>diagnosticErrors.push(error.message));
 await page.addInitScript(()=>{window.editorEvents=[];for(const name of ['pointerdown','pointerup','click'])document.addEventListener(name,event=>{const target=event.target;if(target instanceof Element && target.closest('.program-media-tools'))window.editorEvents.push({name,text:target.textContent?.slice(0,80),x:event.clientX,y:event.clientY,time:performance.now(),prevented:event.defaultPrevented});},true);});let role='owner',primary=true,entries={'goal-manners-media':{revision:4,value:{mediaKind:'automatic',color:'#BA9A64'}}},fail=false,failRead=false,contentReads=0;
 // Hold the initial snapshot until the first edit. A save must independently
 // read revision 4 and preserve the existing design instead of assuming zero.
 let releaseInitialContent;const initialContent=new Promise(resolve=>{releaseInitialContent=resolve;});
 let clips=[{id:'manners',title:'Program video fixture',description:'Program description',src:'/fixture.mp4',revision:1,order:0,fit:'contain'}];
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let json={images:{},entries:{},clips:[],services:[],team:[],reviews:[],notifications:[],alerts:[]};
 if(path==='/api/auth/me')json={user:role?{id:'fixture',role,isPrimaryOwner:primary,name:'Fixture'}:null,services:[]};
 if(path==='/api/site-content'){contentReads+=1;if(failRead)return route.fulfill({status:503,json:{error:'Fixture current version unavailable.'}});if(contentReads===1)await initialContent;json={entries};}
 if(path==='/api/site-images')json={images:{'program-handling':{src:'/images/obedience-real-world.webp',alt:'Custom handling photo',revision:1,framed:true,x:50,y:50,zoom:1,fit:'cover'}}};
 if(path.startsWith('/api/site-content/')){if(fail)return route.fulfill({status:503,json:{error:'Fixture save failed. Try again.'}});const key=path.split('/').at(-1),body=route.request().postDataJSON();assert.equal(body.expectedRevision,entries[key]?.revision||0);if(key==='goal-manners-media'){assert.ok(contentReads>=2,'interactive save reads the current revision while the initial snapshot is held');assert.equal(body.value.color,'#BA9A64','media changes preserve existing design');}entries[key]={value:body.value,revision:body.expectedRevision+1};json={entry:entries[key]};releaseInitialContent();}
 if(path==='/api/program-videos')json={clips};
 if(path==='/api/program-videos/manners'){const body=route.request().postDataJSON();clips=[{...clips[0],title:body.title,description:body.description,revision:2}];json={clip:clips[0]};}
 await route.fulfill({json});});
 const clickProgramTool=async name=>{const button=page.getByRole('button',{name,exact:true});await button.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await button.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.ok(await button.evaluate(node=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),'editor action is clear of fixed toolbars');await button.click();};
 try{for(const administrator of [false,true]){
 primary=!administrator;await page.goto(origin);await page.getByText('See training examples by goal',{exact:true}).click();await page.getByRole('button',{name:'Edit program video',exact:true}).waitFor();
 // Wait for the background request to reach the fixture before holding it;
 // otherwise a faster CI runner can make the interactive read arrive first.
 const snapshotDeadline=Date.now()+5000;while(contentReads===0 && Date.now()<snapshotDeadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(contentReads>0,'initial content request reached the fixture before editing');
 await page.getByLabel('Program photo or video',{exact:true}).selectOption('photo');await clickProgramTool('Edit program photo');
 await page.locator('.site-photo-dialog[open]').waitFor();assert.equal(await page.getByLabel('Choose a replacement from files').count(),1);await page.getByRole('button',{name:'Close media editor'}).click();
 await clickProgramTool('Edit program text');const dialog=page.getByRole('dialog',{name:'Edit website section'});await dialog.getByLabel('Edit this part').selectOption('goal-manners-title');await dialog.getByLabel('Text',{exact:true}).fill(administrator?'Admin title':'Owner title');fail=true;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),administrator?'Admin title':'Owner title');fail=false;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});
 await page.reload();await page.getByText('See training examples by goal',{exact:true}).click();await page.getByRole('heading',{name:administrator?'Admin title':'Owner title',exact:true}).waitFor();assert.equal(await page.getByLabel('Program photo or video').inputValue(),'photo');
 await clickProgramTool('Edit program video');await page.locator('.proof-video-dialog[open]').waitFor();assert.equal(await page.getByLabel('Choose video from files').count(),1);assert.equal(await page.getByRole('button',{name:'Remove video',exact:true}).count(),0);await page.getByLabel('Video title',{exact:true}).fill(administrator?'Admin video':'Owner video');await page.getByRole('button',{name:'Publish changes',exact:true}).click();await page.locator('.proof-video-dialog').waitFor({state:'hidden'});await page.getByLabel('Program photo or video').selectOption('photo');
 await page.getByLabel('Program photo or video').selectOption('video');await page.locator('.goal-proof video').waitFor();await page.reload();await page.getByText('See training examples by goal',{exact:true}).click();await page.locator('.goal-proof video').waitFor();
 await page.getByRole('button',{name:'Preview Advanced & working-dog goals',exact:true}).click();assert.equal(await page.getByLabel('Program photo or video').inputValue(),'automatic');
 await clickProgramTool('Upload program video');await page.locator('.proof-video-dialog[open]').waitFor();await page.getByRole('button',{name:'Close video editor'}).click();
 await page.getByRole('button',{name:'Preview Aggression concerns',exact:true}).click();await page.getByLabel('Program photo or video').selectOption('photo');await page.getByAltText('Custom handling photo').waitFor();await page.getByLabel('Program photo or video').selectOption('automatic');await page.waitForFunction(()=>document.querySelector('.goal-consult img')?.getAttribute('src')==='/images/bravo-client-training.jpeg');
 const beforeFailedRead=entries['goal-handling-media'].revision;failRead=true;await page.getByLabel('Program photo or video').selectOption('photo');await page.getByRole('alert').filter({hasText:'Fixture current version unavailable.'}).waitFor();assert.equal(entries['goal-handling-media'].revision,beforeFailedRead,'failed version lookup must not submit a mutation');assert.equal(await page.getByLabel('Program photo or video').inputValue(),'automatic');failRead=false;await page.getByLabel('Program photo or video').selectOption('photo');await page.getByAltText('Custom handling photo').waitFor();await page.getByLabel('Program photo or video').selectOption('automatic');await page.waitForFunction(()=>document.querySelector('.goal-consult img')?.getAttribute('src')==='/images/bravo-client-training.jpeg');
 assert.ok(await page.getByRole('button',{name:'Edit photos & videos',exact:true}).isVisible());
 await page.screenshot({path:`test-results/program-editor-${name}-${width}-${administrator?'admin':'owner'}.png`,fullPage:false});
 }
 for(const visitor of ['staff','member',null]){role=visitor;await page.reload();await page.getByText('See training examples by goal',{exact:true}).click();await page.locator('#goal-title').waitFor();await page.waitForLoadState('networkidle');assert.equal(await page.locator('.program-media-tools').count(),0);assert.equal(await page.getByRole('button',{name:'Edit photos & videos',exact:true}).count(),0);}
 console.log(`PASS ${name}/${width}: owner/admin media, photo picker, video editor, independent program choice, failed-save retry and reload`);
 }catch(error){console.log('EDITOR_DIAGNOSTIC',JSON.stringify({engine:name,width,errors:diagnosticErrors,...await page.evaluate(()=>({events:window.editorEvents,dialogs:[...document.querySelectorAll('dialog')].map(d=>({class:d.className,open:d.open})),buttons:[...document.querySelectorAll('.program-media-tools button')].map(b=>({text:b.textContent,disabled:b.disabled,rect:b.getBoundingClientRect().toJSON(),hit:document.elementFromPoint(b.getBoundingClientRect().x+b.clientWidth/2,b.getBoundingClientRect().y+b.clientHeight/2)?.outerHTML.slice(0,400)}))}))}));await page.screenshot({path:`test-results/program-editor-viewport-${name}-${width}.png`});await context.tracing.stop({path:`test-results/program-editor-trace-${name}-${width}.zip`});await page.screenshot({path:`test-results/program-editor-failure-${name}-${width}.png`,fullPage:true});await writeFile(`test-results/program-editor-failure-${name}-${width}.txt`,await page.locator('body').innerText());throw error;}finally{releaseInitialContent();await context.tracing.stop().catch(()=>{});await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
