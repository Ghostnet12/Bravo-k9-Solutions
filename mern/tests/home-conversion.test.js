import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('homepage puts verified proof before the primary training decision', async () => {
  const source = await readFile(new URL('../client/src/Home.tsx', import.meta.url), 'utf8');
  const proof = source.indexOf('id="reviews"');
  const training = source.indexOf('id="training"');
  assert.ok(proof > 0 && training > proof);
  assert.match(source, /Verified Bravo account/);
  assert.match(source, /Published reviews are tied to real Bravo client accounts/);
  assert.match(source, /href="\/portal\?program=training"/);
  assert.match(source, /Start with private training/);
  assert.equal((source.match(/id="reviews"/g) || []).length, 1);
});

test('homepage keeps specialist choices subordinate and does not invent credentials', async () => {
  const source = await readFile(new URL('../client/src/Home.tsx', import.meta.url), 'utf8');
  assert.match(source, /const secondary = \['walking', 'aggression'\]/);
  assert.match(source, /team\.slice\(0, 3\)/);
  assert.doesNotMatch(source, /certified|award-winning|years of experience/i);
});

test('mobile booking and accessibility controls reserve separate safe areas', async () => {
  const css = await readFile(new URL('../client/src/professional.css', import.meta.url), 'utf8');
  assert.match(css, /body:has\(\.booking-page\) \.accessibility-tools\{bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css, /body:has\(\.booking-page\) \.bravo-footer\{padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)\}/);
});
