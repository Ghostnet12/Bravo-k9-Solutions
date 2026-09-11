import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_IMAGE_KEY, SITE_IMAGE_MAX_BYTES, isImageEditor, sourceImageKey, defaultSiteImage, DAVID_IMAGE } from '../shared/site-images.js';
test('only staff and owners are image editors', () => {
  for (const role of ['staff', 'owner']) assert.equal(isImageEditor({ role }), true);
  for (const role of ['member', 'customer', 'admin', 'OWNER', '', null, undefined]) assert.equal(isImageEditor({ role }), false);
  assert.equal(isImageEditor(null), false);
});
test('image keys reject traversal and unsafe URL contents', () => {
  for (const key of ['home-hero', 'team-6aa290cbd066f8feb3c1964f', 'asset-bravo-logo-small.webp']) assert.equal(SITE_IMAGE_KEY.test(key), true);
  for (const key of ['../users', 'a/b', '<script>', '', 'a'.repeat(121), 'a?b', 'a:b']) assert.equal(SITE_IMAGE_KEY.test(key), false);
});
test('source keys never permit arbitrary external or private resources', () => {
  const origin = 'https://bravounleashed.com';
  assert.equal(sourceImageKey('/images/bravo-logo-small.webp', origin), 'asset-bravo-logo-small.webp');
  assert.equal(sourceImageKey('/api/lessons/heel/image', origin), 'lesson-heel');
  for (const path of ['https://example.com/images/a.webp', '//example.com/images/a.webp', 'data:image/svg+xml,<svg/>', '/api/auth/me', '/images/../../api/auth/me']) assert.equal(sourceImageKey(path, origin), null);
});
test('generic trainer scenes use the approved David image, not Ashley or branding', () => {
  for (const name of ['obedience-real-world', 'training-education', 'protection-training', 'service-dog-training', 'tracking-training', 'hero-bravo-k9']) assert.equal(defaultSiteImage(`/images/${name}.webp`), DAVID_IMAGE);
  for (const source of ['/images/ashley-northrop.webp', '/images/janet-hughes.webp', '/images/bravo-logo-small.webp', '/images/dog-sitting-care.webp', '/api/lessons/heel/image']) assert.equal(defaultSiteImage(source), source);
});
test('3 MB encoded photo fits beneath a 4.5 MB serverless request envelope', () => {
  assert.ok(Math.ceil(SITE_IMAGE_MAX_BYTES / 3) * 4 + 2048 < 4500000);
});
