import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('September 27 security audit: client privacy, recovery revocation and dated entitlements', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'security_audit_isolated';
  delete process.env.VERCEL; delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, PasswordReset, AuditEvent, RateBucket, CommunityGroup, Booking, Subscription, Settings } = await import('../server/models.js');
  const { hashPassword, digest } = await import('../server/auth.js');
  const password = 'Audit-fixture-password-2026!', users = {}, cookies = {};
  const cookieFor = async user => {
    const token = randomBytes(32).toString('hex');
    await Session.create({ userId: user._id, tokenHash: digest(token), credentialVersion: user.credentialVersion || 0, expiresAt: new Date(Date.now() + 600000) });
    return `bravo_session=${token}`;
  };
  const call = (who, method, path, body) => {
    const r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN);
    if (who) r.set('Cookie', cookies[who]);
    return body === undefined ? r : r.send(body);
  };
  const peopleIds = response => response.body.people.map(person => person.id);
  try {
    await connectDb();
    for (const [name, role] of Object.entries({ owner: 'owner', admin: 'owner', staff: 'staff', member: 'member', peer: 'member', stranger: 'member', archived: 'member', removed: 'member' })) {
      users[name] = await User.create({ name, email: `${name}@example.test`, passwordHash: await hashPassword(password), role });
      cookies[name] = await cookieFor(users[name]);
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    await User.updateOne({ _id: users.removed._id }, { $set: { removedAt: new Date() } });
    const shared = await CommunityGroup.create({ name: 'Existing private group', ownerId: users.member._id, members: [users.member._id, users.peer._id] });
    await CommunityGroup.create({ name: 'Archived group', ownerId: users.member._id, members: [users.member._id, users.archived._id], archived: true });

    await t.test('members see only their team and existing group contacts; staff keep their client directory', async () => {
      await call(null, 'get', '/api/groups').expect(401);
      const response = await call('member', 'get', '/api/groups').expect(200);
      assert.deepEqual(new Set(peopleIds(response)), new Set(['owner', 'admin', 'staff', 'member', 'peer'].map(key => String(users[key]._id))));
      assert.equal(response.body.groups.length, 1);
      assert.doesNotMatch(JSON.stringify(response.body.people), /@example|passwordHash|credentialVersion|phone|address/);
      const outsider = await call('stranger', 'get', '/api/groups').expect(200);
      assert.equal(outsider.body.groups.length, 0);
      assert.deepEqual(new Set(peopleIds(outsider)), new Set(['owner', 'admin', 'staff', 'stranger'].map(key => String(users[key]._id))));
      for (const who of ['staff', 'admin', 'owner']) {
        const directory = peopleIds(await call(who, 'get', '/api/groups').expect(200));
        assert.ok(directory.includes(String(users.stranger._id)));
        assert.ok(!directory.includes(String(users.removed._id)));
      }
    });
    await t.test('direct API requests cannot add unrelated clients or enter their private groups', async () => {
      for (const target of [users.stranger._id, users.archived._id, new mongoose.Types.ObjectId()]) {
        await call('member', 'post', '/api/groups', { name: 'Forged selection', members: [String(target)] }).expect(403);
        await call('member', 'patch', `/api/groups/${shared._id}`, { members: [String(target)] }).expect(403);
      }
      assert.equal(await CommunityGroup.countDocuments({ name: 'Forged selection' }), 0);
      assert.deepEqual((await CommunityGroup.findById(shared._id)).members.map(String), [users.member._id, users.peer._id].map(String));
      await call('stranger', 'get', `/api/groups/${shared._id}/messages`).expect(404);
      await call('stranger', 'patch', `/api/groups/${shared._id}`, { members: [String(users.stranger._id)] }).expect(404);
      await RateBucket.deleteMany({});
    });
    await t.test('existing groups and authorized introductions still work', async () => {
      const created = await call('member', 'post', '/api/groups', { name: 'My training team', members: [String(users.peer._id).toUpperCase(), String(users.peer._id), String(users.staff._id)] }).expect(201);
      assert.equal(created.body.group.members.length, 3);
      await call('member', 'patch', `/api/groups/${shared._id}`, { members: [String(users.peer._id), String(users.staff._id)] }).expect(200);
      await call('admin', 'post', '/api/groups', { name: 'Bravo introduction', members: [String(users.member._id), String(users.stranger._id)] }).expect(201);
      assert.ok(peopleIds(await call('member', 'get', '/api/groups').expect(200)).includes(String(users.stranger._id)));
      await User.updateOne({ _id: users.peer._id }, { $set: { blocked: true } });
      assert.ok(!peopleIds(await call('member', 'get', '/api/groups').expect(200)).includes(String(users.peer._id)));
      await call('member', 'post', '/api/groups', { name: 'Blocked contact', members: [String(users.peer._id)] }).expect(403);
    });
    await t.test('administrators can repair groups with inactive creators without restoring their access', async () => {
      for (const inactive of [users.peer, users.removed]) {
        const group = await CommunityGroup.create({ name: 'Retained conversation', ownerId: inactive._id, members: [inactive._id, users.member._id] });
        await call('admin', 'patch', `/api/groups/${group._id}`, { members: [String(users.member._id), String(users.staff._id)] }).expect(200);
        const saved = await CommunityGroup.findById(group._id);
        assert.equal(String(saved.ownerId), String(inactive._id));
        assert.deepEqual(new Set(saved.members.map(String)), new Set([users.member._id, users.staff._id].map(String)));
        await call('member', 'get', `/api/groups/${group._id}/messages`).expect(200);
        await call(inactive.name, 'get', `/api/groups/${group._id}/messages`).expect(401);
      }
    });
    await t.test('stale administrator credentials cannot issue recovery tokens', async () => {
      const { issueRecovery } = await import('../server/account-recovery.js');
      await User.updateOne({ _id: users.admin._id }, { $inc: { credentialVersion: 1 } });
      await assert.rejects(issueRecovery({ user: users.admin, params: { id: String(users.stranger._id) }, body: { currentPassword: password } }, { json: () => assert.fail('No recovery link should be returned') }), { status: 403 });
      assert.equal(await PasswordReset.countDocuments(), 0);
      assert.equal(await AuditEvent.countDocuments({ action: 'password.recovery-issued' }), 0);
    });
    await t.test('revocation after password verification prevents recovery issuance', async () => {
      const original = mongoose.connection.transaction;
      for (const changes of [{ role: 'member' }, { blocked: true }, { removedAt: new Date() }, { credentialVersion: 5 }]) {
        await User.updateOne({ _id: users.admin._id }, { $set: { role: 'owner', blocked: false, removedAt: null, credentialVersion: 1 } });
        cookies.admin = await cookieFor(await User.findById(users.admin._id).select('+credentialVersion'));
        const interception = t.mock.method(mongoose.connection, 'transaction', async function(work, ...args) {
          await User.updateOne({ _id: users.admin._id }, { $set: changes });
          return original.call(this, work, ...args);
        });
        try { await call('admin', 'post', `/api/admin/recovery/${users.stranger._id}`, { currentPassword: password }).expect(409); }
        finally { interception.mock.restore(); }
        assert.equal(await PasswordReset.countDocuments(), 0);
        assert.equal(await AuditEvent.countDocuments({ action: 'password.recovery-issued' }), 0);
      }
      await RateBucket.deleteMany({});
      const valid = await call('owner', 'post', `/api/admin/recovery/${users.stranger._id}`, { currentPassword: password }).expect(200);
      assert.ok(new URL(valid.body.url).hash);
      assert.equal(await PasswordReset.countDocuments(), 1);
      assert.equal(await AuditEvent.countDocuments({ action: 'password.recovery-issued' }), 1);
    });
    await t.test('a larger current plan cannot cover extra dogs on a smaller future plan', async () => {
      const today = DateTime.now().setZone('America/Chicago').startOf('day');
      const boundary = today.plus({ days: 3 }), visitDate = today.plus({ days: 5 }).toISODate();
      await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['10:00', '11:00'], overrides: [] } });
      await Subscription.create([
        { userId: users.member._id, stripeId: 'audit-two-dogs', serviceIds: ['training'], dogCount: 2, status: 'active', validFrom: today.toJSDate(), validUntil: boundary.toJSDate() },
        { userId: users.member._id, stripeId: 'audit-one-dog', serviceIds: ['training'], dogCount: 1, status: 'active', validFrom: boundary.toJSDate(), validUntil: today.plus({ days: 32 }).toJSDate() },
      ]);
      const payload = { requestKey: randomUUID(), serviceIds: ['training'], dogCount: 2, dogName: 'Fixture dogs', phone: '5551234567', address: 'Isolated fixture address', visits: [{ date: visitDate, time: '10:00', service: 'training' }] };
      const additional = await call('member', 'post', '/api/bookings', payload).expect(201);
      assert.equal(additional.body.booking.paymentStatus, 'unpaid');
      assert.equal(additional.body.booking.quote.monthlyCents, 30000);
      // Release the first request before testing another dog-count quote for
      // the same day; self-service now correctly permits one training session.
      await call('member', 'post', `/api/bookings/${additional.body.booking._id}/cancel`, {}).expect(200);
      const covered = await call('member', 'post', '/api/bookings', { ...payload, requestKey: randomUUID(), dogCount: 1, visits: [{ date: visitDate, time: '11:00', service: 'training' }] }).expect(201);
      assert.equal(covered.body.booking.paymentStatus, 'covered');
      const oldVisit = { date: today.plus({ days: 1 }).toISODate(), time: '10:00', service: 'training' };
      const legacy = await Booking.create({ userId: users.member._id, requestKey: randomUUID(), serviceIds: ['training'], dogCount: 2, status: 'confirmed', paymentStatus: 'covered', visits: [oldVisit] });
      await call('member', 'post', '/api/client-schedule/visit', { bookingId: String(legacy._id), action: 'change', original: oldVisit, replacement: { ...oldVisit, date: visitDate } }).expect(400);
      assert.equal((await Booking.findById(legacy._id)).visits[0].date, oldVisit.date);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
