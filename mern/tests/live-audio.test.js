import test from 'node:test';
import assert from 'node:assert/strict';
import { claimLiveAudio, releaseLiveAudio } from '../client/src/live-audio.js';
test('an asynchronous pause from the previous clip cannot release the new clip audio focus', async () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const events = [];
  const first = { muted: false, volume: 1, pause() { queueMicrotask(() => releaseLiveAudio(first)); } };
  const second = { muted: false, volume: 1, pause() { queueMicrotask(() => releaseLiveAudio(second)); } };
  globalThis.window = { dispatchEvent: event => events.push(event.detail.active) };
  globalThis.document = { querySelectorAll: () => [first, second] };
  try {
    claimLiveAudio(first); await Promise.resolve();
    claimLiveAudio(second); await Promise.resolve();
    assert.deepEqual(events, [true, true]);
    releaseLiveAudio(first); assert.equal(events.at(-1), true);
    releaseLiveAudio(second); assert.equal(events.at(-1), false);
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
