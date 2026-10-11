// Synthetic camera pixels, real media elements/WebRTC, isolated database only.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium, webkit } from 'playwright';
const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:replica.getUri(),MONGODB_DB:'live_phone_browser'});
delete process.env.STRIPE_SECRET_KEY;delete process.env.BRAVO_LIVE_ENABLED;
let server;
await mkdir('test-results',{recursive:true});
try{
 const {default:app}=await import('../server/client-services-app.js');
 const {connectDb}=await import('../server/db.js');
 const {User,Session,LiveSession}=await import('../server/models.js');await connectDb();
 server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGIN=origin;
 for(const [name,engine] of Object.entries({chromium,webkit})){
  if(process.env.BRAVO_BROWSER_ENGINES&&!process.env.BRAVO_BROWSER_ENGINES.split(',').includes(name))continue;
  const browser=await engine.launch();
  try{for(const width of [390,1440]){
   const trainer=await User.create({name:'Phone trainer',role:'owner',passwordHash:'fixture-only'}),token=randomBytes(32).toString('hex');process.env.OWNER_USER_ID=String(trainer._id);
   await Session.create({userId:trainer._id,tokenHash:createHash('sha256').update(token).digest('hex'),issuedAt:new Date(),lastSeenAt:new Date(),expiresAt:new Date(Date.now()+3600000)});
   const context=await browser.newContext({viewport:{width,height:950}});await context.addCookies([{name:'bravo_session',value:token,url:origin}]);
   await context.addInitScript(()=>{
    window.fixtureStreams=[];window.fixtureFramesFrozen=false;window.fixturePCs=0;
    const OriginalPC=window.RTCPeerConnection;
    window.RTCPeerConnection=class extends OriginalPC{constructor(options){if(!options?.iceServers?.length)throw new Error('A phone-local loopback is intentionally unavailable in this regression.');super(options);window.fixturePCs++;}};
    navigator.mediaDevices.getUserMedia=async()=>{
     const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const paint=canvas.getContext('2d');let frame=0;
     const timer=setInterval(()=>{if(window.fixtureFramesFrozen)return;paint.fillStyle=frame++%2?'#123456':'#654321';paint.fillRect(0,0,640,360);paint.fillText(String(frame),40,40);},65);
     const stream=canvas.captureStream(15),track=stream.getVideoTracks()[0],stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};window.fixtureStreams.push(stream);return stream;
    };
   });
   const phone=await context.newPage(),errors=[];phone.on('pageerror',e=>errors.push(e.message));phone.setDefaultTimeout(20000);
   try{
    await phone.goto(origin+'/live/studio');await phone.getByLabel('Dog’s name').fill('Phone test dog');await phone.getByRole('radio',{name:/PUBLIC LIVE/}).check();await phone.getByRole('checkbox',{name:/I have permission/}).check();
    await phone.getByRole('button',{name:'Enable camera preview',exact:true}).click();await phone.waitForFunction(()=>document.querySelector('.live-camera-preview video')?.videoWidth>0);
    assert.equal(await LiveSession.countDocuments({trainerId:trainer._id}),0,'preview is not a broadcast');
    await phone.getByRole('button',{name:'● Start live',exact:true}).click();await phone.getByRole('button',{name:'■ End live session',exact:true}).waitFor();
    let record=await LiveSession.findOne({trainerId:trainer._id,open:true}).lean();assert.equal(record.status,'live');assert.equal(record.publication.kind,'camera');assert.ok(record.publication.framesCaptured>=2);assert.equal(await phone.evaluate(()=>window.fixturePCs),0,'no hidden self-call blocks first viewer');
    const viewerContext=await browser.newContext({viewport:{width:390,height:900}}),viewer=await viewerContext.newPage();
    await viewer.goto(origin+'/live?session='+record._id);await viewer.getByRole('button',{name:/Watch live/}).click();
    await viewer.waitForFunction(()=>{const v=document.querySelector('.live-video-stage video');return v?.videoWidth>0&&v.currentTime>.3;},null,{timeout:60000});
    const before=await viewer.locator('.live-video-stage video').evaluate(v=>v.currentTime);await viewer.waitForFunction(t=>document.querySelector('.live-video-stage video').currentTime>t+.3,before);
    assert.ok(await phone.evaluate(()=>window.fixturePCs)>=1,'a real viewer gets a real peer connection');
    await phone.getByRole('button',{name:'Flip camera',exact:true}).click();await phone.locator('.live-camera-preview video.is-mirrored').waitFor();
    await phone.waitForTimeout(2500);record=await LiveSession.findById(record._id).lean();assert.equal(record.status,'live');
    assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await phone.screenshot({path:`test-results/live-phone-${name}-${width}.png`,fullPage:true});
    await Promise.all([phone.waitForResponse(r=>r.url().endsWith('/end')&&r.status()===200),phone.getByRole('button',{name:'■ End live session',exact:true}).click()]);await phone.getByRole('button',{name:'Enable camera preview',exact:true}).waitFor();
    assert.equal((await LiveSession.findById(record._id)).open,false);assert.ok(await phone.evaluate(()=>window.fixtureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
    await viewerContext.close();assert.deepEqual(errors,[]);
    console.log(`PASS ${name}/${width}: phone startup without self-call, actual remote video, camera flip, stop and track cleanup`);
   }catch(error){await phone.screenshot({path:`test-results/live-phone-failure-${name}-${width}.png`,fullPage:true});console.log('PHONE FAILURE',await phone.locator('main').innerText(),errors);throw error;}finally{await context.close();}
  }}finally{await browser.close();}
 }
}finally{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();await replica.stop();}
