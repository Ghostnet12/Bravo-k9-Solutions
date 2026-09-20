import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { totp } from '../server/mfa-crypto.js';
test('MFA enrollment, sign-in, recovery and revocation', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'mfa_test'; process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('hex'); delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, RateBucket, AuditEvent } = await import('../server/models.js');
  const { hashPassword, digest } = await import('../server/auth.js');
  const password = 'Mfa-fixture-password-2026!'; let owner, cookie, oldCookie, setup, codes;
  const call = (path, body, auth = cookie) => { let r = request(app).post(`/api/auth/${path}`).set('Origin', process.env.APP_ORIGIN); if (auth) r = r.set('Cookie', auth); return r.send(body); };
  const login = code => call('login', { identifier: 'owner@example.test', password, ...(code === undefined ? {} : { code }) }, null);
  try {
    await connectDb();
    owner = await User.create({ name: 'Owner', email: 'owner@example.test', role: 'owner', passwordHash: await hashPassword(password) }); process.env.OWNER_USER_ID = String(owner._id);
    const signed = await login().expect(200); cookie = signed.headers['set-cookie']; oldCookie = cookie;
    await t.test('requires authentication and password; members cannot enroll', async () => {
      await call('mfa/enroll', { currentPassword: password }, null).expect(401);
      await call('mfa/enroll', { currentPassword: 'incorrect' }).expect(403);
      await call('mfa/enroll', { currentPassword: { $ne: null } }).expect(400);
      const member = await User.create({ name: 'Client', role: 'member', passwordHash: await hashPassword(password) });
      const token = randomBytes(32).toString('hex'); await Session.create({ userId: member._id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000) });
      await call('mfa/enroll', { currentPassword: password }, `bravo_session=${token}`).expect(403);
    });
    await t.test('enrollment requires a valid first code and hides stored secrets', async () => {
      setup = (await call('mfa/enroll', { currentPassword: password }).expect(200)).body;
      assert.match(setup.secret, /^[A-Z2-7]{32}$/);
      assert.equal((await User.findById(owner._id).lean()).mfa, undefined);
      const stored = await User.findById(owner._id).select('+mfa').lean(); assert.ok(!JSON.stringify(stored).includes(setup.secret));
      await call('mfa/confirm', { currentPassword: password, token: setup.token, code: 'invalid' }).expect(403);
      const result = await call('mfa/confirm', { currentPassword: password, token: setup.token, code: totp(setup.secret, Math.floor(Date.now() / 30000)) }).expect(200);
      codes = result.body.recoveryCodes; assert.equal(codes.length, 10); cookie = result.headers['set-cookie'];
      const me = await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(200); assert.equal(me.body.user, null);
      const doc = await User.findById(owner._id).select('+mfa').lean(); assert.equal(doc.mfaEnabled, true); assert.ok(!JSON.stringify(doc).includes(codes[0]));
    });
    await t.test('password alone and reused enrollment code cannot issue a session', async () => {
      const missing = await login().expect(401); assert.equal(missing.body.code, 'MFA_REQUIRED'); assert.equal(missing.headers['set-cookie'], undefined);
      await login({ $ne: null }).expect(400); await login('invalid').expect(401);
      const doc = await User.findById(owner._id).select('+mfa');
      await login(totp(setup.secret, doc.mfa.lastStep)).expect(401);
    });
    await t.test('valid TOTP login consumes the step and does not disclose MFA data', async () => {
      // Advance only the fixture replay marker, never the application clock.
      await User.updateOne({ _id: owner._id }, { $set: { 'mfa.lastStep': Math.floor(Date.now() / 30000) - 2 } });
      const code = totp(setup.secret, Math.floor(Date.now() / 30000));
      const result = await login(code).expect(200); cookie = result.headers['set-cookie'];
      assert.equal(result.body.user.mfaEnabled, true); assert.equal(result.body.user.mfa, undefined);
      await login(code).expect(401);
    });
    await t.test('concurrent use of a recovery code succeeds only once', async () => {
      await RateBucket.deleteMany({});
      const results = await Promise.all([login(codes[0]), login(codes[0])]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 401]); cookie = results.find(r => r.status === 200).headers['set-cookie'];
      assert.equal(await AuditEvent.countDocuments({ action: 'security.mfa-recovery-used' }), 1);
    });
    await t.test('missing encryption key fails closed for TOTP', async () => {
      const key = process.env.MFA_ENCRYPTION_KEY; delete process.env.MFA_ENCRYPTION_KEY;
      try { await login('123456').expect(503); } finally { process.env.MFA_ENCRYPTION_KEY = key; }
    });
    await t.test('disabling MFA requires both factors and revokes previous sessions', async () => {
      await RateBucket.deleteMany({});
      await call('mfa/disable', { currentPassword: password }).expect(400);
      await call('mfa/disable', { currentPassword: 'wrong', code: codes[1] }).expect(403);
      await call('mfa/disable', { currentPassword: password, code: codes[0] }).expect(403);
      const before = cookie;
      const disabled = await call('mfa/disable', { currentPassword: password, code: codes[1] }).expect(200); cookie = disabled.headers['set-cookie'];
      assert.equal((await request(app).get('/api/auth/me').set('Cookie', before)).body.user, null);
      assert.equal((await User.findById(owner._id).select('+mfa')).mfa, undefined);
      await login().expect(200);
      const events = JSON.stringify(await AuditEvent.find().lean()); assert.ok(!events.includes(password)); assert.ok(!events.includes(setup.secret)); assert.ok(!events.includes(codes[1]));
    });
    await t.test('expired and superseded setup attempts cannot activate MFA', async () => {
      await RateBucket.deleteMany({});
      const first = (await call('mfa/enroll', { currentPassword: password }).expect(200)).body;
      const second = (await call('mfa/enroll', { currentPassword: password }).expect(200)).body;
      await call('mfa/confirm', { currentPassword: password, token: first.token, code: totp(first.secret, Math.floor(Date.now() / 30000)) }).expect(409);
      await User.updateOne({ _id: owner._id }, { $set: { 'mfa.pending.expiresAt': new Date(0) } });
      await call('mfa/confirm', { currentPassword: password, token: second.token, code: totp(second.secret, Math.floor(Date.now() / 30000)) }).expect(409);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); delete process.env.MFA_ENCRYPTION_KEY; }
});
