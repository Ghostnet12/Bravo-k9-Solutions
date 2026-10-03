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
 const browser=await engine.launch();try{for(const width of [360,1440]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();let role='owner',primary=true,entries={},fail=false;
 let clips=[{id:'manners',title:'Program video fixture',description:'Program description',src:'/fixture.mp4',revision:1,order:0,fit:'contain'}];
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let json={images:{},entries:{},clips:[],services:[],team:[],reviews:[],notifications:[],alerts:[]};
 if(path==='/api/auth/me')json={user:role?{id:'fixture',role,isPrimaryOwner:primary,name:'Fixture'}:null,services:[]};
 if(path==='/api/site-content')json={entries};
 if(path==='/api/site-images')json={images:{'program-handling':{src:'/images/obedience-real-world.webp',alt:'Custom handling photo',revision:1,framed:true,x:50,y:50,zoom:1,fit:'cover'}}};
 if(path.startsWith('/api/site-content/')){if(fail)return route.fulfill({status:503,json:{error:'Fixture save failed. Try again.'}});const key=path.split('/').at(-1),body=route.request().postDataJSON();assert.equal(body.expectedRevision,entries[key]?.revision||0);entries[key]={value:body.value,revision:body.expectedRevision+1};json={entry:entries[key]};}
 if(path==='/api/program-videos')json={clips};
 if(path==='/api/program-videos/manners'){const body=route.request().postDataJSON();clips=[{...clips[0],title:body.title,description:body.description,revision:2}];json={clip:clips[0]};}
 await route.fulfill({json});});
 try{for(const administrator of [false,true]){
 primary=!administrator;await page.goto(origin);await page.getByRole('button',{name:'Edit program video',exact:true}).waitFor();
 await page.getByLabel('Program photo or video',{exact:true}).selectOption('photo');await page.getByRole('button',{name:'Edit program photo',exact:true}).click();
 await page.locator('.site-photo-dialog[open]').waitFor();assert.equal(await page.getByLabel('Choose a replacement from files').count(),1);await page.getByRole('button',{name:'Close media editor'}).click();
 await page.getByRole('button',{name:'Edit program text',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Edit website section'});await dialog.getByLabel('Edit this part').selectOption('goal-manners-title');await dialog.getByLabel('Text',{exact:true}).fill(administrator?'Admin title':'Owner title');fail=true;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Text',{exact:true}).inputValue(),administrator?'Admin title':'Owner title');fail=false;await dialog.getByRole('button',{name:'Publish website changes'}).click();await dialog.waitFor({state:'hidden'});
 await page.reload();await page.getByRole('heading',{name:administrator?'Admin title':'Owner title',exact:true}).waitFor();assert.equal(await page.getByLabel('Program photo or video').inputValue(),'photo');
 await page.getByRole('button',{name:'Edit program video',exact:true}).click();await page.locator('.proof-video-dialog[open]').waitFor();assert.equal(await page.getByLabel('Choose video from files').count(),1);assert.equal(await page.getByRole('button',{name:'Remove video',exact:true}).count(),0);await page.getByLabel('Video title',{exact:true}).fill(administrator?'Admin video':'Owner video');await page.getByRole('button',{name:'Publish changes',exact:true}).click();await page.locator('.proof-video-dialog').waitFor({state:'hidden'});await page.getByLabel('Program photo or video').selectOption('photo');
 await page.getByLabel('Program photo or video').selectOption('video');await page.locator('.goal-proof video').waitFor();await page.reload();await page.locator('.goal-proof video').waitFor();
 await page.getByRole('button',{name:'Preview Dog walking',exact:true}).click();assert.equal(await page.getByLabel('Program photo or video').inputValue(),'automatic');
 await page.getByRole('button',{name:'Upload program video',exact:true}).click();await page.locator('.proof-video-dialog[open]').waitFor();await page.getByRole('button',{name:'Close video editor'}).click();
 await page.getByRole('button',{name:'Preview Aggression & handling',exact:true}).click();await page.getByLabel('Program photo or video').selectOption('photo');await page.getByAltText('Custom handling photo').waitFor();await page.getByLabel('Program photo or video').selectOption('automatic');await page.waitForFunction(()=>document.querySelector('.goal-consult img')?.getAttribute('src')==='/images/bravo-client-training.jpeg');
 assert.ok(await page.getByRole('button',{name:'Edit photos & videos',exact:true}).isVisible());
 await page.screenshot({path:`test-results/program-editor-${name}-${width}-${administrator?'admin':'owner'}.png`,fullPage:false});
 }
 for(const visitor of ['staff','member',null]){role=visitor;await page.reload();await page.locator('#goal-title').waitFor();await page.waitForLoadState('networkidle');assert.equal(await page.locator('.program-media-tools').count(),0);assert.equal(await page.getByRole('button',{name:'Edit photos & videos',exact:true}).count(),0);}
 console.log(`PASS ${name}/${width}: owner/admin media, photo picker, video editor, independent program choice, failed-save retry and reload`);
 }catch(error){await page.screenshot({path:`test-results/program-editor-failure-${name}-${width}.png`,fullPage:true});await writeFile(`test-results/program-editor-failure-${name}-${width}.txt`,await page.locator('body').innerText());throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
