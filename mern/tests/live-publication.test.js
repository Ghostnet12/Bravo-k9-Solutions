import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationInput, publicationAdvances } from '../shared/live-publication.js';
const id = '70b72f56-08a3-4b23-92de-4db95cb82554';
const frame = count => ({ id, kind: 'camera', framesCaptured: count });
test('camera publication requires genuine advancing samples, not permission or a repeated frame count', () => {
  for (const current of [undefined, frame(0), frame(1)]) assert.equal(publicationAdvances(current), false);
  assert.equal(publicationAdvances(frame(2)), true);
  assert.equal(publicationAdvances(frame(8), frame(2)), true);
  assert.equal(publicationAdvances(frame(8), frame(8)), false);
  assert.equal(publicationAdvances(frame(2), frame(8)), false);
});
test('old open sessions retain their two-counter checks without confusing camera frames with network encoding', () => {
  const old = { id, framesEncoded: 3, framesDecoded: 3 };
  assert.equal(publicationAdvances(old), true);
  assert.equal(publicationAdvances(old, old), false);
  assert.equal(publicationAdvances({ ...old, framesEncoded: 4 }, old), false);
  assert.equal(publicationAdvances({ ...old, framesEncoded: 4, framesDecoded: 4 }, old), true);
  assert.equal(publicationAdvances(frame(10), old), false);
  assert.equal(publicationAdvances(old, frame(2)), false);
});
test('strict publication schema rejects mixed, missing, unknown, unsafe and false-success counters', () => {
  assert.deepEqual(publicationInput.parse(frame(4)), frame(4));
  for (const bad of [{ id, kind:'camera' }, { ...frame(4), framesEncoded:4 }, { ...frame(4), kind:'network' }, frame(-1), frame(1.5), frame(Infinity), frame(Number.MAX_SAFE_INTEGER+1), { ...frame(2), id:'anything' }, { id, framesEncoded:2 }]) assert.equal(publicationInput.safeParse(bad).success, false);
});
