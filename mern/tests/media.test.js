import test from 'node:test';
import assert from 'node:assert/strict';
import { Binary } from 'mongodb';
import { byteRange, mediaBytes, validMediaHeader, CHUNK_SIZE, MEDIA_LIMITS } from '../server/media.js';
import { requireOwner, requireStaff } from '../server/auth.js';

test('role boundaries deny clients and keep owner-only controls from staff', () => {
  for (const role of [undefined, 'member', 'staff']) assert.throws(() => requireOwner({ user: { role } }, {}, () => {}), { status: 403 });
  for (const role of ['staff', 'owner']) { let allowed = false; requireStaff({ user: { role } }, {}, () => { allowed = true; }); assert.ok(allowed); }
  assert.throws(() => requireStaff({ user: { role: 'member' } }, {}, () => {}), { status: 403 });
});
test('media conversion preserves exact bytes without exposing Buffer slab contents', () => {
  const source = Buffer.from('prefix-VIDEO-suffix'), view = source.subarray(7, 12);
  assert.equal(mediaBytes(view).toString(), 'VIDEO');
  assert.equal(mediaBytes(new Binary(view)).toString(), 'VIDEO');
  assert.equal(mediaBytes(new Uint8Array(source.buffer, source.byteOffset + 7, 5)).toString(), 'VIDEO');
});
test('byte ranges support Safari probes, suffixes, seeking, and reject invalid ranges', () => {
  assert.deepEqual(byteRange(undefined, 100), { start: 0, end: 99, partial: false });
  assert.deepEqual(byteRange('bytes=0-1', 100), { start: 0, end: 1, partial: true });
  assert.deepEqual(byteRange('bytes=50-', 100), { start: 50, end: 99, partial: true });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99, partial: true });
  assert.deepEqual(byteRange('bytes=90-120', 100), { start: 90, end: 99, partial: true });
  for (const range of ['bytes=100-', 'bytes=30-20', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6', 'invalid']) assert.equal(byteRange(range, 100), null);
});
test('uploaded formats are checked against file bytes, not just a client MIME label', () => {
  assert.ok(validMediaHeader('video/mp4', Buffer.from('000066747970', 'hex')) === false);
  assert.ok(validMediaHeader('video/mp4', Buffer.from('000000186674797069736f6d', 'hex')));
  assert.ok(validMediaHeader('image/png', Buffer.from('89504e470d0a1a0a', 'hex')));
  assert.ok(validMediaHeader('text/vtt', Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nHello')));
  for (const type of ['video/mp4', 'image/jpeg', 'image/svg+xml', 'text/vtt']) assert.equal(validMediaHeader(type, Buffer.from('<script>bad</script>')), false);
  assert.equal(CHUNK_SIZE, 409600); assert.ok(MEDIA_LIMITS.image < 4 * 1024 * 1024);
});
