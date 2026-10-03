import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('permission changes require current credentials and survive revocation races safely', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'access_reauth_isolated';
  delete process.env.VERCEL;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, PasswordReset, AuditEvent, RateBucket } = await import('../server/models.js');
  const { hashPassword, digest } = await import('../server/auth.js');
  const { updateUserAccess } = await import('../server/user-access.js');
  const password = 'Access-fixture-owner-password-2026!', users = {}, cookies = {};
  const cookieFor = async user => {
    const token = randomBytes(32).toString('hex');
    await Session.create({ userId: user._id, tokenHash: digest(token), credentialVersion: user.credentialVersion || 0, expiresAt: new Date(Date.now() + 600000) });
    return `bravo_session=${token}`;
  };
  const call = (who, body) => {
    const r = request(app).patch(`/api/admin/users/${users.member._id}`).set('Origin', process.env.APP_ORIGIN);
    if (who) r.set('Cookie', cookies[who]);
    return r.send(body);
  };
  try {
    await connectDb();
    for (const [name, role] of Object.entries({ owner: 'owner', admin: 'owner', staff: 'staff', member: 'member' })) {
      users[name] = await User.create({ name, role, email: `${name}@example.test`, passwordHash: await hashPassword(name === 'member' ? 'Separate-member-password-2026!' : password) });
      cookies[name] = await cookieFor(users[name]);
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    await t.test('session-only, wrong-password and unauthorized permission changes leave no effect', async () => {
      await call(null, { role: 'staff', currentPassword: password }).expect(401);
      for (const who of ['member', 'staff']) await call(who, { role: 'staff', currentPassword: password }).expect(403);
      for (const body of [{ role: 'staff' }, { role: 'staff', currentPassword: 'incorrect' }, { role: 'staff', currentPassword: 'Separate-member-password-2026!' }, { blocked: true }]) await call('owner', body).expect(403);
      await call('owner', { role: 'staff', currentPassword: { $ne: null } }).expect(400);
      assert.equal((await User.findById(users.member._id)).role, 'member');
      assert.equal(await Session.countDocuments({ userId: users.member._id }), 1);
      assert.equal(await AuditEvent.countDocuments({ action: 'user.access.changed' }), 0);
      assert.doesNotMatch(JSON.stringify(await AuditEvent.find().lean()), /passwordHash|currentPassword|Separate-member-password|Access-fixture-owner-password/);
    });
    await t.test('ordinary profile edits remain usable without a password', async () => {
      await call('owner', { phone: '6055550100', role: 'member' }).expect(200);
      assert.equal((await User.findById(users.member._id)).phone, '6055550100');
    });
    await t.test('confirmed promotion revokes sessions and recovery links without storing submitted credentials', async () => {
      await PasswordReset.create({ _id: digest('fixture-reset'), userId: users.member._id, credentialVersion: 0, expiresAt: new Date(Date.now() + 600000) });
      const result = await call('owner', { role: 'staff', currentPassword: password, credentialVersion: 999, passwordHash: 'injected' }).expect(200);
      assert.equal(result.body.user.role, 'staff');
      assert.doesNotMatch(JSON.stringify(result.body), /currentPassword|passwordHash|credentialVersion/);
      assert.equal(await Session.countDocuments({ userId: users.member._id }), 0);
      assert.equal(await PasswordReset.countDocuments({ userId: users.member._id }), 0);
      const changed = await User.findById(users.member._id).select('+passwordHash +credentialVersion').lean();
      assert.equal(changed.credentialVersion, 1);
      assert.equal(changed.passwordHash, users.member.passwordHash);
      assert.equal(changed.currentPassword, undefined);
      assert.equal(await AuditEvent.countDocuments({ action: 'user.access.changed' }), 1);
      await call('owner', { role: 'member', currentPassword: password }).expect(200);
    });
    await t.test('blocking and restoring both require confirmation and record access changes', async () => {
      await call('owner', { blocked: true, currentPassword: password }).expect(200);
      await call('owner', { blocked: false }).expect(403);
      await call('owner', { blocked: false, currentPassword: password }).expect(200);
      assert.equal((await User.findById(users.member._id).select('+credentialVersion')).credentialVersion, 4);
      assert.deepEqual((await AuditEvent.find({ action: 'user.block.changed' }).sort({ createdAt: 1 }).lean()).map(e => e.details), [{ from: false, to: true }, { from: true, to: false }]);
    });
    await t.test('stale authenticated credential versions cannot confirm a change', async () => {
      await User.updateOne({ _id: users.admin._id }, { $inc: { credentialVersion: 1 } });
      await assert.rejects(updateUserAccess({ user: users.admin, params: { id: String(users.member._id) }, body: { role: 'staff', currentPassword: password } }, { json: () => assert.fail('No successful change') }), { status: 403 });
    });
    await t.test('demotion, blocking, removal or credential rotation during confirmation abort atomically', async () => {
      const original = mongoose.connection.transaction;
      for (const change of [{ role: 'member' }, { blocked: true }, { removedAt: new Date() }, { credentialVersion: 8 }]) {
        await User.updateOne({ _id: users.admin._id }, { $set: { role: 'owner', blocked: false, removedAt: null, credentialVersion: 1 } });
        cookies.admin = await cookieFor(await User.findById(users.admin._id).select('+credentialVersion'));
        const before = await AuditEvent.countDocuments({ action: 'user.access.changed' });
        const interception = t.mock.method(mongoose.connection, 'transaction', async function(work, ...args) {
          await User.updateOne({ _id: users.admin._id }, { $set: change });
          return original.call(this, work, ...args);
        });
        try { await call('admin', { role: 'staff', currentPassword: password }).expect(409); }
        finally { interception.mock.restore(); }
        assert.equal((await User.findById(users.member._id)).role, 'member');
        assert.equal(await AuditEvent.countDocuments({ action: 'user.access.changed' }), before);
      }
    });
    await t.test('target credential changes during confirmation are detected too', async () => {
      const original = mongoose.connection.transaction;
      const interception = t.mock.method(mongoose.connection, 'transaction', async function(work, ...args) {
        await User.updateOne({ _id: users.member._id }, { $inc: { credentialVersion: 1 } });
        return original.call(this, work, ...args);
      });
      try { await call('owner', { role: 'staff', currentPassword: password }).expect(409); }
      finally { interception.mock.restore(); }
      assert.equal((await User.findById(users.member._id)).role, 'member');
    });
    await t.test('password guessing is bounded even for an authenticated owner', async () => {
      await RateBucket.deleteMany({});
      const bucket = Math.floor(Date.now() / 3600000);
      await RateBucket.create({ _id: digest(`admin-user-edit:${users.owner._id}:${bucket}`), count: 30, expiresAt: new Date((bucket + 1) * 3600000) });
      await call('owner', { role: 'staff', currentPassword: password }).expect(429);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
