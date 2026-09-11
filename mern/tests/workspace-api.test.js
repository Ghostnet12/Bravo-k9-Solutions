// HTTP-level authorization and upload contract checks, with database calls mocked.
// This suite never connects to Atlas or substitutes for real persistence tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../server/app.js';
import { ChatClear } from '../server/chat-clear.js';
import { digest } from '../server/auth.js';
import { ALL_MODELS, User, Session, RateBucket, Settings, ServiceSetting, Subscription, CommunityGroup, GroupMessage, DirectMessage, Message, Lesson, MediaUpload, MediaChunk, Booking, Review, AuditEvent } from '../server/models.js';
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
  t.mock.method(User, 'findOneAndUpdate', (filter, change) => {
    const current = users[String(filter._id)];
    if (!current || current.role !== filter.role || current.blocked !== filter.blocked) return query(null);
    const updated = { ...current, ...change.$set }; users[String(filter._id)] = updated;
    return query(updated);
  });
  const accessAudit = t.mock.method(AuditEvent, 'create', async events => events);
  t.mock.method(User, 'exists', filter => query(users[String(filter._id)] && !users[String(filter._id)].blocked ? { _id: filter._id } : null));
  t.mock.method(User, 'find', () => query(Object.values(users)));
  t.mock.method(Session, 'findOne', filter => query(Object.entries(ids).find(([token]) => digest(token) === filter.tokenHash) ? { userId: ids[Object.entries(ids).find(([token]) => digest(token) === filter.tokenHash)[0]] } : null));
  t.mock.method(Session, 'deleteMany', async () => ({ deletedCount: 1 }));
  t.mock.method(RateBucket, 'findOneAndUpdate', async () => ({ count: 1 }));
  t.mock.method(Settings, 'updateOne', async () => ({}));
  t.mock.method(Settings, 'findById', () => query({ enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['09:00'] }));
  t.mock.method(ServiceSetting, 'find', () => query([]));
  t.mock.method(Subscription, 'find', () => query([]));
  t.mock.method(ChatClear, 'findOne', () => query(null));
  t.mock.method(ChatClear, 'find', () => query([]));
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
  await t.test('staff can receive and lose full administrator privileges without an owner title', async () => {
    for (const role of ['staff', 'member']) {
      await call(role, 'patch', `/api/admin/users/${ids.other}`, { role: 'owner', confirmOwnerAccess: true }).expect(403);
      await call(role, 'get', '/api/admin/users').expect(403);
    }
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'owner', confirmOwnerAccess: true }).expect(400);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'staff', title: 'Behavior Specialist' }).expect(200);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'owner' }).expect(400);
    const promoted = await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'owner', confirmOwnerAccess: true }).expect(200);
    assert.equal(promoted.body.user.role, 'owner');
    assert.equal(promoted.body.user.publicRole, 'staff');
    assert.equal(promoted.body.user.isPrimaryOwner, false);
    assert.equal(promoted.body.user.title, 'Behavior Specialist');
    const event = accessAudit.mock.calls.at(-1).arguments[0][0];
    assert.equal(String(event.actorId), ids.owner);
    assert.deepEqual(event.details, { from: 'staff', to: 'owner' });
    assert.equal(event.targetId, ids.other);
    await call('other', 'get', '/api/admin/users').expect(200);
    // Delegates get real management privileges, not just a visible menu.
    await call('other', 'patch', `/api/admin/users/${ids.member}`, { role: 'staff' }).expect(200);
    await call('other', 'patch', `/api/admin/users/${ids.member}`, { role: 'owner', confirmOwnerAccess: true }).expect(200);
    await call('other', 'patch', `/api/admin/users/${ids.member}`, { role: 'member' }).expect(200);
    await call('other', 'patch', `/api/admin/users/${ids.owner}`, { role: 'member' }).expect(400);
    await call('other', 'patch', `/api/admin/users/${ids.owner}`, { blocked: true }).expect(400);
    await call('other', 'patch', `/api/admin/users/${ids.owner}`, { mutedUntil: new Date(Date.now() + 60000).toISOString() }).expect(400);
    await call('other', 'patch', `/api/admin/users/${ids.other}`, { role: 'staff' }).expect(400);
    await call('other', 'patch', `/api/admin/users/${ids.other}`, { blocked: true }).expect(400);
    const self = await call('other', 'get', '/api/auth/me').expect(200);
    assert.equal(self.body.user.publicRole, 'staff');
    const team = await call(null, 'get', '/api/team').expect(200);
    const delegate = team.body.team.find(person => person.id === ids.other);
    assert.equal(delegate.role, 'staff'); assert.equal(delegate.title, 'Behavior Specialist');
    assert.equal(team.body.team.find(person => person.id === ids.owner).role, 'owner');

    // Community/support role snapshots never publish delegated owner privileges.
    const roomCreate = t.mock.method(Message, 'create', async () => ({}));
    await call('other', 'post', '/api/community', { body: 'An administrator announcement.', kind: 'announcement' }).expect(201);
    assert.equal(roomCreate.mock.calls.at(-1).arguments[0].role, 'staff'); roomCreate.mock.restore();
    const directCreate = t.mock.method(DirectMessage, 'create', async () => ({}));
    await call('other', 'post', '/api/direct', { body: 'A private staff response.' }).expect(201);
    assert.equal(directCreate.mock.calls.at(-1).arguments[0].senderRole, 'staff'); directCreate.mock.restore();
    const groupLookup = t.mock.method(CommunityGroup, 'findOne', () => query({ _id: ids.member }));
    const groupCreate = t.mock.method(GroupMessage, 'create', async () => ({}));
    await call('other', 'post', `/api/groups/${ids.member}/messages`, { body: 'A group staff response.' }).expect(201);
    assert.equal(groupCreate.mock.calls.at(-1).arguments[0].role, 'staff'); groupCreate.mock.restore(); groupLookup.mock.restore();
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'staff' }).expect(200);
    await call('other', 'get', '/api/admin/users').expect(403);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'member' }).expect(200);
  });
  await t.test('blocked staff cannot gain administrator access and profile edits cannot escalate roles', async () => {
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'staff', blocked: true }).expect(200);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'owner', confirmOwnerAccess: true }).expect(400);
    await call('owner', 'patch', `/api/admin/users/${ids.other}`, { role: 'member', blocked: false }).expect(200);
    const fields = { name: users[ids.member].name, dogName: '', phone: '', address: '', role: 'owner', isPrimaryOwner: true, confirmOwnerAccess: true };
    await call('member', 'patch', '/api/auth/profile', fields).expect(200);
    assert.equal(users[ids.member].role, 'member');
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
  await t.test('owners and delegated administrators can create client-only accounts', async () => {
    const created = [];
    const create = t.mock.method(User, 'create', async data => { created.push(data); return { ...data, _id: '444444444444444444444444' }; });
    await call('staff', 'post', '/api/admin/users', { name: 'Assisted Client', email: 'assisted@example.test' }).expect(403);
    const ownerResult = await call('owner', 'post', '/api/admin/users', { name: 'Assisted Client', email: 'ASSISTED@example.test', role: 'owner', blocked: true }).expect(201);
    assert.equal(ownerResult.body.user.role, 'member'); assert.equal(ownerResult.body.user.email, 'assisted@example.test');
    assert.match(ownerResult.body.temporaryPassword, /^Bravo-[a-f\d]{18}!$/); assert.equal(ownerResult.body.user.passwordHash, undefined);
    assert.equal(created[0].role, 'member'); assert.equal(created[0].blocked, undefined); assert.ok(created[0].passwordHash);
    users[ids.other].role = 'owner';
    const delegateResult = await call('other', 'post', '/api/admin/users', { name: 'Second Client', email: 'second@example.test', phone: '605-555-0100' }).expect(201);
    assert.equal(delegateResult.body.user.publicRole, 'member'); assert.equal(created[1].phone, '605-555-0100');
    users[ids.other].role = 'member'; create.mock.restore();
  });
  await t.test('reviews use the signed-in identity and owner-only moderation', async () => {
    const saved = { _id: ids.other, userId: ids.member, authorName: 'member', rating: 5, body: 'A careful and helpful training experience.', hidden: false };
    const write = t.mock.method(Review, 'findOneAndUpdate', (_filter, change) => query({ ...saved, ...change.$set }));
    const result = await call('member', 'put', '/api/reviews/mine', { rating: 5, body: saved.body, authorName: 'Fake owner', userId: ids.owner }).expect(200);
    assert.equal(write.mock.calls[0].arguments[0].userId, ids.member);
    assert.equal(write.mock.calls[0].arguments[1].$set.authorName, 'member');
    assert.equal(result.body.review.rating, 5);
    await call('staff', 'patch', `/api/admin/reviews/${ids.other}`, { hidden: true }).expect(403);
  });
  await t.test('service pricing is owner-only and primary training stays fixed', async () => {
    for (const role of ['member', 'staff']) await call(role, 'patch', '/api/admin/services/walking', { cents: 1, enabled: true }).expect(403);
    await call('owner', 'patch', '/api/admin/services/training', { cents: 19999, enabled: true }).expect(400);
  });
  await t.test('editing a hidden review cannot bypass owner moderation', async () => {
    const write = t.mock.method(Review, 'findOneAndUpdate', (_filter, change) => query({ hidden: true, ...change.$set }));
    const result = await call('member', 'put', '/api/reviews/mine', { rating: 4, body: 'An updated review that must stay moderated.', hidden: false }).expect(200);
    assert.equal(result.body.review.hidden, true);
    assert.equal(write.mock.calls[0].arguments[1].$set.hidden, undefined);
    assert.equal(write.mock.calls[0].arguments[1].$unset, undefined);
  });
  await t.test('confirmation cannot resurrect a concurrently cancelled booking', async () => {
    t.mock.method(Booking, 'findOne', () => query({ _id: ids.other, status: 'requested' }));
    const write = t.mock.method(Booking, 'updateOne', async () => ({ matchedCount: 0 }));
    await call('staff', 'patch', `/api/admin/bookings/${ids.other}`, { status: 'confirmed' }).expect(409);
    assert.deepEqual(write.mock.calls[0].arguments[0].status, { $ne: 'cancelled' });
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
