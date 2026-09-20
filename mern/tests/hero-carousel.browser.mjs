import assert from 'node:assert/strict';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const videoFixture='/tmp/bravo-hero-upload.mp4';
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=15','-t','7','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',videoFixture]);
const app = express(); app.get('/api/hero-videos/:id/video',(_req,res)=>res.sendFile(videoFixture)); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try { for (const [name, engine] of Object.entries({ chromium, webkit })) {
 const browser = await engine.launch(name==='chromium'?{channel:'chrome'}:{});
 try { for (const width of [390,1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
  let role = null, settings = { revision: 0, intervalSeconds: 2, photos: ['team-david-northrop','team-ashley-northrop'] }, images = {}, videos = {};
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const path = new URL(route.request().url()).pathname;
   let json = { connected:true, user:null, services:[], team:[], schedules:[], entries:{}, images, clips:[], reviews:[], count:0 };
   if (/^\/api\/hero-videos\/[^/]+\/video$/.test(path)) return route.continue();
   if (path === '/api/hero-videos') json={clips:Object.values(videos),nextCursor:null};
   if (/^\/api\/hero-videos\/[^/]+\/uploads$/.test(path)) json={uploadId:'11111111-1111-4111-8111-111111111111'};
   if (/^\/api\/hero-videos\/[^/]+$/.test(path) && route.request().method()==='PUT') { const id=path.split('/')[3],body=route.request().postDataJSON(); videos[id]={id,title:body.title,description:body.description,revision:(videos[id]?.revision||0)+1,order:Date.now(),fit:body.fit,src:`/api/hero-videos/${id}/video?v=1`};json={clip:videos[id]}; }
   if (path === '/api/auth/me') json = { user: role ? {id:'owner', role, name:'Fixture'} : null, services:[] };
   if (path === '/api/hero-carousel') { if (route.request().method() === 'PUT') { const body = route.request().postDataJSON(); assert.equal(body.expectedRevision,settings.revision); settings = {revision:settings.revision+1,intervalSeconds:body.intervalSeconds,photos:body.photos}; } json = {carousel:settings}; }
   if (path.startsWith('/api/site-images/')) { const key=path.split('/')[3]; if(route.request().method()==='PUT') { const body=route.request().postDataJSON(); assert.equal(body.fit,'contain'); images[key]={...body,revision:1,src:'/images/bravo-client-training.jpeg',framed:true}; json={image:images[key]}; } }
   if (path === '/api/site-banner') json={revision:0,alerts:[],settings:{motion:'never'}};
   await route.fulfill({json});
  });
  try {
  const gallery=page.getByRole('region',{name:'Trainer photos'}),track=page.locator('.hero-photo-window');
  await page.goto(origin); await gallery.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
  assert.equal(await page.getByRole('button',{name:'Add photos',exact:true}).count(),0);
  const start=await track.evaluate(el=>el.scrollLeft);await page.waitForTimeout(2200);
  assert.notEqual(await track.evaluate(el=>el.scrollLeft),start,'automatically moves left');
  assert.equal(await page.locator('.hero-photo-controls').evaluate(el=>getComputedStyle(el).clipPath),'inset(50%)','controls hidden in normal view');
  assert.equal(await page.locator('.hero-photo-controls').innerText().then(text=>text.includes('/')),false,'no slide counter');
  await gallery.click({position:{x:100,y:70}});await page.waitForTimeout(650);
  const paused=await track.evaluate(el=>el.scrollLeft);await page.waitForTimeout(2200);assert.equal(await track.evaluate(el=>el.scrollLeft),paused);
  await gallery.click({position:{x:100,y:70}});await page.waitForTimeout(2200);assert.notEqual(await track.evaluate(el=>el.scrollLeft),paused,'touch resumes instead of permanently pausing');
  role='owner';await page.reload();await gallery.scrollIntoViewIfNeeded();await page.waitForTimeout(700);
  const box=await gallery.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+40);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
  const editor=page.getByRole('dialog',{name:'Edit hero carousel'});await editor.waitFor();
  await page.getByLabel('Time between slides (seconds)').fill('3');await page.getByRole('button',{name:'Save carousel timing'}).click();await page.getByText('Hero carousel saved.',{exact:true}).waitFor();assert.equal(settings.intervalSeconds,3);
  await editor.locator('input[type=file]').setInputFiles(`${dist}/images/bravo-client-training.jpeg`);await page.getByText('1 photo added.',{exact:true}).waitFor();assert.equal(settings.photos.length,3);
  await editor.getByRole('button',{name:'Add video',exact:true}).click();
  const videoEditor=page.getByRole('dialog',{name:'Add a video'});await videoEditor.waitFor();
  await page.getByLabel('Choose video from your photo library').setInputFiles(videoFixture);
  await page.getByLabel('Video title',{exact:true}).fill('Hero training video');await videoEditor.getByLabel('Description',{exact:true}).fill('Real training session description.');
  await page.getByRole('button',{name:'Publish video',exact:true}).click();await editor.waitFor();await page.getByText('Hero carousel saved.',{exact:true}).waitFor();
  assert.equal(settings.photos.length,4);const videoKey=settings.photos.find(key=>key.startsWith('hero-video-'));assert.ok(videoKey);
  await page.screenshot({path:`test-results/hero-editor-${name}-${width}.png`});
  await page.getByRole('button',{name:/Main training photo/}).click();await page.getByRole('dialog',{name:'Edit this photo'}).waitFor();
  await page.getByRole('button',{name:'Close media editor'}).click();
  await page.reload();await gallery.scrollIntoViewIfNeeded();await page.waitForTimeout(700);assert.equal(await page.locator('.hero-photo-slide').count(),5);
  const activeVideo=page.locator('.hero-video video');await page.waitForFunction(()=>{const v=document.querySelector('.hero-video video');return v && v.currentTime>0.2 && !v.paused;},null,{timeout:18000});
  assert.equal(await activeVideo.getAttribute('controls'),null);assert.equal(await activeVideo.evaluate(v=>v.muted),true);
  await page.waitForTimeout(3400);assert.ok(await activeVideo.evaluate(v=>v.currentTime>3 && !v.paused),'video plays beyond photo interval');
  await page.waitForFunction(()=>{const v=document.querySelector('.hero-video video');return v && v.paused;},null,{timeout:8000});
  assert.equal(await page.locator('.hero-photo-slide').first().getAttribute('aria-hidden'),'false','advance after video ends');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(650);const reduced=await track.evaluate(el=>el.scrollLeft);await page.waitForTimeout(3200);assert.equal(await track.evaluate(el=>el.scrollLeft),reduced);
  // An unavailable slide and slow download must never replace a visible photo with blank space.
  const badKey='hero-photo-22222222-2222-4222-8222-222222222222', slowKey='hero-photo-33333333-3333-4333-8333-333333333333';
  settings={revision:9,intervalSeconds:2,photos:[badKey,slowKey]};images={[badKey]:{src:'/unavailable-hero.jpg',alt:'Unavailable fixture'},[slowKey]:{src:'/slow-hero.jpg',alt:'Slow fixture'}};
  await page.route('**/unavailable-hero.jpg',route=>route.fulfill({status:404,body:''}));
  await page.route('**/slow-hero.jpg',async route=>{await new Promise(resolve=>setTimeout(resolve,8000));await route.fulfill({contentType:'image/jpeg',body:await readFile(`${dist}/images/bravo-client-training.jpeg`)});});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();await gallery.scrollIntoViewIfNeeded();await page.waitForTimeout(4500);
  assert.equal(await page.locator('.hero-photo-slide').first().getAttribute('aria-hidden'),'false','retain current photo while the next usable image downloads');
  assert.equal(await page.locator('.hero-photo-slide').first().locator('img').evaluate(el=>el.complete&&el.naturalWidth>0),true);
  await page.waitForFunction(()=>{const slide=document.querySelector('.hero-photo-slide[aria-hidden="false"]'),img=slide?.querySelector('img');return img?.getAttribute('src')==='/slow-hero.jpg'&&img.complete&&img.naturalWidth>0;},null,{timeout:15000});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.deepEqual(errors,[]);await page.screenshot({path:`test-results/hero-carousel-${name}-${width}.png`});console.log(`PASS ${name}/${width}: left rotation, touch resume, owner hold, upload, timing, editor and reduced motion`);await page.close();
  } catch(error) { console.log('Hero failure state',await page.locator('.hero-photo-slide').evaluateAll(slides=>slides.map(slide=>{const image=slide.querySelector('img');return {active:slide.getAttribute('aria-hidden'),src:image?.src,complete:image?.complete,width:image?.naturalWidth,loading:image?.loading};}))); await page.screenshot({path:`test-results/hero-failed-${name}-${width}.png`}); await writeFile(`test-results/hero-failed-${name}-${width}.txt`,`${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(errors)}`); throw error; }
 }} finally {await browser.close();}
}} finally {await new Promise(resolve=>server.close(resolve));}
