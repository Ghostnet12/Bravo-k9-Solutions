import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('detail pages preserve proof, training and booking content', async () => {
  const source = await readFile(new URL('../client/src/BravoPages.tsx', import.meta.url), 'utf8');
  const proof = source.indexOf('id="reviews"');
  const training = source.indexOf('id="training"');
  assert.ok(training > 0 && proof > training);
  assert.match(source, /Verified Bravo account/);
  assert.match(source, /We train where life happens/);
  assert.match(source, /href="\/portal\?program=training"/);
  assert.match(source, /Start training with Bravo/);
  assert.equal((source.match(/id="reviews"/g) || []).length, 1);
  assert.match(source, /<ProofVideoCarousel\/>/);
});

test('proof cards link directly to the original videos without blank third-party players', async () => {
  const source = await readFile(new URL('../client/src/ProofVideoCarousel.tsx', import.meta.url), 'utf8');
  assert.match(source, /<a className="home-work-proof-play" href=\{clip.facebookUrl!\} aria-label=/);
  assert.match(source, /Watch \$\{clip.title\} on Facebook/);
  assert.doesNotMatch(source, /target="_blank"|opens in a new tab/);
  assert.doesNotMatch(source, /<iframe|activeProofReel|plugins\/video\.php/);
});

test('detail pages keep specialist choices subordinate and do not invent credentials', async () => {
  const source = await readFile(new URL('../client/src/BravoPages.tsx', import.meta.url), 'utf8');
  assert.match(source, /const secondary = \['aggression'\]/);
  assert.match(source, /team\.map\(person/);
  assert.doesNotMatch(source, /certified|award-winning|years of experience/i);
});

test('mobile booking and accessibility controls reserve separate safe areas', async () => {
  const css = await readFile(new URL('../client/src/professional.css', import.meta.url), 'utf8');
  assert.match(css, /body:has\(\.booking-page\) \.accessibility-tools\{bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css, /body:has\(\.booking-page\) \.bravo-footer\{padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)\}/);
});
