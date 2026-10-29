import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { siteImageRendition } from '../server/site-image-rendition.js';

const photos = [
  { _id: 'team-ashley-northrop', current: { uploadId: 'df41d42d-76b5-45b1-a94e-681ae038cc55' } },
  { _id: 'hero-photo-09a4e693-7c6e-4ebb-9bc1-5a7d122ecdc6', current: { uploadId: 'e4deab5a-af96-446f-8d81-ab7aeb967bbd' } },
  { _id: 'home-training-hero', current: { uploadId: 'a5e35ce4-8348-48ed-ada0-e2f0111a53a3' } },
];

test('photo copies follow exact upload identities and slots, independently of framing revisions', () => {
  for (const photo of photos) {
    const src = siteImageRendition(photo);
    assert.match(src, /^\/assets\/bravo-photo-[a-f0-9]{12}\.webp$/);
    assert.equal(siteImageRendition({ ...photo, revision: 42, current: { ...photo.current, x: 22, zoom: 1.3 } }), src);
    assert.equal(siteImageRendition({ ...photo, current: { uploadId: 'replacement-upload' } }), null);
    for (const _id of ['team-someone-else', 'lesson-private', 'background-11111111-1111-1111-1111-111111111111', undefined]) {
      assert.equal(siteImageRendition({ ...photo, _id }), null);
    }
  }
  for (const value of [null, {}, { current: {} }, { current: { uploadId: 123 } }]) assert.equal(siteImageRendition(value), null);
});

test('published copies are small WebP assets with content-matching immutable names', async () => {
  for (const photo of photos) {
    const src = siteImageRendition(photo);
    const bytes = await readFile(new URL(`../client/public${src}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length < 250 * 1024);
    assert.ok(src.includes(createHash('sha256').update(bytes).digest('hex').slice(0, 12)));
  }
});
