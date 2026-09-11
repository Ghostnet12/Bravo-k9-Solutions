import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('Member activation for existing customers (isolated MongoDB)', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'member_access_test';
  process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app, MemberAccess } = await import('../server/member-app.js');
    const { connectDb } = await import('../server/db.js');
    const { getEntitlements, bookingCoveredByEntitlements } = await import('../server/bookings.js');
    const { User, Session, Lesson, Subscription, Booking, MediaUpload, MediaChunk, AuditEvent } = await import('../server/models.js');
    await connectDb(); await MemberAccess.init();
    const users = {}, cookies = {};
    for (const [name, role] of Object.entries({ owner: 'owner', administrator: 'owner', staff: 'staff', client: 'member', paid: 'member', blocked: 'member', race: 'member' })) {
      users[name] = await User.create({ ...(name === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), email: `${name}@example.test`, name, role, blocked: name === 'blocked', passwordHash: 'fixture-only-not-used-to-sign-in' });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: users[name]._id, expiresAt: new Date(Date.now() + 3600000) });
      cookies[name] = `bravo_session=${token}`;
    }
    const call = (who, method, path, body) => {
      let req = request(app)[method](path).set('Origin', process.env.APP_ORIGIN);
      if (who) req = req.set('Cookie', cookies[who]);
      return body === undefined ? req : req.send(body);
    };
    const endpoint = who => `/api/admin/memberships/${users[who]._id}`;
    const grant = (actor, who, enabled, expectedRevision) => call(actor, 'patch', endpoint(who), { enabled, expectedRevision });
    const video = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');
    const captions = Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nFixture lesson\n');
    for (const [id, kind, data, type] of [['member-test-video', 'video', video, 'video/mp4'], ['member-test-captions', 'captions', captions, 'text/vtt']]) {
      await MediaUpload.create({ _id: id, lessonId: 'published-test', kind, filename: id, contentType: type, size: data.length, chunks: 1, completed: true });
      await MediaChunk.create({ uploadId: id, index: 0, size: data.length, data });
    }
    for (const [id, published] of [['published-test', true], ['private-draft', false]]) await Lesson.create({ _id: id, title: 'Fixture lesson', published, videoUpload: 'member-test-video', captionUpload: 'member-test-captions', transcript: 'Fixture lesson transcript' });

    await t.test('registration cannot activate membership or inject owner permissions', async () => {
      const response = await call(null, 'post', '/api/auth/register', { name: 'New Customer', email: 'new@example.test', password: 'unique-fixture-password-123', role: 'owner', membership: { manual: true }, enabled: true }).expect(201);
      assert.equal(response.body.user.role, 'member');
      const cookie = response.headers['set-cookie'][0].split(';')[0];
      const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
      assert.equal(me.body.membership.manual, false); assert.equal(me.body.membership.onlineAccess, false);
      assert.equal(await MemberAccess.countDocuments(), 0);
    });
    await t.test('staff, clients, visitors and cross-origin requests cannot grant or inspect membership', async () => {
      for (const who of ['staff', 'client', null]) {
        await grant(who, 'client', true, 0).expect(who ? 403 : 401);
        await call(who, 'get', `/api/admin/memberships?ids=${users.client._id}`).expect(who ? 403 : 401);
      }
      await request(app).patch(endpoint('client')).set('Cookie', cookies.owner).set('Origin', 'https://unrelated.example').send({ enabled: true, expectedRevision: 0 }).expect(403);
      await call('owner', 'patch', '/api/admin/memberships/not-an-id', { enabled: true, expectedRevision: 0 }).expect(400);
    });
    await t.test('owner turns an existing client into a Member without role, billing or booking changes', async () => {
      const response = await grant('owner', 'client', true, 0).expect(200);
      assert.equal(response.body.membership.manual, true);
      const me = await call('client', 'get', '/api/auth/me').expect(200);
      assert.deepEqual(me.body.membership, { active: true, manual: true, onlineAccess: true });
      assert.equal(me.body.user.role, 'member'); assert.deepEqual(me.body.services, []); assert.deepEqual(me.body.subscriptions, []);
      const entitlement = await getEntitlements(users.client._id);
      assert.equal(bookingCoveredByEntitlements(['training'], 1, entitlement), false);
      assert.equal(bookingCoveredByEntitlements(['online'], 1, entitlement), false);
      assert.equal(await Subscription.countDocuments(), 0); assert.equal(await Booking.countDocuments(), 0);
      const list = await call('administrator', 'get', `/api/admin/memberships?ids=${users.client._id}`).expect(200);
      assert.equal(list.body.memberships[String(users.client._id)].manual, true);
    });
    await t.test('Member can watch published lessons but cannot see drafts or edit any media', async () => {
      for (const type of ['video', 'captions', 'transcript']) {
        await call('client', 'get', `/api/lessons/published-test/${type}`).expect(200);
        await call('client', 'get', `/api/lessons/private-draft/${type}`).expect(404);
      }
      await call('client', 'get', '/api/admin').expect(403);
      await call('client', 'patch', '/api/site-images/home-hero', { expectedRevision: 0, x: 20 }).expect(403);
      await call('client', 'post', '/api/admin/media/start', {}).expect(403);
      await call('client', 'put', '/api/admin/lessons/published-test', {}).expect(403);
    });
    await t.test('administrator can revoke access immediately; stale changes fail', async () => {
      await grant('administrator', 'client', false, 0).expect(409);
      await grant('administrator', 'client', false, 1).expect(200);
      const me = await call('client', 'get', '/api/auth/me').expect(200); assert.equal(me.body.membership.active, false);
      for (const type of ['video', 'captions', 'transcript']) await call('client', 'get', `/api/lessons/published-test/${type}?manualMember=true`).expect(403);
      await grant('administrator', 'client', true, 2).expect(200);
      assert.equal(await AuditEvent.countDocuments({ targetId: String(users.client._id), action: { $in: ['membership.granted', 'membership.revoked'] } }), 3);
    });
    await t.test('removing manual membership never cancels or removes active paid access', async () => {
      await Subscription.create({ userId: users.paid._id, stripeId: 'sub_local_fixture', serviceIds: ['online'], status: 'active', validUntil: new Date(Date.now() + 86400000) });
      const before = await Subscription.findOne({ userId: users.paid._id }).lean();
      await grant('owner', 'paid', true, 0).expect(200); await grant('administrator', 'paid', false, 1).expect(200);
      const me = await call('paid', 'get', '/api/auth/me').expect(200);
      assert.deepEqual(me.body.membership, { active: true, manual: false, onlineAccess: true });
      await call('paid', 'get', '/api/lessons/published-test/transcript').expect(200);
      assert.deepEqual(await Subscription.findOne({ userId: users.paid._id }).lean(), before);
    });
    await t.test('blocked accounts, nonexistent accounts and staff-role targets are not granted', async () => {
      await grant('owner', 'blocked', true, 0).expect(409);
      await grant('owner', 'staff', true, 0).expect(400);
      await call('owner', 'patch', `/api/admin/memberships/${new mongoose.Types.ObjectId()}`, { enabled: true, expectedRevision: 0 }).expect(404);
      await grant('owner', 'client', true, -1).expect(400);
    });
    await t.test('concurrent activation has one winner and a recoverable revision conflict', async () => {
      const responses = await Promise.all([grant('owner', 'race', true, 0), grant('administrator', 'race', true, 0)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal((await MemberAccess.findById(users.race._id)).revision, 1);
    });
    await t.test('revoking administrator privileges or blocking a Member revokes protected access', async () => {
      await User.updateOne({ _id: users.administrator._id }, { $set: { role: 'staff' } });
      await grant('administrator', 'client', false, 3).expect(403);
      await User.updateOne({ _id: users.client._id }, { $set: { blocked: true } });
      await call('client', 'get', '/api/lessons/published-test/transcript').expect(401);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
