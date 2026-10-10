// Real media playback with synthetic transport only; no real broadcasts or APIs.
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { SERVICES } from '../shared/catalog.js';
const app=express(),dist=path.resolve('client/dist');app.use(express.static(dist,{redirect:false}));app.get('/{*rest}',(_req,res)=>res.sendFile(path.join(dist,'bravo-shell.html')));
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
try {for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900}});let polls=0;const errors=[];
 await context.addInitScript(()=>{
  window.fixturePlaybackAllowed=false;
  const srcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { ...srcObject, set(value) { this.autoplay = false; srcObject.set.call(this, value); } });
  const originalPlay=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){return this.getAttribute('aria-label')==='Live training video'&&!window.fixturePlaybackAllowed?Promise.reject(new DOMException('Fixture autoplay blocked','NotAllowedError')):originalPlay.call(this);};
  window.RTCPeerConnection=class{
   constructor(){this.connectionState='new';this.iceGatheringState='complete';}
   addTransceiver(){}
   async createOffer(){return {type:'offer',sdp:'fixture-offer'};}
   async setLocalDescription(value){this.localDescription=value;}
   async setRemoteDescription(value){this.currentRemoteDescription=value;const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillRect(0,0,64,64);this.draw=setInterval(()=>ctx.fillRect(0,0,64,64),100);this.track=canvas.captureStream(10).getVideoTracks()[0];this.ontrack({track:this.track});this.connectionState='connected';this.onconnectionstatechange();}
   close(){this.connectionState='closed';clearInterval(this.draw);this.track?.stop();}
  };
 });
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();let data={entries:{},images:{},clips:[],items:[],ads:[],team:[],reviews:[],announcements:[]};
  if(u.pathname==='/api/config')data={connected:true,paymentsReady:false,services:SERVICES,lessonLibrary:{open:false}};
  if(u.pathname==='/api/auth/me')data={user:null,services:[],membership:{active:false}};
  if(u.pathname==='/api/live')data={availability:'available',serverTime:new Date().toISOString(),announcements:[],sessions:[{id:'autoplay-fixture',trainerId:'fixture',trainerName:'Fixture Trainer',dogName:'Fixture Dog',audience:'public',status:'live',liveUntil:new Date(Date.now()+120000).toISOString(),startedAt:new Date(Date.now()-60000).toISOString()}]};
  if(u.pathname==='/api/live/autoplay-fixture/watch')data={peerId:'fixture-peer',token:'synthetic-test-only'};
  if(u.pathname.endsWith('/poll')){polls++;data={status:'live',answer:{type:'answer',sdp:'fixture-answer'}};}
  return route.fulfill({json:data});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/live?session=autoplay-fixture');await page.getByRole('button',{name:'Watch live',exact:false}).click();
 const play=page.getByRole('button',{name:'Play video',exact:true});await play.waitFor().catch(async error=>{console.log('BODY',await page.locator('.live-player').innerText());console.log('ERRORS',errors,'POLLS',polls);throw error;});await page.waitForTimeout(4500);
 assert.ok(polls>=2,'exercise successful transport polls after autoplay rejection');assert.ok(await play.isVisible());assert.equal(await page.locator('.live-player .live-badge').count(),0);
 await page.evaluate(()=>{window.fixturePlaybackAllowed=true;});await play.click();await page.locator('.live-player .live-badge').waitFor();
 assert.equal(await page.locator('video[aria-label="Live training video"]').evaluate(v=>v.paused),false);assert.equal(await play.count(),0);
 await page.locator('video[aria-label="Live training video"]').dispatchEvent('waiting');
 await page.locator('video[aria-label="Live training video"]').dispatchEvent('timeupdate');
 await page.locator('.live-player .live-badge').waitFor();
 assert.ok(await page.getByRole('button',{name:'Enable audio',exact:true}).isEnabled());assert.deepEqual(errors,[]);
 console.log(`PASS ${width}px: blocked recovery survives ${polls} successful transport polls; user playback and resumed timeline restore LIVE and audio controls.`);
 await context.close();
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
