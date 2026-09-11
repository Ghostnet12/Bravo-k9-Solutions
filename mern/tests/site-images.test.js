import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_IMAGE_KEY, SITE_IMAGE_MAX_BYTES, isImageEditor, isEditableMediaKey, sourceImageKey, sourceVideoKey, videoTarget, defaultSiteImage, normalizeFraming, mediaSettingsChanged, framingStyle } from '../shared/site-images.js';
test('only owner and delegated administrator capabilities can edit media', () => {
  assert.equal(isImageEditor({ role: 'owner', isPrimaryOwner: true }), true);
  assert.equal(isImageEditor({ role: 'owner', isPrimaryOwner: false, publicRole: 'staff' }), true);
  for (const role of ['staff', 'member', 'customer', 'admin', 'OWNER', '', null, undefined]) assert.equal(isImageEditor({ role, title: 'Administrator' }), false);
  assert.equal(isImageEditor({ role: 'owner', blocked: true }), false);
  assert.equal(isImageEditor(null), false);
});
test('image keys reject traversal and unsafe URL contents', () => {
  for (const key of ['home-hero', 'team-david-northrop', 'asset-bravo-logo-small.webp']) assert.equal(SITE_IMAGE_KEY.test(key), true);
  for (const key of ['../users', 'a/b', '<script>', '', 'a'.repeat(121), 'a?b', 'a:b']) assert.equal(SITE_IMAGE_KEY.test(key), false);
});
test('source keys cannot redirect to external or private account resources', () => {
  const origin = 'https://bravounleashed.com';
  assert.equal(sourceImageKey('/images/bravo-logo-small.webp', origin), null);
  assert.equal(sourceImageKey('/images/training-education.webp', origin), 'asset-training-education.webp');
  assert.equal(sourceImageKey('/api/lessons/heel/image', origin), 'lesson-heel');
  for (const path of ['https://example.com/images/a.webp', '//example.com/images/a.webp', 'data:image/svg+xml,<svg/>', '/api/auth/me', '/images/../../api/auth/me']) assert.equal(sourceImageKey(path, origin), null);
});
test('media editor accepts photos and videos but excludes logos and UI artwork', () => {
  for (const key of ['home-hero', 'home-method', 'team-ashley-northrop', 'lesson-loose-leash', 'asset-training-education.webp', 'video-lesson-heel']) assert.equal(isEditableMediaKey(key), true);
  for (const key of ['asset-bravo-logo-small.webp', 'asset-bravo-logo.png', 'icon-phone', 'favicon.ico', '../hero']) assert.equal(isEditableMediaKey(key), false);
});
test('all original section photos, hero and approved portraits stay unchanged', () => {
  for (const name of ['hero-bravo-launch', 'david-northrop', 'ashley-northrop', 'janet-hughes', 'obedience-real-world', 'training-education', 'protection-training', 'service-dog-training', 'tracking-training', 'hero-bravo-k9', 'dog-sitting-care', 'bravo-logo-small']) {
    const source = `/images/${name}.webp`; assert.equal(defaultSiteImage(source), source);
  }
});
test('small horizontal, vertical, zoom, fit and description changes each mark an edit', () => {
  const before = normalizeFraming();
  for (const change of [{ x: 50.1 }, { y: 50.1 }, { zoom: 1.01 }, { fit: 'contain' }, { alt: 'Updated description' }]) assert.equal(mediaSettingsChanged(before, { ...before, ...change }), true);
  assert.equal(mediaSettingsChanged(before, { ...before, x: '50', zoom: '1.00' }), false);
  assert.equal(mediaSettingsChanged(before, before), false);
});
test('legacy saved photos default to normal zoom', () => {
  assert.equal(normalizeFraming({ x: 61, y: 26, fit: 'cover' }).zoom, 1);
  assert.equal(normalizeFraming({ zoom: NaN }).zoom, 1);
});
test('zoom clipping stays inside the original box for off-center focal points', () => {
  const style = framingStyle({ zoom: 2, x: 20, y: 80 });
  assert.equal(style.transform, 'scale(2)');
  assert.equal(style.transformOrigin, '20% 80%');
  assert.equal(style.clipPath, 'inset(40% 40% 10% 10%)');
  assert.equal(framingStyle({ zoom: 1 }).clipPath, 'none');
});
test('video locations preserve protected lesson URLs and reject unrelated destinations', () => {
  const origin = 'https://bravounleashed.com';
  assert.equal(sourceVideoKey('/api/lessons/heel/video?v=2', origin), 'video-lesson-heel');
  assert.deepEqual(videoTarget('video-lesson-heel'), { lessonId: 'heel', source: '/api/lessons/heel/video' });
  assert.equal(sourceVideoKey('/videos/intro.mp4', origin), 'video-asset-intro.mp4');
  for (const source of ['/api/auth/me', 'https://other.example/api/lessons/heel/video', '/api/lessons/heel/captions', '/videos/../../api/auth/me']) assert.equal(sourceVideoKey(source, origin), null);
  assert.equal(videoTarget('video-lesson-../private'), null);
});
test('photo body and video chunks stay within the serverless upload envelope', () => {
  assert.ok(Math.ceil(SITE_IMAGE_MAX_BYTES / 3) * 4 + 2048 < 4500000);
});
