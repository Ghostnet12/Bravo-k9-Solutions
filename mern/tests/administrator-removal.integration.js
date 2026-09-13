import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';

test('only the primary Owner deletes administrators; reminders stay authenticated and observable', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'administrator_removal'; process.env.APP_ORIGIN = 'http://localhost:5173'; delete process.env.STRIPE_SECRET_KEY; delete process.env.CRON_SECRET;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, PasswordReset, Booking, Slot, Subscription, Settings, TrainerSchedule, AuditEvent, Notification } = await import('../server/models.js');
  const { digest } = await import('../server/auth.js');
  const people = {}, cookies = {}, confirmation = { confirmRemoval: true };
  try {
    await connectDb();
    for (const [key, role] of Object.entries({ owner: 'owner', admin: 'owner', secondAdmin: 'owner', staff: 'staff', client: 'member', automatic: 'owner' })) {
      people[key] = await User.create({ name: key, email: `${key}@example.test`, role, passwordHash: 'isolated-fixture-only' });
      const token = randomBytes(32).toString('hex'); await Session.create({ userId: people[key]._id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    process.env.OWNER_USER_ID = String(people.owner._id);
    const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
    const path = key => `/api/admin/administrators/${people[key]._id}`;
    const date = DateTime.now().setZone('America/Chicago').plus({ days: 3 }).toISODate();
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['10:00', '11:00'], overrides: [] } });
    const solo = await Booking.create({ userId: people.client._id, staffId: people.admin._id, staffIds: [people.admin._id], requestedStaffId: people.admin._id, requestKey: 'solo', serviceIds: ['training'], status: 'confirmed', paymentStatus: 'paid', paidAt: new Date(), stripePaymentIntentId: 'pi_history', visits: [{ date, time: '10:00', service: 'training' }] });
    const joint = await Booking.create({ userId: people.client._id, staffId: people.admin._id, staffIds: [people.admin._id, people.staff._id], requestedStaffId: people.admin._id, requestedStaffIds: [people.admin._id, people.staff._id], trainerAcceptedIds: [people.staff._id], trainerAcceptanceRequired: true, requestKey: 'joint', serviceIds: ['training'], status: 'requested', paymentStatus: 'covered', visits: [{ date, time: '11:00', service: 'training' }] });
    const waiting = await Booking.create({ userId: people.client._id, requestedStaffId: people.admin._id, requestedStaffIds: [people.admin._id], requestKey: 'waiting', serviceIds: ['training'], status: 'waitlisted', paymentStatus: 'covered' });
    const historical = await Booking.create({ userId: people.client._id, staffId: people.admin._id, requestKey: 'history', status: 'cancelled', paymentStatus: 'paid' });
    await Slot.create([solo, joint].map(b => ({ _id: `${date}|${b.visits[0].time}|${b._id}`, date, time: b.visits[0].time, bookingId: b._id })));
    await TrainerSchedule.create({ _id: people.admin._id, enabled: true, hours: ['10:00'], weekdays: [1, 2, 3, 4, 5] });
    await PasswordReset.create({ _id: 'fixture-reset', userId: people.admin._id, expiresAt: new Date(Date.now() + 3600000) });

    await t.test('administrators, staff and clients cannot delete an administrator or spoof ownership', async () => {
      for (const who of [null, 'admin', 'secondAdmin', 'staff', 'client']) await call(who, 'delete', path('admin'), confirmation).expect(who ? 403 : 401);
      await call('secondAdmin', 'delete', path('admin'), { ...confirmation, isPrimaryOwner: true }).expect(403);
      await request(app).delete(path('admin')).set('Cookie', cookies.owner).set('Origin', 'https://unrelated.example').send(confirmation).expect(403);
      await call('owner', 'delete', path('admin'), { confirmRemoval: false }).expect(400);
      for (const target of ['owner', 'staff', 'client']) await call('owner', 'delete', path(target), confirmation).expect(403);
      assert.equal(await AuditEvent.countDocuments({ action: 'administrator.removed' }), 0); assert.equal((await User.findById(people.admin._id)).blocked, false);
    });
    await t.test('automatic billing prevents profile deletion until renewal is resolved', async () => {
      await Subscription.create({ userId: people.automatic._id, stripeId: 'sub_fixture', status: 'active', autoPayDisabled: false });
      await call('owner', 'delete', path('automatic'), confirmation).expect(409); assert.equal((await User.findById(people.automatic._id)).blocked, false);
    });
    await t.test('Owner removal preserves appointments and payments while revoking all access exactly once', async () => {
      const result = await call('owner', 'delete', `/api/admin/administrators/${String(people.admin._id).toUpperCase()}`, confirmation).expect(200); assert.equal(result.body.unassignedRequests, 2);
      await call('owner', 'delete', path('admin'), confirmation).expect(200);
      const removed = await User.findById(people.admin._id); assert.ok(removed.removedAt); assert.equal(removed.blocked, true); assert.equal(String(removed.removedBy), String(people.owner._id));
      assert.equal(await Session.countDocuments({ userId: removed._id }), 0); assert.equal(await PasswordReset.countDocuments({ userId: removed._id }), 0); assert.equal((await TrainerSchedule.findById(removed._id)).enabled, false);
      assert.equal(await AuditEvent.countDocuments({ action: 'administrator.removed' }), 1); assert.equal(await User.countDocuments(), 6);
      const savedSolo = await Booking.findById(solo._id); assert.equal(savedSolo.staffId, null); assert.equal(savedSolo.requestedStaffId, null); assert.equal(savedSolo.staffIds.length, 0); assert.equal(savedSolo.status, 'confirmed'); assert.equal(savedSolo.paymentStatus, 'paid'); assert.equal(savedSolo.stripePaymentIntentId, 'pi_history'); assert.equal(savedSolo.visits[0].time, '10:00');
      assert.equal(savedSolo.paidAt.getTime(), solo.paidAt.getTime()); assert.equal(savedSolo.refundId, undefined);
      const savedJoint = await Booking.findById(joint._id); assert.deepEqual(savedJoint.staffIds.map(String), [String(people.staff._id)]); assert.equal(String(savedJoint.staffId), String(people.staff._id)); assert.deepEqual(savedJoint.requestedStaffIds.map(String), [String(people.staff._id)]); assert.equal(savedJoint.trainerAcceptanceRequired, false); assert.ok(savedJoint.trainerAcceptedAt);
      const savedWaiting = await Booking.findById(waiting._id); assert.equal(savedWaiting.status, 'waitlisted'); assert.equal(savedWaiting.requestedStaffId, null); assert.equal(savedWaiting.requestedStaffIds.length, 0);
      assert.equal(await Slot.countDocuments({ bookingId: { $in: [solo._id, joint._id] } }), 2); assert.equal(String((await Booking.findById(historical._id)).staffId), String(removed._id));
      await call('admin', 'get', '/api/admin/users').expect(401);
      await call('owner', 'patch', `/api/admin/users/${removed._id}`, { blocked: false }).expect(404);
      assert.ok(!(await call('owner', 'get', '/api/admin/users').expect(200)).body.users.some(u => u._id === String(removed._id)));
      assert.ok(!(await call(null, 'get', '/api/team').expect(200)).body.team.some(u => u.id === String(removed._id)));
      await call('owner', 'patch', `/api/admin/bookings/${solo._id}/assignment`, { staffId: String(removed._id) }).expect(409);
      await call('owner', 'patch', `/api/admin/bookings/${solo._id}/assignment`, { staffId: String(people.owner._id) }).expect(200);
      assert.equal(String((await Booking.findById(solo._id)).staffId), String(people.owner._id));
    });
    await t.test('the daily endpoint rejects missing or wrong credentials and reports only completed checks', async () => {
      const status = await call('owner', 'get', '/api/admin/membership-status').expect(200); assert.equal(status.body.remindersConfigured, false); assert.equal(status.body.lastReminderRunAt, null);
      await call(null, 'get', '/api/cron/memberships').expect(401);
      const secret = randomBytes(32).toString('hex'); process.env.CRON_SECRET = secret;
      await request(app).get('/api/cron/memberships').set('Authorization', 'Bearer incorrect').expect(401);
      assert.equal(await AuditEvent.countDocuments({ action: 'membership.reminders.completed' }), 0);
      await Subscription.create({ userId: people.client._id, stripeId: 'grant:reminder-fixture', serviceIds: ['training'], status: 'active', autoPayDisabled: true, validUntil: DateTime.now().setZone('America/Chicago').plus({ days: 1 }).startOf('day').toJSDate() });
      const first = await request(app).get('/api/cron/memberships').set('Authorization', `Bearer ${secret}`).expect(200); assert.equal(first.body.created, 2);
      const repeated = await request(app).get('/api/cron/memberships').set('Authorization', `Bearer ${secret}`).expect(200); assert.equal(repeated.body.created, 0); assert.equal(await Notification.countDocuments(), 2);
      const configured = await call('owner', 'get', '/api/admin/membership-status').expect(200); assert.equal(configured.body.remindersConfigured, true); assert.ok(configured.body.lastReminderRunAt); assert.equal(JSON.stringify(configured.body).includes(secret), false);
      await call('staff', 'get', '/api/admin/membership-status').expect(403);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); delete process.env.CRON_SECRET; }
});
