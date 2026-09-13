import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { manualMonthTerm, membershipDate } from '../shared/membership-terms.js';
import { JOINT_TRAINER_ID } from '../shared/trainers.js';

test('Make Member connects existing clients to covered training and the shared calendar', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'make_member_training'; process.env.APP_ORIGIN = 'http://localhost:5173';
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app } = await import('../server/client-services-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Booking, Subscription, Session, Settings, Slot, Notification, AuditEvent } = await import('../server/models.js');
    const { MemberAccess } = await import('../server/member-app.js');
    const { digest } = await import('../server/auth.js');
    const { getEntitlements } = await import('../server/bookings.js');
    await connectDb(); await MemberAccess.init();
    const now = DateTime.now().setZone('America/Chicago').startOf('day'), start = now.minus({ days: 5 }).toISODate();
    const people = {}, cookies = {};
    for (const [key, name, role] of [['david', 'David Northrop', 'owner'], ['ashley', 'Ashley Northrop', 'staff'], ['admin', 'Administrator', 'owner'], ['client', 'Current client', 'member'], ['future', 'Future client', 'member'], ['past', 'Past client', 'member'], ['race', 'Race client', 'member']]) {
      people[key] = await User.create({ name, role, email: `${key}@example.test`, passwordHash: 'isolated-test-only', dogName: 'Gunner', phone: '6055550100', address: 'Fixture address' });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: digest(token), userId: people[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
    const endpoint = key => `/api/admin/memberships/${people[key]._id}`;
    const save = (who, key, revision, extra = {}) => call(who, 'patch', endpoint(key), { enabled: true, expectedRevision: revision, startDate: start, trainingDogCount: 2, ...extra });
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['10:00', '11:00', '13:00'], overrides: [] } });
    let bookingId;
    await t.test('permissions and invalid inputs fail without grants or requests', async () => {
      for (const who of [null, 'client', 'ashley']) await save(who, 'client', 0).expect(who ? 403 : 401);
      for (const extra of [{ trainingDogCount: 0 }, { trainingDogCount: 11 }, { trainingDogCount: 1.5 }, { startDate: '2026-02-30' }]) await save('admin', 'client', 0, extra).expect(400);
      await User.updateOne({ _id: people.client._id }, { $set: { blocked: true } }); await save('admin', 'client', 0).expect(409);
      await User.updateOne({ _id: people.client._id }, { $set: { blocked: false } });
      assert.equal(await Booking.countDocuments(), 0); assert.equal(await Subscription.countDocuments(), 0);
    });
    await t.test('online-only existing member gets one covered training request, exact dates and dogs', async () => {
      await call('admin', 'patch', endpoint('client'), { enabled: true, expectedRevision: 0, startDate: start }).expect(200);
      const result = await save('admin', 'client', 1).expect(200); bookingId = result.body.membership.trainingBookingId;
      const booking = await Booking.findById(bookingId), term = await Subscription.findOne({ bookingId });
      assert.equal(booking.paymentStatus, 'covered'); assert.equal(booking.status, 'requested'); assert.equal(booking.dogCount, 2); assert.equal(booking.visits.length, 0);
      assert.equal(booking.paidAt, undefined); assert.equal(booking.stripeSessionId, undefined); assert.equal((await User.findById(people.client._id)).firstPaidAt, undefined);
      assert.equal(term.source, 'grant'); assert.equal(term.autoPayDisabled, true); assert.equal(membershipDate(term.validFrom), start); assert.equal(membershipDate(term.validUntil), membershipDate(manualMonthTerm(start).validUntil));
      assert.deepEqual((await getEntitlements(people.client._id)).services.sort(), ['online', 'training']);
      const list = await call('admin', 'get', `/api/admin/memberships?ids=${people.client._id}`).expect(200);
      assert.equal(list.body.memberships[people.client._id].trainingBookingId, bookingId); assert.equal(list.body.memberships[people.client._id].trainingDogCount, 2);
      assert.ok(await AuditEvent.exists({ targetId: String(people.client._id), 'details.scope': 'training-and-published-member-lessons' }));
    });
    await t.test('joint assignment and batch weekend calendar save appear on the client’s side', async () => {
      await call('admin', 'patch', `/api/admin/bookings/${bookingId}/assignment`, { staffId: JOINT_TRAINER_ID }).expect(200);
      let booking = await Booking.findById(bookingId);
      await call('admin', 'post', `/api/admin/bookings/${bookingId}/accept-client`, { staffId: JOINT_TRAINER_ID, revision: booking.updatedAt.toISOString() }).expect(200);
      booking = await Booking.findById(bookingId);
      const saturday = now.plus({ days: ((6 - now.weekday + 7) % 7) || 7 }), sunday = saturday.plus({ days: 1 });
      const additions = [{ date: saturday.toISODate(), time: '10:00' }, { date: sunday.toISODate(), time: '11:00' }];
      await call('admin', 'post', '/api/client-schedule/changes', { bookingId, revision: booking.updatedAt.toISOString(), additions, removals: [], note: 'Agreed training days.', openWeekends: true }).expect(200);
      for (const visit of additions) {
        assert.ok(await Slot.exists({ _id: `${visit.date}|${visit.time}`, bookingId }));
        const schedule = await call('client', 'get', `/api/client-schedule?month=${visit.date.slice(0, 7)}`).expect(200);
        assert.ok(schedule.body.visits.some(v => v.date === visit.date && v.time === visit.time && v.trainer === 'David and Ashley'));
      }
      assert.ok(await Notification.exists({ userId: people.client._id, staff: false, _id: /^schedule:/ }));
      const me = await call('client', 'get', '/api/auth/me').expect(200); assert.equal(me.body.user.role, 'member'); assert.equal(me.body.serviceDogCounts.training, 2);
    });
    await t.test('repeat saves preserve trainer acceptance and visits without duplicate training', async () => {
      const before = await Booking.findById(bookingId).lean();
      await save('david', 'client', 2).expect(200);
      const after = await Booking.findById(bookingId).lean();
      assert.deepEqual(after.visits, before.visits); assert.deepEqual(after.staffIds, before.staffIds); assert.deepEqual(after.trainerAcceptedAt, before.trainerAcceptedAt);
      assert.equal(await Booking.countDocuments({ userId: people.client._id }), 1); assert.equal(await Subscription.countDocuments({ userId: people.client._id, serviceIds: 'training' }), 1);
      await save('admin', 'client', 2).expect(409);
    });
    await t.test('invalid date correction rolls back online and training changes together', async () => {
      const before = await MemberAccess.findById(people.client._id).lean();
      const response = await save('admin', 'client', 3, { startDate: now.plus({ months: 2 }).toISODate() }).expect(409);
      assert.match(response.body.error, /Saved visits/); assert.deepEqual(await MemberAccess.findById(people.client._id).lean(), before);
      assert.equal(membershipDate((await Booking.findById(bookingId)).termStartsAt), start);
    });
    await t.test('dog count cannot exceed either assigned trainer’s capacity', async () => {
      const response = await save('admin', 'client', 3, { trainingDogCount: 6 }).expect(409); assert.match(response.body.error, /five-dog limit/);
      assert.equal((await Booking.findById(bookingId)).dogCount, 2); assert.equal((await MemberAccess.findById(people.client._id)).revision, 3);
    });
    await t.test('another paid month cannot extend this request’s calendar boundary', async () => {
      const later = now.plus({ months: 2 });
      await Subscription.create({ userId: people.client._id, stripeId: 'paid-later-fixture', serviceIds: ['training'], dogCount: 2, status: 'active', ...manualMonthTerm(later.toISODate()) });
      const booking = await Booking.findById(bookingId);
      await call('admin', 'post', '/api/client-schedule/changes', { bookingId, revision: booking.updatedAt.toISOString(), additions: [{ date: later.toISODate(), time: '13:00' }], removals: [], note: 'Outside original term.' }).expect(400);
      assert.equal(await Slot.exists({ _id: `${later.toISODate()}|13:00` }), null);
    });
    await t.test('future and historical months stay inactive outside their exact window', async () => {
      for (const [key, date] of [['future', now.plus({ months: 2 }).toISODate()], ['past', '2026-01-01']]) {
        const r = await save('admin', key, 0, { startDate: date }).expect(200); assert.equal(r.body.membership.manual, false);
        assert.deepEqual((await getEntitlements(people[key]._id)).services, []); assert.equal(await Booking.countDocuments({ userId: people[key]._id }), 1);
      }
    });
    await t.test('existing dated onboarding reuses its training grant and booking', async () => {
      const r = await call('admin', 'post', '/api/admin/users', { name: 'Onboarded client', email: 'onboarded@example.test', membershipStartDate: start, trainingDogCount: 1 }).expect(201);
      const id = r.body.user.id, before = await Booking.findOne({ userId: id });
      const changed = await call('admin', 'patch', `/api/admin/memberships/${id}`, { enabled: true, expectedRevision: 0, startDate: start, trainingDogCount: 2 }).expect(200);
      assert.equal(changed.body.membership.trainingBookingId, String(before._id)); assert.equal(await Booking.countDocuments({ userId: id }), 1); assert.equal(await Subscription.countDocuments({ userId: id, serviceIds: 'training' }), 1);
    });
    await t.test('concurrent setup commits only one covered request', async () => {
      const results = await Promise.all([save('admin', 'race', 0), save('david', 'race', 0)]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(await Booking.countDocuments({ userId: people.race._id }), 1); assert.equal(await Subscription.countDocuments({ userId: people.race._id, serviceIds: 'training' }), 1);
    });
    await t.test('legacy online-only schedule can restore training without changing its saved window or online grants', async () => {
      const legacy = await User.create({ name: 'Legacy member', role: 'member', email: 'legacy@example.test', passwordHash: 'fixture-only' });
      const path = `/api/admin/memberships/${legacy._id}`;
      await call('admin', 'patch', path, { enabled: true, expectedRevision: 0, startDate: '2026-08-24' }).expect(200);
      const before = await Subscription.find({ userId: legacy._id }).lean();
      const dates = await MemberAccess.findById(legacy._id).lean();
      assert.equal(await Booking.countDocuments({ userId: legacy._id }), 0);
      const body = { expectedRevision: 1, trainingDogCount: 2 };
      for (const who of [null, 'client', 'ashley']) await call(who, 'post', `${path}/training-setup`, body).expect(who ? 403 : 401);
      await call('admin', 'post', `${path}/training-setup`, { ...body, trainingDogCount: 0 }).expect(400);
      const result = await call('admin', 'post', `${path}/training-setup`, body).expect(200);
      const booking = await Booking.findById(result.body.training.bookingId);
      assert.equal(booking.paymentStatus, 'covered'); assert.equal(booking.dogCount, 2); assert.equal(booking.paidAt, undefined);
      assert.equal(booking.termStartsAt.toISOString(), dates.startsAt.toISOString()); assert.equal(booking.termEndsAt.toISOString(), dates.endsAt.toISOString());
      assert.deepEqual(await Subscription.find({ userId: legacy._id, serviceIds: 'online' }).lean(), before);
      const schedule = await call('admin', 'get', `/api/client-schedule?client=${legacy._id}&month=2026-09`).expect(200);
      assert.equal(schedule.body.trainingBookings.length, 1);
      await call('admin', 'post', `${path}/training-setup`, body).expect(409);
      await call('admin', 'post', `${path}/training-setup`, { ...body, expectedRevision: 2 }).expect(200);
      assert.equal(await Booking.countDocuments({ userId: legacy._id }), 1);
      assert.equal(await Subscription.countDocuments({ userId: legacy._id, serviceIds: 'training' }), 1);
      await call('admin', 'patch', path, { enabled: false, expectedRevision: 3 }).expect(200);
      await call('admin', 'post', `${path}/training-setup`, { ...body, expectedRevision: 4 }).expect(409);
    });
    await t.test('removing online access preserves covered training and real paid records', async () => {
      const paidBefore = await Subscription.findOne({ stripeId: 'paid-later-fixture' }).lean();
      await call('admin', 'patch', endpoint('client'), { enabled: false, expectedRevision: 3 }).expect(200);
      assert.deepEqual((await getEntitlements(people.client._id)).services, ['training']); assert.deepEqual(await Subscription.findOne({ stripeId: 'paid-later-fixture' }).lean(), paidBefore);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
