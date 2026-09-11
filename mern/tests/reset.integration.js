import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('Durable account-scoped chat clearing (isolated database only)', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'reset_regression_test';
  process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app } = await import('../server/app.js');
    const { connectDb } = await import('../server/db.js');
    const { ChatClear } = await import('../server/chat-clear.js');
    const { User, Session, Message, DirectMessage, GroupMessage, CommunityGroup, Booking, Slot, Subscription, AuditEvent } = await import('../server/models.js');
    await connectDb(); await ChatClear.init();
    const users = {}, cookies = {};
    for (const [name, role] of Object.entries({ owner: 'owner', administrator: 'owner', staff: 'staff', client: 'member', other: 'member', outsider: 'member', blocked: 'member' })) {
      users[name] = await User.create({ ...(name === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), email: `${name}@example.test`, name, role, blocked: name === 'blocked', passwordHash: 'test-only' });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: users[name]._id, expiresAt: new Date(Date.now() + 3600000) });
      cookies[name] = `bravo_session=${token}`;
    }
    const call = (who, method, path, body) => { let req = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) req = req.set('Cookie', cookies[who]); return body === undefined ? req : req.send(body); };
    const clear = (who, channel, extra = {}) => call(who, 'post', '/api/chat/clear', { channel, confirm: true, ...extra });
    const group = await CommunityGroup.create({ name: 'Fixture group', ownerId: users.client._id, members: [users.client._id, users.other._id] });
    await Message.create({ userId: users.other._id, authorName: 'other', role: 'member', kind: 'message', body: 'Earlier room message' });
    await DirectMessage.create({ memberId: users.client._id, senderId: users.client._id, senderName: 'client', senderRole: 'member', body: 'Earlier private message' });
    await GroupMessage.create({ groupId: group._id, userId: users.client._id, authorName: 'client', role: 'member', body: 'Earlier group message' });
    await Booking.create({ userId: users.client._id, requestKey: 'retained-fixture', serviceIds: ['training'], visits: [{ date: '2026-12-01', time: '09:00', service: 'training' }], status: 'confirmed', paymentStatus: 'paid' });
    await Slot.create({ _id: 'retained-slot', date: '2026-12-01', time: '09:00' });
    await Subscription.create({ userId: users.client._id, stripeId: 'test-no-payment', status: 'active' });

    await t.test('authentication, CSRF, confirmation and group/direct authorization', async () => {
      await clear(null, 'community').expect(401);
      await call('client', 'post', '/api/chat/clear', { channel: 'community' }).expect(400);
      await clear('client', 'inbox').expect(403);
      await clear('client', 'direct', { memberId: String(users.other._id) }).expect(403);
      await clear('outsider', 'group', { groupId: String(group._id) }).expect(404);
      await clear('client', 'group', { groupId: 'invalid' }).expect(400);
      await clear('client', 'community', { userId: String(users.owner._id) }).expect(400);
      await request(app).post('/api/chat/clear').set('Cookie', cookies.client).set('Origin', 'https://untrusted.example').send({ channel: 'community', confirm: true }).expect(403);
      const blocked = await clear('blocked', 'community'); assert.ok([401, 403].includes(blocked.status));
      assert.equal(await ChatClear.countDocuments(), 0);
    });
    await t.test('room clear persists across repeated fetches without affecting anyone else', async () => {
      assert.equal((await call('client', 'get', '/api/community').expect(200)).body.messages.length, 1);
      const response = await clear('client', 'community').expect(200); assert.equal(response.body.visibility, 'your-view-only');
      for (let n = 0; n < 3; n++) { const result = await call('client', 'get', '/api/community').expect(200); assert.equal(result.body.messages.length, 0); assert.match(result.headers['cache-control'], /no-store/); }
      assert.equal((await call('other', 'get', '/api/community').expect(200)).body.messages.length, 1);
      assert.equal(await Message.countDocuments({ deleted: false }), 1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await call('other', 'post', '/api/community', { kind: 'message', body: 'New room message' }).expect(201);
      const fresh = await call('client', 'get', '/api/community').expect(200); assert.deepEqual(fresh.body.messages.map(m => m.body), ['New room message']);
    });
    await t.test('private clear affects the acting account, not the client or another trainer', async () => {
      const endpoint = `/api/direct?memberId=${users.client._id}`;
      await clear('staff', 'direct', { memberId: String(users.client._id) }).expect(200);
      assert.equal((await call('staff', 'get', endpoint).expect(200)).body.messages.length, 0);
      assert.equal((await call('client', 'get', '/api/direct').expect(200)).body.messages.length, 1);
      assert.equal((await call('owner', 'get', endpoint).expect(200)).body.messages.length, 1);
      assert.equal((await call('staff', 'get', '/api/admin').expect(200)).body.inbox.length, 0);
    });
    await t.test('owner and administrator can clear only their own inbox and receive new messages', async () => {
      for (const actor of ['owner', 'administrator']) {
        assert.equal((await call(actor, 'get', '/api/admin').expect(200)).body.inbox.length, 1);
        await clear(actor, 'inbox').expect(200);
        assert.equal((await call(actor, 'get', '/api/admin').expect(200)).body.inbox.length, 0);
        assert.equal((await call(actor, 'get', `/api/direct?memberId=${users.client._id}`).expect(200)).body.messages.length, 0);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      await call('client', 'post', '/api/direct', { body: 'New private message' }).expect(201);
      for (const actor of ['owner', 'administrator', 'staff']) {
        const result = await call(actor, 'get', '/api/admin').expect(200); assert.equal(result.body.inbox.length, 1); assert.equal(result.body.inbox[0].lastMessage, 'New private message');
      }
    });
    await t.test('group clear is scoped to the acting member and the specific group', async () => {
      await clear('client', 'group', { groupId: String(group._id) }).expect(200);
      assert.equal((await call('client', 'get', `/api/groups/${group._id}/messages`).expect(200)).body.messages.length, 0);
      assert.equal((await call('other', 'get', `/api/groups/${group._id}/messages`).expect(200)).body.messages.length, 1);
      assert.equal((await call('client', 'get', '/api/direct').expect(200)).body.messages.length, 2);
    });
    await t.test('concurrent clears are monotonic and create one marker per account/scope', async () => {
      const results = await Promise.all([clear('other', 'community'), clear('other', 'community'), clear('other', 'community')]);
      assert.ok(results.every(result => result.status === 200));
      const marks = await ChatClear.find({ userId: users.other._id, scope: 'community' }).lean(); assert.equal(marks.length, 1);
      assert.ok(new Date(marks[0].clearedAt).getTime() >= Math.max(...results.map(result => new Date(result.body.clearedAt).getTime())));
    });
    await t.test('no business records or shared transcripts were deleted', async () => {
      assert.equal(await Booking.countDocuments({ status: 'confirmed', paymentStatus: 'paid' }), 1);
      assert.equal(await Slot.countDocuments(), 1); assert.equal(await Subscription.countDocuments(), 1);
      assert.equal(await User.countDocuments(), 7); assert.equal(await DirectMessage.countDocuments({ deleted: false }), 2);
      assert.equal(await GroupMessage.countDocuments({ deleted: false }), 1);
      assert.ok(await AuditEvent.countDocuments({ action: 'chat.clear-own-view' }) >= 7);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
