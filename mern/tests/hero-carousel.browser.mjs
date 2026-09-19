import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('test-results', { recursive: true });
try { for (const [name, engine] of Object.entries({ chromium, webkit })) {
 const browser = await engine.launch();
 try { for (const width of [390,1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
  let role = null, settings = { revision: 0, intervalSeconds: 2, photos: ['team-david-northrop','team-ashley-northrop'] }, images = {};
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const path = new URL(route.request().url()).pathname;
   let json = { connected:true, user:null, services:[], team:[], schedules:[], entries:{}, images, clips:[], reviews:[], count:0 };
   if (path === '/api/auth/me') json = { user: role ? {id:'owner', role, name:'Fixture'} : null, services:[] };
   if (path === '/api/hero-carousel') { if (route.request().method() === 'PUT') { const body = route.request().postDataJSON(); assert.equal(body.expectedRevision,settings.revision); settings = {revision:settings.revision+1,intervalSeconds:body.intervalSeconds,photos:body.photos}; } json = {carousel:settings}; }
   if (path.startsWith('/api/site-images/')) { const key=path.split('/')[3]; if(route.request().method()==='PUT') { const body=route.request().postDataJSON(); assert.equal(body.fit,'contain'); images[key]={...body,revision:1,src:'/images/bravo-client-training.jpeg',framed:true}; json={image:images[key]}; } }
   if (path === '/api/site-banner') json={revision:0,alerts:[],settings:{motion:'never'}};
   await route.fulfill({json});
  });
  try {
  const gallery=page.getByRole('region',{name:'Trainer photos'}),track=page.locator('.hero-photo-track');
  await page.goto(origin); await gallery.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
  assert.equal(await page.getByRole('button',{name:'Add photos',exact:true}).count(),0);
  const start=await track.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(2200);
  assert.notEqual(await track.evaluate(el=>getComputedStyle(el).transform),start,'automatically moves left');
  await page.getByRole('button',{name:'Pause trainer photos'}).click();await page.waitForTimeout(650);
  const paused=await track.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(2200);assert.equal(await track.evaluate(el=>getComputedStyle(el).transform),paused);
  await page.getByRole('button',{name:'Resume trainer photos'}).click();await page.waitForTimeout(2200);assert.notEqual(await track.evaluate(el=>getComputedStyle(el).transform),paused,'touch resumes instead of permanently pausing');
  role='owner';await page.reload();await gallery.scrollIntoViewIfNeeded();await page.waitForTimeout(700);
  const box=await gallery.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+40);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
  const editor=page.getByRole('dialog',{name:'Edit photo carousel'});await editor.waitFor();
  await page.getByLabel('Time between photos (seconds)').fill('3');await page.getByRole('button',{name:'Save photo timing'}).click();await page.getByText('Photo carousel saved.',{exact:true}).waitFor();assert.equal(settings.intervalSeconds,3);
  await editor.locator('input[type=file]').setInputFiles(`${dist}/images/bravo-client-training.jpeg`);await page.getByText('1 photo added.',{exact:true}).waitFor();assert.equal(settings.photos.length,3);
  await page.screenshot({path:`test-results/hero-editor-${name}-${width}.png`});
  await page.getByRole('button',{name:/Main training photo/}).click();await page.getByRole('dialog',{name:'Edit this photo'}).waitFor();
  await page.getByRole('button',{name:'Close media editor'}).click();
  await page.reload();await gallery.scrollIntoViewIfNeeded();await page.waitForTimeout(700);assert.equal(await page.locator('.hero-photo-slide').count(),4);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(650);const reduced=await track.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(3200);assert.equal(await track.evaluate(el=>getComputedStyle(el).transform),reduced);
  assert.deepEqual(errors,[]);await page.screenshot({path:`test-results/hero-carousel-${name}-${width}.png`});console.log(`PASS ${name}/${width}: left rotation, touch resume, owner hold, upload, timing, editor and reduced motion`);await page.close();
  } catch(error) { await page.screenshot({path:`test-results/hero-failed-${name}-${width}.png`}); await writeFile(`test-results/hero-failed-${name}-${width}.txt`,`${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(errors)}`); throw error; }
 }} finally {await browser.close();}
}} finally {await new Promise(resolve=>server.close(resolve));}
