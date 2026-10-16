import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicVolume } from '../client/src/music-volume.js';
const desktop = { userAgent: 'Desktop browser', platform: 'Linux', maxTouchPoints: 0 };
test('volume changes actual media level, zero mutes, and unmute restores the last audible level', () => {
  const audio = { volume: 1, muted: false }, control = createMusicVolume(audio, { volume: .6 }, desktop);
  assert.equal(control.supported, true);assert.equal(audio.volume, .6);
  control.set(.25);assert.equal(audio.volume, .25);assert.equal(audio.muted, false);
  control.set(0);assert.equal(audio.volume, 0);assert.equal(audio.muted, true);
  control.toggleMute();assert.deepEqual(control.snapshot(), {volume:.25,muted:false});assert.equal(audio.volume,.25);
  control.toggleMute();control.set(.4);assert.equal(audio.muted,false);
  control.set(NaN);assert.equal(audio.volume,.4);
  control.set(9);assert.equal(audio.volume,1);
});
test('saved volume and mute survive a new player without changing the saved level', () => {
  const first=createMusicVolume({volume:1,muted:false},{volume:.35},desktop);first.toggleMute();
  const audio={volume:1,muted:false},second=createMusicVolume(audio,first.snapshot(),desktop);
  assert.deepEqual(second.snapshot(),{volume:.35,muted:true});assert.equal(audio.volume,.35);
  second.toggleMute();assert.equal(audio.muted,false);
});
test('iPhone and desktop-mode iPad use device controls while mute remains available', () => {
  for(const device of [{userAgent:'Mozilla iPhone',platform:'iPhone',maxTouchPoints:5},{userAgent:'Safari',platform:'MacIntel',maxTouchPoints:5}]){
    const audio={volume:1,muted:false},control=createMusicVolume(audio,{volume:.4},device);
    assert.equal(control.supported,false);control.set(.1);assert.equal(audio.volume,1);
    control.toggleMute();assert.equal(audio.muted,true);control.toggleMute();assert.equal(audio.muted,false);
  }
});
test('a browser that ignores or rejects volume writes falls back without breaking playback', () => {
  for(const rejects of [false,true]){
    const audio={get volume(){return 1;},set volume(_value){if(rejects)throw new Error('Device volume only');},muted:false};
    const control=createMusicVolume(audio,{},desktop);assert.equal(control.supported,false);
    control.toggleMute();assert.equal(audio.muted,true);
  }
});
