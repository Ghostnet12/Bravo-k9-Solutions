// HTTP-level authorization and upload contract checks, with database calls mocked.
// This suite never connects to Atlas or substitutes for real persistence tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../server/app.js';
import { digest } from '../server/auth.js';
import { ALL_MODELS, User, Session, RateBucket, Settings, Subscription, CommunityGroup, GroupMessage, DirectMessage, Lesson, MediaUpload, MediaChunk, Booking } from '../server/models.js';
const origin = 'http://localhost:5173';
const ids = { owner: '6aa290cbd066f8feb3c1964f', staff: '111111111111111111111111', member: '222222222222222222222222', other: '333333333333333333333333' };
function query(value) {
  const chain = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const key of ['select', 'lean', 'sort', 'limit', 'session', 'populate']) chain[key] = () => chain;
  return chain;
}
test('owner/staff workspace contracts over HTTP with isolated model mocks', async t => {
  const previous = { uri: process.env.MONGODB_URI, origin: process.env.APP_ORIGIN, ownerId: process.env.OWNER_USER_ID };
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/no_network_test'; process.env.APP_ORIGIN = origin; process.env.OWNER_USER_ID = ids.owner;
  t.after(() => { for (const [key, value] of Object.entries({ MONGODB_URI: previous.uri, APP_ORIGIN: previous.origin, OWNER_USER_ID: previous.ownerId })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  t.mock.method(mongoose, 'connect', async () => mongoose);
  t.mock.method(mongoose.connection, 'transaction', async work => work({}));
  for (const model of ALL_MODELS) t.mock.method(model, 'init', async () => model);
  const users = Object.fromEntries(Object.entries(ids).map(([role, id]) => [id, { _id: id, role: role === 'other' ? 'member' : role, name: role, email: `${role}@example.test`, blocked: false, save: async function() { return this; } }]));
  t.mock.method(User, 'findById', id => query(users[String(id)] || null));
  t.mock.method(User, 'findByIdAndUpdate', (id, change) => { Object.assign(users[id], change.$set); return query(users[id]); });
  t.mock.method(User, 'exists', filter => query(users[String(filter._id)] && !users[String(filter._id)].blocked ? { _id: filter._id } : null));
  t.mock.method(User, 'find', () => query(Object.values(users)));
  t.mock.method(Session, 'findOne', filter => query(Object.entries(ids).find(([token]) => digest(token) === filter.tokenHash) ? { userId: ids[Object.entries(ids).find(([token]) => digest(token) === filter.tokenHash)[0]] } : null));
  t.mock.method(Session, 'deleteMany', async () => ({ deletedCount: 1 }));
  t.mock.method(RateBucket, 'findOneAndUpdate', async () => ({ count: 1 }));
  t.mock.method(Settings, 'updateOne', async () => ({}));
  t.mock.method(Settings, 'findById', () => query({ enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['09:00'] }));
  t.mock.method(Subscription, 'find', () => query([]));
  const call = (role, method, path, body) => {
    const req = request(app)[method](path).set('Origin', origin);
    if (role) req.set('Cookie', `bravo_session=${role}`);
    return body === undefined ? req : req.send(body);
  };
  await t.test('owner can promote/demote, staff and clients cannot grant access', async () => {
    for (const role of ['member', 'staff']) await call(role, 'patch', `/api/admin/users/${ids.other}`, { role: 'staff' }).expect(403);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'staff' }).expect(200);
    assert.equal(users[ids.other].role, 'staff');
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'member' }).expect(200);
    await call('other', 'get', '/api/admin/lessons').expect(403);
    await call('owner', 'patch', `/api/admin/users/${ids.owner}`, { role: 'member' }).expect(400);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'owner' }).expect(400);
  });
  await t.test('owner bootstrap uses the existing record, not a registrant email', async () => {
    users[ids.other].email = 'nortda85@gmail.com';
    const other = await call('other', 'get', '/api/auth/me').expect(200); assert.equal(other.body.user.role, 'member');
    users[ids.owner].role = 'staff';
    const owner = await call('owner', 'get', '/api/auth/me').expect(200); assert.equal(owner.body.user.role, 'owner');
  });
  await t.test('block revokes protected access and mute stops room and group posting', async () => {
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { blocked: true }).expect(200);
    await call('other', 'post', '/api/community', { body: 'Blocked' }).expect(401);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { blocked: false, mutedUntil: new Date(Date.now() + 60000).toISOString() }).expect(200);
    // The real database casts this field to Date; mimic that boundary in the mock.
    users[ids.other].mutedUntil = new Date(users[ids.other].mutedUntil);
    await call('other', 'post', '/api/community', { body: 'Muted' }).expect(403);
    await call('other', 'post', '/api/groups', { name: 'Muted group' }).expect(403);
    await call('other', 'post', '/api/direct', { body: 'Muted private' }).expect(403);
  });
  await t.test('staff cannot enter another group through its member editor', async () => {
    const group = { _id: ids.other, ownerId: ids.member, members: [ids.member], archived: false, save: async () => {} };
    t.mock.method(CommunityGroup, 'findById', () => query(group));
    await call('staff', 'patch', `/api/groups/${ids.other}`, { members: [ids.staff] }).expect(404);
    await call('member', 'patch', `/api/groups/${ids.other}`, { members: [] }).expect(200);
    await call('owner', 'patch', `/api/groups/${ids.other}`, { members: [ids.staff] }).expect(200);
  });
  await t.test('only owner can hide room or group messages', async () => {
    for (const role of ['staff', 'member']) {
      await call(role, 'delete', `/api/community/${ids.other}`, {}).expect(403);
      await call(role, 'delete', `/api/groups/${ids.other}/messages/${ids.member}`, {}).expect(403);
    }
    const update = t.mock.method(GroupMessage, 'updateOne', async () => ({}));
    await call('owner', 'delete', `/api/groups/${ids.other}/messages/${ids.member}`, {}).expect(200);
    assert.deepEqual(update.mock.calls[0].arguments[0], { _id: ids.member, groupId: ids.other });
  });
  await t.test('a member cannot read or send as another member in private support', async () => {
    const read = t.mock.method(DirectMessage, 'find', () => query([]));
    await call('member', 'get', `/api/direct?memberId=${ids.other}`).expect(200);
    assert.equal(read.mock.calls[0].arguments[0].memberId, ids.member);
    const write = t.mock.method(DirectMessage, 'create', async () => ({}));
    await call('member', 'post', '/api/direct', { memberId: ids.other, body: 'Help me' }).expect(201);
    assert.equal(write.mock.calls[0].arguments[0].memberId, ids.member);
  });
  await t.test('checkout and owner refunds cannot initiate payments while paused', async () => {
    const config = await call(null, 'get', '/api/config').expect(200);
    assert.equal(config.body.paymentsReady, false); assert.equal(config.body.paymentsPaused, true);
    await call('member', 'post', `/api/bookings/${ids.other}/checkout`, {}).expect(503);
    await call('owner', 'post', `/api/admin/bookings/${ids.other}/refund`, {}).expect(503);
    await call('staff', 'post', `/api/admin/bookings/${ids.other}/refund`, {}).expect(403);
  });
  await t.test('members cannot upload, invalid chunk counts and oversized photos fail', async () => {
    const input = { lessonId: 'test', kind: 'image', filename: 'cover.png', contentType: 'image/png', size: 8, chunks: 1 };
    await call('member', 'post', '/api/admin/media/start', input).expect(403);
    await call('staff', 'post', '/api/admin/media/start', { ...input, chunks: 2 }).expect(400);
    await call('staff', 'post', '/api/admin/media/start', { ...input, size: 5 * 1024 * 1024, chunks: 13 }).expect(400);
    t.mock.method(MediaUpload, 'countDocuments', async () => 0);
    t.mock.method(Lesson, 'exists', async () => ({ _id: 'test' }));
    const create = t.mock.method(MediaUpload, 'create', async data => data);
    await call('staff', 'post', '/api/admin/media/start', input).expect(201);
    assert.equal(create.mock.calls[0].arguments[0].uploadedBy, ids.staff);
  });
  await t.test('a renamed executable cannot be uploaded as a photo', async () => {
    t.mock.method(MediaUpload, 'findOneAndUpdate', async () => ({ _id: 'test-upload', size: 8, chunks: 1, contentType: 'image/png', expiresAt: new Date(Date.now() + 100000) }));
    const write = t.mock.method(MediaChunk, 'updateOne', async () => ({}));
    await call('staff', 'put', '/api/admin/media/test-upload/chunks/0', { data: Buffer.from('<script>').toString('base64') }).expect(400);
    assert.equal(write.mock.callCount(), 0);
    await call('staff', 'put', '/api/admin/media/test-upload/chunks/0', { data: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') }).expect(200);
    assert.equal(write.mock.calls[0].arguments[1].$set.size, 8);
  });
  await t.test('draft covers are not public and video requires server-side membership', async () => {
    const read = t.mock.method(Lesson, 'findOne', () => query(null));
    await call(null, 'get', '/api/lessons/test/image').expect(404);
    assert.equal(read.mock.calls[0].arguments[0].published, true);
    await call('member', 'get', '/api/lessons/test/video').expect(403);
  });
  await t.test('staff can reassign visits but members cannot', async () => {
    const booking = { _id: ids.other, status: 'confirmed', save: async function() { return this; } };
    t.mock.method(Booking, 'findOne', () => query(booking));
    await call('member', 'patch', `/api/admin/bookings/${ids.other}/assignment`, { staffId: ids.staff }).expect(403);
    await call('staff', 'patch', `/api/admin/bookings/${ids.other}/assignment`, { staffId: ids.owner }).expect(200);
    assert.equal(booking.staffId, ids.owner);
  });
  await t.test('registration ignores injected staff, owner, and moderation fields', async () => {
    const create = t.mock.method(User, 'create', async data => ({ ...data, _id: ids.other, role: 'member' }));
    t.mock.method(Session, 'create', async () => ({}));
    const result = await call(null, 'post', '/api/auth/register', { name: 'New Client', email: 'new@example.test', password: 'Test-only-long-password!', role: 'owner', showPhone: true, blocked: false }).expect(201);
    assert.equal(result.body.user.role, 'member');
    const data = create.mock.calls[0].arguments[0];
    assert.equal(data.role, undefined); assert.equal(data.blocked, undefined); assert.equal(data.showPhone, undefined);
    assert.ok(data.passwordHash); assert.equal(result.body.user.passwordHash, undefined);
  });
  await t.test('upload completion attaches media atomically and removes expiry', async () => {
    const upload = { _id: 'finished-upload', lessonId: 'test', uploadedBy: ids.staff, size: 8, chunks: 1, kind: 'image', filename: 'cover.png', contentType: 'image/png', completed: false, expiresAt: new Date(Date.now() + 60000), save: async function() { return this; } };
    const lesson = { _id: 'test', published: false, save: async function() { return this; } };
    t.mock.method(MediaUpload, 'findOne', () => query(upload));
    t.mock.method(MediaChunk, 'find', () => query([{ index: 0, size: 8 }]));
    t.mock.method(MediaChunk, 'findOne', () => query({ data: Buffer.from('89504e470d0a1a0a', 'hex') }));
    const expiry = t.mock.method(MediaChunk, 'updateMany', async () => ({}));
    t.mock.method(Lesson, 'findById', () => query(lesson));
    await call('staff', 'post', '/api/admin/media/finished-upload/complete', {}).expect(200);
    assert.equal(lesson.imageUpload, 'finished-upload'); assert.equal(lesson.published, false);
    assert.equal(upload.completed, true); assert.equal(upload.expiresAt, undefined);
    assert.deepEqual(expiry.mock.calls[0].arguments[1], { $unset: { expiresAt: 1 } });
    await call('staff', 'post', '/api/admin/media/finished-upload/complete', {}).expect(200);
  });
  await t.test('media delivery streams exact ranges across chunk boundaries', async () => {
    const chunkSize = 400 * 1024, bytes = Buffer.alloc(chunkSize + 50, 73);
    const chunks = [{ index: 0, data: bytes.subarray(0, chunkSize) }, { index: 1, data: bytes.subarray(chunkSize) }];
    t.mock.method(Lesson, 'findOne', () => query({ _id: 'streamed', published: true, imageUpload: 'streamed-cover' }));
    t.mock.method(MediaUpload, 'findOne', () => query({ _id: 'streamed-cover', size: bytes.length, contentType: 'image/png', kind: 'image', completed: true }));
    t.mock.method(MediaChunk, 'find', filter => {
      const chain = query(null), selected = chunks.filter(chunk => chunk.index >= filter.index.$gte && chunk.index <= filter.index.$lte);
      chain.cursor = () => ({ close: async () => {}, async *[Symbol.asyncIterator]() { yield* selected; } }); return chain;
    });
    const result = await call(null, 'get', '/api/lessons/streamed/image').set('Range', `bytes=${chunkSize - 10}-${chunkSize + 9}`).expect(206);
    assert.equal(result.body.length, 20); assert.deepEqual(result.body, bytes.subarray(chunkSize - 10, chunkSize + 10));
    assert.equal(result.headers['content-range'], `bytes ${chunkSize - 10}-${chunkSize + 9}/${bytes.length}`);
    await call(null, 'get', '/api/lessons/streamed/image').set('Range', 'bytes=99999999-').expect(416);
  });
});
