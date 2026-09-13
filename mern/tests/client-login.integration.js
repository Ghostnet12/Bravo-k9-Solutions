import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';

test('assisted clients claim their existing membership using name/email and a temporary password', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'client_temporary_login'; process.env.APP_ORIGIN = 'http://localhost:5173'; delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, Booking, Subscription, Settings, RateBucket, AuditEvent, PasswordReset } = await import('../server/models.js');
  const { digest, hashPassword, verifyPassword } = await import('../server/auth.js');
  const cookies = {}, people = {}, created = {};
  const ownerPassword = 'Owner-integration-password-123!', newPassword = 'My-own-client-password-123!';
  const call = (who, method, path, body) => {
    let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN);
    if (who) r = r.set('Cookie', cookies[who]);
    return body === undefined ? r : r.send(body);
  };
  const loginAs = async (key, identifier, password) => {
    const r = await call(null, 'post', '/api/auth/login', { identifier, password }).expect(200);
    cookies[key] = r.headers['set-cookie']; return r.body;
  };
  const replace = (who, id) => call(who, 'post', `/api/admin/clients/${id}/temporary-password`, { confirmReplacement: true });
  const freshLimits = () => RateBucket.deleteMany({});
  try {
    await connectDb();
    for (const [key, role] of [['owner', 'owner'], ['admin', 'owner'], ['staff', 'staff'], ['client', 'member']]) {
      people[key] = await User.create({ name: `Fixture ${key}`, email: `${key}@example.test`, role, passwordHash: await hashPassword(ownerPassword) });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: digest(token), userId: people[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    process.env.OWNER_USER_ID = String(people.owner._id);
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['09:00', '10:00'], overrides: [] } });
    await t.test('all three staff roles create no-charge member accounts with shareable credentials', async () => {
      for (const who of [null, 'client']) await call(who, 'post', '/api/admin/users', { name: 'Forbidden', dogName: 'Dog' }).expect(who ? 403 : 401);
      for (const who of ['owner', 'admin', 'staff']) {
        const result = await call(who, 'post', '/api/admin/users', { name: who === 'admin' ? 'Second Client' : 'Same Client', dogName: `Dog ${who}`, ...(who === 'admin' ? { email: 'Imported@Example.test' } : {}), role: 'owner', mustChangePassword: false, credentialVersion: 99, temporaryPassword: 'injected' }).expect(201);
        created[who] = result.body;
        assert.match(result.body.temporaryPassword, /^Bravo-[a-f\d]{32}!$/);
        assert.equal(result.body.user.role, 'member'); assert.equal(result.body.user.mustChangePassword, true);
        assert.equal(result.body.user.passwordHash, undefined); assert.equal(result.body.user.credentialVersion, undefined);
        const saved = await User.findById(result.body.user.id).select('+passwordHash +credentialVersion').lean();
        assert.ok(await verifyPassword(result.body.temporaryPassword, saved.passwordHash)); assert.equal(saved.credentialVersion, 0);
        assert.equal(saved.temporaryPassword, undefined); assert.ok(saved.temporaryPasswordExpiresAt > new Date());
        assert.ok((await Booking.findOne({ userId: saved._id })).paymentStatus === 'covered');
        assert.equal(await Subscription.countDocuments({ userId: saved._id, source: 'grant', autoPayDisabled: true }), 2);
      }
      assert.notEqual(created.owner.temporaryPassword, created.staff.temporaryPassword);
      const directory = await call('staff', 'get', '/api/admin/clients?clientsOnly=1').expect(200);
      const ownerList = await call('owner', 'get', '/api/admin/users').expect(200);
      for (const payload of [directory.body, ownerList.body, await AuditEvent.find().lean()]) {
        const text = JSON.stringify(payload);
        for (const item of Object.values(created)) assert.ok(!text.includes(item.temporaryPassword));
        assert.ok(!text.includes('passwordHash')); assert.ok(!text.includes('credentialVersion'));
      }
      await call('staff', 'get', '/api/admin/users').expect(403);
      await call('staff', 'patch', `/api/admin/users/${created.staff.user.id}`, { role: 'owner' }).expect(403);
      await call('owner', 'patch', `/api/admin/users/${created.staff.user.id}`, { role: 'staff' }).expect(400);
    });
    await t.test('literal names, case-insensitive email, and duplicate names resolve only the correct account', async () => {
      await freshLimits();
      for (const key of ['owner', 'staff']) {
        const r = await loginAs(`temp-${key}`, ' same client ', created[key].temporaryPassword);
        assert.equal(r.user.id, created[key].user.id); assert.equal(r.user.mustChangePassword, true);
      }
      const emailLogin = await loginAs('temp-admin', ' IMPORTED@EXAMPLE.TEST ', created.admin.temporaryPassword);
      assert.equal(emailLogin.user.id, created.admin.user.id);
      const bad = await call(null, 'post', '/api/auth/login', { identifier: 'Same Client', password: 'not-the-password' }).expect(401);
      const unknown = await call(null, 'post', '/api/auth/login', { identifier: '.*', password: created.owner.temporaryPassword }).expect(401);
      assert.deepEqual(bad.body, unknown.body);
      const literal = await call('staff', 'post', '/api/admin/users', { name: 'Name [.*] Client', dogName: 'Dog' }).expect(201);
      assert.equal((await loginAs('literal', 'NAME [.*] CLIENT', literal.body.temporaryPassword)).user.id, literal.body.user.id);
      await call(null, 'post', '/api/auth/login', { identifier: { $ne: null }, password: newPassword }).expect(400);
    });
    await t.test('first sign-in cannot bypass setup through schedules, lessons, messaging, profile, billing, or APIs', async () => {
      const me = await call('temp-owner', 'get', '/api/auth/me').expect(200);
      assert.equal(me.body.user.mustChangePassword, true); assert.deepEqual(me.body.services, []); assert.deepEqual(me.body.subscriptions, []);
      for (const path of ['/api/bookings', '/api/client-schedule?month=2026-09', '/api/notifications', '/api/lessons/basic/video', '/api/admin']) {
        const denied = await call('temp-owner', 'get', path).expect(403); assert.equal(denied.body.code, 'PASSWORD_SETUP_REQUIRED');
      }
      for (const [method, path, body] of [['patch', '/api/auth/profile', { name: 'Changed' }], ['post', '/api/bookings', {}], ['post', '/api/client-schedule/changes', {}], ['post', '/api/billing/portal', {}], ['post', '/api/auth/password', { currentPassword: created.owner.temporaryPassword, password: newPassword }]]) {
        const denied = await call('temp-owner', method, path, body).expect(403); assert.equal(denied.body.code, 'PASSWORD_SETUP_REQUIRED');
      }
      await call(null, 'post', '/api/auth/password-setup', { password: newPassword }).expect(401);
      await call('temp-owner', 'post', '/api/auth/password-setup', { password: 'short' }).expect(400);
      await call('temp-owner', 'post', '/api/auth/password-setup', { password: created.owner.temporaryPassword }).expect(400);
      await request(app).post('/api/auth/password-setup').set('Cookie', cookies['temp-owner']).set('Origin', 'https://unrelated.example').send({ password: newPassword }).expect(403);
    });
    await t.test('replacement invalidates the old password and every temporary session, including delayed session creation', async () => {
      await freshLimits(); const id = created.owner.user.id, endpoint = `/api/admin/clients/${id}/temporary-password`;
      for (const who of [null, 'client']) await replace(who, id).expect(who ? 403 : 401);
      await call('staff', 'post', endpoint, {}).expect(400);
      await request(app).post(endpoint).set('Cookie', cookies.staff).set('Origin', 'https://unrelated.example').send({ confirmReplacement: true }).expect(403);
      for (const key of ['owner', 'admin', 'staff', 'client']) await replace('staff', people[key]._id).expect(409);
      const r = await replace('staff', id).expect(200); const oldPassword = created.owner.temporaryPassword; created.owner = { ...created.owner, ...r.body };
      assert.notEqual(oldPassword, r.body.temporaryPassword);
      await call(null, 'post', '/api/auth/login', { identifier: 'Same Client', password: oldPassword }).expect(401);
      assert.equal((await call('temp-owner', 'get', '/api/auth/me').expect(200)).body.user, null);
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: digest(token), userId: id, credentialVersion: 0, expiresAt: new Date(Date.now() + 60000) }); cookies.stale = `bravo_session=${token}`;
      assert.equal((await call('stale', 'get', '/api/auth/me').expect(200)).body.user, null);
      await loginAs('temp-owner', 'Same Client', r.body.temporaryPassword);
    });
    await t.test('choosing a personal password unlocks the exact saved membership, trainer, and 10 AM visit', async () => {
      await freshLimits(); const id = created.owner.user.id;
      let booking = await Booking.findOne({ userId: id });
      await call('staff', 'patch', `/api/admin/bookings/${booking._id}/assignment`, { staffId: String(people.owner._id) }).expect(200);
      booking = await Booking.findById(booking._id);
      const date = DateTime.now().setZone('America/Chicago').plus({ days: 2 }).toISODate();
      await call('staff', 'post', '/api/client-schedule/changes', { bookingId: String(booking._id), revision: booking.updatedAt.toISOString(), additions: [{ date, time: '10:00' }], removals: [], note: 'Agreed appointment.' }).expect(200);
      const oldSession = cookies['temp-owner'];
      const setup = await call('temp-owner', 'post', '/api/auth/password-setup', { password: newPassword }).expect(200);
      assert.equal(setup.body.user.id, id); assert.equal(setup.body.user.mustChangePassword, false);
      cookies.claimed = setup.headers['set-cookie'];
      const me = await call('claimed', 'get', '/api/auth/me').expect(200); assert.deepEqual(me.body.services.sort(), ['online', 'training']);
      const schedule = await call('claimed', 'get', `/api/client-schedule?month=${date.slice(0, 7)}`).expect(200);
      assert.equal(schedule.body.client.id, id); assert.equal(schedule.body.visits[0].time, '10:00'); assert.equal(schedule.body.trainingBookings.length, 1);
      assert.equal((await request(app).get('/api/auth/me').set('Cookie', oldSession).expect(200)).body.user, null);
      await call(null, 'post', '/api/auth/login', { identifier: 'Same Client', password: created.owner.temporaryPassword }).expect(401);
      assert.equal((await loginAs('permanent', 'Same Client', newPassword)).user.id, id);
      for (const who of ['owner', 'admin', 'staff']) await replace(who, id).expect(409);
      const saved = await User.findById(id).select('+passwordHash');
      assert.equal(saved.mustChangePassword, false); assert.equal(saved.temporaryPasswordExpiresAt, undefined); assert.ok(await verifyPassword(newPassword, saved.passwordHash));
      assert.equal(await AuditEvent.countDocuments({ action: 'password.setup-completed', targetId: id }), 1);
      assert.equal(await Subscription.countDocuments({ userId: id }), 2);
      await call('claimed', 'post', '/api/auth/password-setup', { password: 'Cannot-repeat-password-123!' }).expect(409);
      await call('permanent', 'post', '/api/auth/password', { currentPassword: newPassword, password: 'Later-personal-password-456!' }).expect(200);
      assert.equal((await call('claimed', 'get', '/api/auth/me').expect(200)).body.user, null);
      assert.equal((await loginAs('later', 'Same Client', 'Later-personal-password-456!')).user.mustChangePassword, false);
    });
    await t.test('a concurrent replacement and client password choice cannot leave an old credential valid', async () => {
      await freshLimits(); const id = created.staff.user.id;
      const results = await Promise.all([
        call('temp-staff', 'post', '/api/auth/password-setup', { password: newPassword }),
        replace('owner', id),
      ]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const saved = await User.findById(id);
      if (results[0].status === 200) {
        assert.equal(saved.mustChangePassword, false);
        assert.equal((await loginAs('race-winner', 'Same Client', newPassword)).user.id, id);
      } else {
        assert.equal(saved.mustChangePassword, true);
        assert.equal((await loginAs('race-winner', 'Same Client', results[1].body.temporaryPassword)).user.id, id);
      }
      await call(null, 'post', '/api/auth/login', { identifier: 'Same Client', password: created.staff.temporaryPassword }).expect(401);
      assert.equal((await call('temp-staff', 'get', '/api/auth/me').expect(200)).body.user, null);
    });
    await t.test('expired and blocked clients cannot sign in; administrator recovery completes setup without losing membership', async () => {
      await freshLimits(); const id = created.admin.user.id;
      await User.updateOne({ _id: id }, { $set: { temporaryPasswordExpiresAt: new Date(0) } });
      await call(null, 'post', '/api/auth/login', { identifier: 'imported@example.test', password: created.admin.temporaryPassword }).expect(401);
      assert.equal((await call('temp-admin', 'get', '/api/auth/me').expect(200)).body.user, null);
      const renewed = await replace('admin', id).expect(200);
      await User.updateOne({ _id: id }, { $set: { blocked: true } });
      await call(null, 'post', '/api/auth/login', { identifier: 'imported@example.test', password: renewed.body.temporaryPassword }).expect(401);
      await replace('owner', id).expect(409);
      await User.updateOne({ _id: id }, { $set: { blocked: false } });
      const reset = await call('owner', 'post', `/api/admin/recovery/${id}`, { currentPassword: ownerPassword }).expect(200);
      await call(null, 'post', '/api/auth/recover', { token: new URL(reset.body.url).hash.slice(1), password: newPassword }).expect(200);
      const legacyLogin = await call(null, 'post', '/api/auth/login', { email: 'imported@example.test', password: newPassword }).expect(200);
      assert.equal(legacyLogin.body.user.mustChangePassword, false); assert.equal(legacyLogin.body.user.id, id);
      assert.equal(await PasswordReset.countDocuments({ userId: id }), 0);
      assert.equal(await Subscription.countDocuments({ userId: id }), 2);
      assert.equal((await loginAs('normal-owner', 'owner@example.test', ownerPassword)).user.mustChangePassword, false);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
