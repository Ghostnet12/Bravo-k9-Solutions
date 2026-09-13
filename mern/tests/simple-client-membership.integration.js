import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { membershipDate, membershipToday, manualMonthTerm } from '../shared/membership-terms.js';

test('name and dog create a complete member without contact details or payment', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'simple_client_membership'; process.env.APP_ORIGIN = 'http://localhost:5173'; delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, MemberAccess, Booking, Subscription, Settings, Slot } = await import('../server/models.js');
  const { digest, hashPassword } = await import('../server/auth.js');
  const { getEntitlements } = await import('../server/bookings.js');
  const people = {}, cookies = {}, ownerPassword = 'Isolated-owner-fixture-123!'; let clientId, secondId;
  const call = (who, method, path, body) => {
    let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN);
    if (who) r = r.set('Cookie', cookies[who]);
    return body === undefined ? r : r.send(body);
  };
  try {
    // Start with the production legacy constraint, then initialize the new model.
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
    await mongoose.connection.collection(User.collection.name).createIndex({ email: 1 }, { name: 'email_1', unique: true });
    await connectDb();
    for (const [key, name, role] of [['owner', 'David Northrop', 'owner'], ['admin', 'Administrator', 'owner'], ['staff', 'Ashley Northrop', 'staff'], ['member', 'Existing member', 'member']]) {
      people[key] = await User.create({ name, role, email: `${key}@example.test`, passwordHash: await hashPassword(ownerPassword) });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId: people[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['09:00', '10:00', '11:00'], overrides: [] } });
    await t.test('authorization and required names are enforced before creating any records', async () => {
      for (const who of [null, 'staff', 'member']) await call(who, 'post', '/api/admin/users', { name: 'Client', dogName: 'Gunner' }).expect(who ? 403 : 401);
      for (const body of [{ name: 'Client' }, { dogName: 'Gunner' }, { name: 'Client', dogName: ' ' }, { name: 'Client', dogName: 'Gunner', email: 'invalid' }]) await call('owner', 'post', '/api/admin/users', body).expect(400);
      assert.equal(await User.countDocuments(), 4); assert.equal(await Booking.countDocuments(), 0); assert.equal(await Subscription.countDocuments(), 0);
    });
    await t.test('multiple clients can omit email, phone and address, including blank form fields', async () => {
      assert.ok((await User.collection.indexes()).some(index => index.name === 'email_1'));
      const first = await call('owner', 'post', '/api/admin/users', { name: 'Name only client', dogName: 'Gunner' }).expect(201); clientId = first.body.user.id;
      const second = await call('admin', 'post', '/api/admin/users', { name: 'Name only client', dogName: 'Luna', email: ' ', phone: '', address: '', membershipStartDate: '', trainingDogCount: '' }).expect(201); secondId = second.body.user.id;
      assert.notEqual(clientId, secondId);
      for (const result of [first.body, second.body]) {
        assert.equal(result.temporaryPassword, undefined); assert.equal(result.user.email, undefined); assert.equal(result.user.phone, ''); assert.equal(result.user.address, ''); assert.equal(result.user.role, 'member');
        assert.equal(result.membership.active, true); assert.equal(result.membership.enabled, true); assert.equal(result.membership.revision, 1);
        assert.equal(membershipDate(result.membership.startsAt), membershipToday()); assert.equal(membershipDate(result.membership.endsAt), membershipDate(manualMonthTerm(membershipToday()).validUntil));
        const user = await User.findById(result.user.id).lean(), access = await MemberAccess.findById(user._id), booking = await Booking.findOne({ userId: user._id });
        assert.equal(Object.hasOwn(user, 'email'), false); assert.equal(user.stripeCustomerId, undefined); assert.equal(user.firstPaidAt, undefined);
        assert.equal(access.enabled, true); assert.equal(String(access.trainingBookingId), String(booking._id)); assert.equal(access.trainingDogCount, 1);
        assert.equal(booking.dogName, user.dogName); assert.equal(booking.paymentStatus, 'covered'); assert.deepEqual(booking.visits, []); assert.equal(booking.paidAt, undefined); assert.equal(booking.stripeSessionId, undefined);
        const terms = await Subscription.find({ userId: user._id }); assert.equal(terms.length, 2);
        assert.ok(terms.every(term => term.source === 'grant' && term.autoPayDisabled)); assert.deepEqual((await getEntitlements(user._id)).services.sort(), ['online', 'training']);
      }
      const indexes = await User.collection.indexes(); assert.equal(indexes.some(index => index.name === 'email_1'), false); assert.ok(indexes.some(index => index.name === 'unique_contact_email' && index.unique));
    });
    await t.test('a contact-free member can immediately receive a trainer and a saved 10 AM visit', async () => {
      let booking = await Booking.findOne({ userId: clientId });
      await call('owner', 'patch', `/api/admin/bookings/${booking._id}/assignment`, { staffId: String(people.owner._id) }).expect(200);
      booking = await Booking.findById(booking._id);
      const date = DateTime.now().setZone('America/Chicago').plus({ days: 2 }).toISODate();
      await call('owner', 'post', '/api/client-schedule/changes', { bookingId: String(booking._id), revision: booking.updatedAt.toISOString(), additions: [{ date, time: '10:00' }], removals: [], note: 'Agreed appointment for imported client.' }).expect(200);
      assert.ok(await Slot.exists({ bookingId: booking._id, date, time: '10:00' }));
      const schedule = await call('owner', 'get', `/api/client-schedule?client=${clientId}&month=${date.slice(0, 7)}`).expect(200);
      assert.equal(schedule.body.visits[0].time, '10:00'); assert.equal(schedule.body.trainingBookings.length, 1);
    });
    await t.test('email uniqueness and existing sign-in identities remain protected', async () => {
      await call('owner', 'patch', `/api/admin/users/${clientId}`, { email: 'member@example.test' }).expect(409);
      assert.equal((await User.findById(clientId)).email, undefined);
      const results = await Promise.all([clientId, secondId].map(id => call('owner', 'patch', `/api/admin/users/${id}`, { email: 'SHARED@example.test' })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(await User.countDocuments({ email: 'shared@example.test' }), 1);
      // Give the remaining client its own contact address; neither save replaces an account.
      const remaining = await User.findOne({ _id: { $in: [clientId, secondId] }, email: { $exists: false } });
      await call('owner', 'patch', `/api/admin/users/${remaining._id}`, { email: 'later@example.test', phone: '6055550100', address: 'Fixture address', dogName: remaining.dogName }).expect(200);
      await call('owner', 'patch', `/api/admin/users/${clientId}`, { email: 'changed@example.test' }).expect(400);
      await call('staff', 'patch', `/api/admin/users/${clientId}`, { email: 'staff-change@example.test' }).expect(403);
      const counts = [await User.countDocuments(), await Booking.countDocuments(), await Subscription.countDocuments()];
      await call('owner', 'post', '/api/admin/users', { name: 'Duplicate email', dogName: 'Dog', email: 'SHARED@example.test' }).expect(409);
      assert.deepEqual([await User.countDocuments(), await Booking.countDocuments(), await Subscription.countDocuments()], counts);
    });
    await t.test('adding an email enables real sign-in to the same membership and saved schedule', async () => {
      const recovery = await call('owner', 'post', `/api/admin/recovery/${clientId}`, { currentPassword: ownerPassword }).expect(200);
      const password = 'Isolated-client-password-123!', email = (await User.findById(clientId)).email;
      await call(null, 'post', '/api/auth/recover', { token: new URL(recovery.body.url).hash.slice(1), password }).expect(200);
      const login = await call(null, 'post', '/api/auth/login', { email, password }).expect(200);
      assert.equal(login.body.user.id, clientId); cookies.created = login.headers['set-cookie'];
      const me = await call('created', 'get', '/api/auth/me').expect(200); assert.deepEqual(me.body.services.sort(), ['online', 'training']);
      const date = DateTime.now().setZone('America/Chicago').plus({ days: 2 }).toISODate();
      const schedule = await call('created', 'get', `/api/client-schedule?month=${date.slice(0, 7)}`).expect(200); assert.equal(schedule.body.visits[0].time, '10:00');
      assert.equal(await User.countDocuments(), 6); assert.equal(await Booking.countDocuments({ userId: clientId }), 1); assert.equal(await Subscription.countDocuments({ userId: clientId }), 2);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
