import test from 'node:test';
import assert from 'node:assert/strict';
import { codecProbeSupported, startCodecProbe } from '../client/src/publisher-codec.js';

test('camera health does not claim codec support in a non-media runtime', () => {
  assert.equal(codecProbeSupported(), false);
});
test('partial browser support is not mistaken for the complete health pipeline', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder');
  try {
    globalThis.VideoEncoder = class {};
    assert.equal(codecProbeSupported(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'VideoEncoder', original);
    else delete globalThis.VideoEncoder;
  }
});
test('an unsupported probe releases its owned camera clone and never returns fake frame counts', async () => {
  let stopped = 0;
  await assert.rejects(startCodecProbe({ stop() { stopped++; } }), { name: 'NotSupportedError' });
  assert.equal(stopped, 1);
});
