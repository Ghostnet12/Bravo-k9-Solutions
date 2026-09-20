import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('security boundaries through the production application stack', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'security_isolated';
  delete process.env.VERCEL;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, RateBucket } = await import('../server/models.js');
  const { hashPassword, digest } = await import('../server/auth.js');
  const password = 'Isolated-fixture-password-123!';
  const users = {}, cookies = {};
  const sessionFor = async (user, version = user.credentialVersion || 0) => {
    const token = randomBytes(32).toString('hex');
    await Session.create({ tokenHash: digest(token), userId: user._id, credentialVersion: version, expiresAt: new Date(Date.now() + 600000) });
    return `bravo_session=${token}`;
  };
  const call = (who, method, path, body) => {
    let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN);
    if (who) r = r.set('Cookie', cookies[who]);
    return body === undefined ? r : r.send(body);
  };
  try {
    await connectDb();
    for (const [key, role] of [['owner', 'owner'], ['staff', 'staff'], ['member', 'member'], ['other', 'member']]) {
      users[key] = await User.create({ name: key, email: `${key}@example.test`, passwordHash: await hashPassword(password), role });
      cookies[key] = await sessionFor(users[key]);
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    await t.test('successful sign-ins keep only the five newest active sessions', async () => {
      const oldCookie = cookies.other;
      for (let i = 0; i < 6; i++) {
        const result = await call(null, 'post', '/api/auth/login', { identifier: 'other@example.test', password }).expect(200);
        cookies.other = result.headers['set-cookie'];
      }
      assert.equal((await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(200)).body.user, null);
      assert.ok((await call('other', 'get', '/api/auth/me').expect(200)).body.user);
      assert.equal(await Session.countDocuments({ userId: users.other._id, expiresAt: { $gt: new Date() } }), 5);
      await RateBucket.deleteMany({});
    });
    await t.test('changing cookies cannot reset the IP login allowance', async () => {
      for (let i = 0; i < 12; i++) await call(i % 2 ? 'member' : 'other', 'post', '/api/auth/login', { identifier: 'unknown@example.test', password }).expect(401);
      const denied = await call(null, 'post', '/api/auth/login', { identifier: 'other@example.test', password }).expect(429);
      assert.ok(Number(denied.headers['retry-after']) > 0);
      await RateBucket.deleteMany({});
    });
    await t.test('normalized identifiers share a bucket even across source addresses', async () => {
      // Seed the shared identifier bucket as if other IPs used its allowance.
      const bucket = Math.floor(Date.now() / 900000);
      await RateBucket.create({ _id: digest(`login-identifier:member@example.test:${bucket}`), count: 30, expiresAt: new Date((bucket + 1) * 900000) });
      await call(null, 'post', '/api/auth/login', { identifier: ' MEMBER@EXAMPLE.TEST ', password }).expect(429);
      await call(null, 'post', '/api/auth/login', { identifier: { $ne: null }, password }).expect(400);
      await RateBucket.deleteMany({});
    });
    await t.test('role changes revoke old and delayed sessions; fresh sign-in still works', async () => {
      await call('owner', 'patch', `/api/admin/users/${users.member._id}`, { role: 'staff' }).expect(200);
      await call('member', 'get', '/api/admin').expect(401);
      cookies.delayed = await sessionFor(users.member, 0);
      await call('delayed', 'get', '/api/admin').expect(401);
      const login = await call(null, 'post', '/api/auth/login', { identifier: 'member@example.test', password }).expect(200);
      cookies.member = login.headers['set-cookie'];
      assert.equal(login.body.user.role, 'staff');
      await call('member', 'get', '/api/admin').expect(200);
      await call('owner', 'patch', `/api/admin/users/${users.member._id}`, { role: 'member' }).expect(200);
      await call('member', 'get', '/api/admin').expect(401);
    });
    await t.test('blocked and removed accounts cannot keep sessions', async () => {
      await call('owner', 'patch', `/api/admin/users/${users.staff._id}`, { blocked: true }).expect(200);
      cookies.delayed = await sessionFor(users.staff, 0);
      await call('owner', 'patch', `/api/admin/users/${users.staff._id}`, { blocked: false }).expect(200);
      await call('delayed', 'get', '/api/admin').expect(401);
      await User.updateOne({ _id: users.other._id }, { $set: { removedAt: new Date() } });
      assert.equal((await call('other', 'get', '/api/auth/me').expect(200)).body.user, null);
      await User.updateOne({ _id: users.other._id }, { $unset: { removedAt: 1 } });
      cookies.other = await sessionFor(users.other);
    });
    await t.test('private routes enforce authentication, object ownership and staff permissions', async () => {
      for (const path of ['/api/admin/users', '/api/client-schedule?month=2026-09', '/api/bookings', '/api/direct', '/api/lessons/example/video']) await call(null, 'get', path).expect(401);
      await call('other', 'get', `/api/client-schedule?month=2026-09&client=${users.owner._id}`).expect(403);
      await call('other', 'get', '/api/admin/users').expect(403);
      await call('other', 'put', '/api/site-images/home-hero', {}).expect(403);
      await call('other', 'put', '/api/proof-videos/fixture', {}).expect(403);
      const me = await call('other', 'get', '/api/auth/me').expect(200);
      assert.match(me.headers['cache-control'], /no-store/);
      assert.doesNotMatch(JSON.stringify(me.body), /passwordHash|credentialVersion|tokenHash/);
    });
    await t.test('all parser boundaries redact submitted secrets and reject cross-origin writes', async () => {
      for (const [method, path] of [['post', '/api/auth/login'], ['post', '/api/auth/recover'], ['patch', `/api/admin/memberships/${users.other._id}`], ['put', '/api/site-images/home-hero'], ['put', '/api/proof-videos/fixture']]) {
        const malformed = await request(app)[method](path).set('Cookie', cookies.owner).set('Origin', process.env.APP_ORIGIN).set('Content-Type', 'application/json').send('{"password":"SECRET_FIXTURE" invalid}').expect(400);
        assert.doesNotMatch(malformed.text, /SECRET_FIXTURE|SyntaxError|stack|password/);
        await request(app)[method](path).set('Cookie', cookies.owner).set('Origin', 'https://unrelated.example').send({}).expect(403);
      }
    });
    await t.test('privileged sessions expire on the server while members keep their normal lifetime', async () => {
      for (const [role, name] of [['owner', 'owner'], ['staff', 'staff'], ['member', 'other']]) {
        cookies.expiry = await sessionFor(await User.findById(users[name]._id).select('+credentialVersion'));
        const hash = digest(cookies.expiry.split('=')[1]);
        await Session.updateOne({ tokenHash: hash }, { $set: { issuedAt: new Date(Date.now() - 3600000), lastSeenAt: new Date(Date.now() - 31 * 60000) } });
        const response = await call('expiry', 'get', '/api/auth/me').expect(200);
        assert.equal(!!response.body.user, role === 'member');
      }
      cookies.expiry = await sessionFor(users.owner);
      const hash = digest(cookies.expiry.split('=')[1]);
      await Session.updateOne({ tokenHash: hash }, { $set: { issuedAt: new Date(Date.now() - 9 * 3600000), lastSeenAt: new Date() } });
      await call('expiry', 'get', '/api/admin').expect(401);
      cookies.expiry = await sessionFor(users.owner);
      await call('expiry', 'get', '/api/admin').expect(200);
      const active = await Session.findOne({ tokenHash: digest(cookies.expiry.split('=')[1]) });
      assert.ok(active.lastSeenAt > new Date(Date.now() - 10000));
      await call('expiry', 'post', '/api/auth/logout', {}).expect(200);
      await call('expiry', 'get', '/api/admin').expect(401);
    });
    await t.test('recovery links cannot survive permission changes or block/unblock cycles', async () => {
      for (const changes of [[{ role: 'staff' }, { role: 'member' }], [{ blocked: true }, { blocked: false }]]) {
        const recovery = await call('owner', 'post', `/api/admin/recovery/${users.other._id}`, { currentPassword: password }).expect(200);
        const token = new URL(recovery.body.url).hash.slice(1);
        for (const change of changes) await call('owner', 'patch', `/api/admin/users/${users.other._id}`, change).expect(200);
        await call(null, 'post', '/api/auth/recover', { token, password: 'Replacement-fixture-password-123!' }).expect(403);
        await RateBucket.deleteMany({});
      }
      const recovery = await call('owner', 'post', `/api/admin/recovery/${users.other._id}`, { currentPassword: password }).expect(200);
      const body = { token: new URL(recovery.body.url).hash.slice(1), password: 'Replacement-fixture-password-123!' };
      await call(null, 'post', '/api/auth/recover', body).expect(200);
      await call(null, 'post', '/api/auth/recover', body).expect(400);
    });
    await t.test('malformed cookies cannot crash sign-in or logout', async () => {
      cookies.invalid = 'bravo_session=j%3A%7B%22unexpected%22%3Atrue%7D';
      assert.equal((await call('invalid', 'get', '/api/auth/me').expect(200)).body.user, null);
      await call('invalid', 'post', '/api/auth/logout', {}).expect(200);
      await call('invalid', 'post', '/api/auth/login', { identifier: 'owner@example.test', password }).expect(200);
    });
    await t.test('unsigned payment callbacks cannot grant access', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_not_a_real_key';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture_not_a_real_secret';
      await request(app).post('/api/stripe/webhook').send({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid' } } }).expect(400);
      delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
