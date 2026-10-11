import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraReady, createPublisherHealth, PHONE_VIDEO } from '../client/src/live-capture-health.js';
function fixture({ callback = true, frozen = false } = {}) {
  const track = { readyState:'live', enabled:true, muted:false };
  const stream = { getVideoTracks: () => [track] };
  let frames=0, timer=0; const timers=new Map();
  const video = { srcObject:stream, paused:false, readyState:2, videoWidth:640,
    play: async()=>{}, getVideoPlaybackQuality:()=>({ totalVideoFrames: frames, droppedVideoFrames:0 }),
    cancelVideoFrameCallback:id=>{clearTimeout(timers.get(id));timers.delete(id);},
  };
  if(callback)video.requestVideoFrameCallback=cb=>{const id=++timer;if(!frozen)timers.set(id,setTimeout(()=>{timers.delete(id);frames++;cb();},10));return id;};
  let advancing;
  if(!callback&&!frozen)advancing=setInterval(()=>frames++,10);
  return { track, stream, video, clear:()=>{clearInterval(advancing);for(const t of timers.values())clearTimeout(t);}, pending:()=>timers.size };
}
test('camera health is based on new media frames and cleans up without a second peer connection', async t => {
  const before=globalThis.document;globalThis.document={visibilityState:'visible'};
  try {
    await t.test('frame callbacks advance; stopped track, paused preview and hidden document do not', async()=>{
      const f=fixture();let health;
      try{health=await createPublisherHealth(()=>f.stream,f.video);const first=await health.sample();assert.equal(first.kind,'camera');assert.ok(first.framesCaptured>=2);assert.equal(first.framesEncoded,undefined);
        for(const state of ['paused','muted','hidden']){f.video.paused=state==='paused';f.track.muted=state==='muted';document.visibilityState=state==='hidden'?'hidden':'visible';const initial=(await health.sample()).framesCaptured;await new Promise(r=>setTimeout(r,35));assert.equal((await health.sample()).framesCaptured,initial);}
        document.visibilityState='visible';f.track.muted=false;f.video.paused=false;await new Promise(r=>setTimeout(r,35));assert.ok((await health.sample()).framesCaptured>first.framesCaptured);
        health.disconnect();assert.equal(f.pending(),0);assert.equal(f.track.readyState,'live','observer cleanup does not turn off the user camera');await assert.rejects(health.sample(),{code:'CAMERA_CANCELLED'});
      }finally{health?.disconnect();f.clear();document.visibilityState='visible';}
    });
    await t.test('older-browser decoded counter fallback must actually advance',async()=>{const f=fixture({callback:false});let h;try{h=await createPublisherHealth(()=>f.stream,f.video);assert.ok((await h.sample()).framesCaptured>=2);}finally{h?.disconnect();f.clear();}});
    await t.test('frozen frames cannot pass even with live and enabled camera flags',async()=>{const f=fixture({frozen:true});try{await assert.rejects(createPublisherHealth(()=>f.stream,f.video,{timeoutMs:30}),{code:'CAMERA_NO_FRAMES'});}finally{f.clear();}});
    await t.test('denied playback remains retryable and does not create health evidence',async()=>{const f=fixture({frozen:true});f.video.play=async()=>{throw Object.assign(new Error('Blocked'),{name:'NotAllowedError'});};try{await assert.rejects(createPublisherHealth(()=>f.stream,f.video,{timeoutMs:250}),{code:'CAMERA_PLAYBACK_BLOCKED'});}finally{f.clear();}});
    await t.test('aborting pending startup closes the observer',async()=>{const f=fixture({frozen:true}),controller=new AbortController();const pending=createPublisherHealth(()=>f.stream,f.video,{signal:controller.signal});controller.abort();try{await assert.rejects(pending,{code:'CAMERA_CANCELLED'});assert.equal(f.pending(),0);}finally{f.clear();}});
    await t.test('missing metrics or a muted camera do not silently succeed',async()=>{const f=fixture({callback:false,frozen:true});delete f.video.getVideoPlaybackQuality;try{await assert.rejects(createPublisherHealth(()=>f.stream,f.video),{code:'CAMERA_METRICS_UNAVAILABLE'});f.track.muted=true;assert.equal(cameraReady(f.stream),false);await assert.rejects(createPublisherHealth(()=>f.stream,f.video),{code:'CAMERA_NOT_READY'});}finally{f.clear();}});
  }finally{globalThis.document=before;}
});
test('phone video profile bounds frame rate and uses a modest capture resolution',()=>{assert.equal(PHONE_VIDEO.width.ideal,640);assert.equal(PHONE_VIDEO.height.ideal,360);assert.equal(PHONE_VIDEO.frameRate.ideal,15);assert.equal(PHONE_VIDEO.frameRate.max,20);});
