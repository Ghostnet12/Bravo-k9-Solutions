import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';

test('client removal is staff-only, confirmed, atomic and retains payment history', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'client_removal'; process.env.APP_ORIGIN = 'http://localhost:5173';
  try {
    const { default: app } = await import('../server/client-services-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Booking, Subscription, Session, Settings, Slot, PasswordReset, AuditEvent } = await import('../server/models.js');
    const { digest } = await import('../server/auth.js');
    await connectDb();
    const users = {}, cookies = {};
    for (const [key, role] of Object.entries({ owner: 'owner', admin: 'owner', staff: 'staff', client: 'member', other: 'member', automatic: 'member', checkout: 'member', empty: 'member' })) {
      users[key] = await User.create({ name: key, role, email: `${key}@example.test`, passwordHash: 'fixture-only' });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId: users[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
    const path = key => `/api/admin/clients/${users[key]._id}`;
    const confirmation = { confirmRemoval: true };
    const date = DateTime.now().setZone('America/Chicago').plus({ days: 3 }).toISODate(), paidAt = new Date();
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1,2,3,4,5,6,7], hours: ['10:00','11:00'], overrides: [] } });
    const booking = await Booking.create({ userId: users.client._id, staffId: users.staff._id, requestKey: 'paid', serviceIds: ['training'], visits: [{ date, time: '10:00', service: 'training' }], paymentStatus: 'paid', status: 'confirmed', paidAt, stripePaymentIntentId: 'pi_history', quote: { dueNowCents: 20000 } });
    const otherBooking = await Booking.create({ userId: users.other._id, staffId: users.owner._id, requestKey: 'other', serviceIds: ['training'], visits: [{ date, time: '10:00', service: 'training' }], paymentStatus: 'covered', status: 'confirmed' });
    await Slot.create([{ _id: `${date}|10:00`, bookingId: booking._id, date, time: '10:00' }, { _id: `${date}|10:00|${otherBooking._id}`, bookingId: otherBooking._id, date, time: '10:00' }, { _id: `${date}|11:00`, date, time: '11:00', reason: 'Shared closure' }]);
    const term = await Subscription.create({ userId: users.client._id, stripeId: 'manual:history', status: 'active', serviceIds: ['training'], autoPayDisabled: true, validFrom: paidAt, validUntil: new Date(Date.now() + 30 * 86400000) });
    await PasswordReset.create({ _id: 'fixture-reset', userId: users.client._id, expiresAt: new Date(Date.now() + 3600000) });
    await t.test('anonymous clients and cross-origin requests cannot remove accounts', async () => {
      await call(null, 'delete', path('client'), confirmation).expect(401);
      await call('other', 'delete', path('client'), confirmation).expect(403);
      await call('client', 'delete', path('client'), confirmation).expect(403);
      await request(app).delete(path('client')).set('Cookie', cookies.staff).set('Origin', 'https://unrelated.example').send(confirmation).expect(403);
      await call('staff', 'delete', path('client'), { confirmRemoval: false }).expect(400);
      assert.equal((await User.findById(users.client._id)).blocked, false);
    });
    await t.test('all team identities and the owner are protected from this endpoint', async () => {
      for (const actor of ['staff','admin','owner']) for (const target of ['owner','admin','staff']) await call(actor, 'delete', path(target), confirmation).expect(403);
      await call('owner', 'delete', path('other'), { ...confirmation, role: 'member' }).expect(400);
      assert.equal(await AuditEvent.countDocuments({ action: 'client.removed' }), 0);
    });
    await t.test('automatic billing and active checkout require resolution before removal', async () => {
      await Subscription.create({ userId: users.automatic._id, stripeId: 'sub_automatic', status: 'active', autoPayDisabled: false });
      await Booking.create({ userId: users.checkout._id, requestKey: 'checkout', paymentStatus: 'unpaid', checkoutStarting: true });
      await call('staff', 'delete', path('automatic'), confirmation).expect(409);
      await call('owner', 'delete', path('checkout'), confirmation).expect(409);
      for (const key of ['automatic','checkout']) assert.equal((await User.findById(users[key]._id)).blocked, false);
    });
    await t.test('staff removal ends access and frees only this client’s reservations exactly once', async () => {
      const results = await Promise.all([call('staff', 'delete', path('client'), confirmation), call('admin', 'delete', path('client'), confirmation)]);
      assert.deepEqual(results.map(r => r.status), [200,200]);
      const saved = await User.findById(users.client._id); assert.equal(saved.blocked, true); assert.ok(saved.removedAt); assert.ok(saved.removedBy);
      assert.equal(await Session.countDocuments({ userId: saved._id }), 0); assert.equal(await PasswordReset.countDocuments({ userId: saved._id }), 0);
      assert.equal(await Slot.countDocuments({ bookingId: booking._id }), 0); assert.equal(await Slot.countDocuments({ bookingId: otherBooking._id }), 1); assert.ok(await Slot.exists({ _id: `${date}|11:00` }));
      assert.equal(await AuditEvent.countDocuments({ action: 'client.removed', targetId: String(saved._id) }), 1);
      const cancelled = await Booking.findById(booking._id); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.paymentStatus, 'paid'); assert.equal(cancelled.paidAt.getTime(), paidAt.getTime()); assert.equal(cancelled.stripePaymentIntentId, 'pi_history'); assert.equal(cancelled.quote.dueNowCents, 20000); assert.equal(cancelled.refundId, undefined);
      assert.equal((await Subscription.findById(term._id)).status, 'active');
      await call('client', 'get', '/api/bookings').expect(401);
    });
    await t.test('removed clients disappear from searches and cannot be revived by stale profile edits', async () => {
      const ownerList = (await call('owner', 'get', '/api/admin/users').expect(200)).body.users;
      assert.ok(!ownerList.some(u => u._id === String(users.client._id)));
      const staffList = (await call('staff', 'get', '/api/admin/clients?clientsOnly=1').expect(200)).body.clients;
      for (const key of ['client','owner','admin','staff']) assert.ok(!staffList.some(u => u._id === String(users[key]._id)));
      const assignments = (await call('staff', 'get', `/api/admin/trainers/${users.staff._id}/clients`).expect(200)).body.bookings; assert.equal(assignments.length, 0);
      await call('owner', 'patch', `/api/admin/users/${users.client._id}`, { blocked: false }).expect(404);
      const { createBooking } = await import('../server/bookings.js');
      await assert.rejects(createBooking(users.client._id, { requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', serviceIds: ['training'], visits: [], dogName: 'Fixture', phone: '6055550100', address: 'Fixture address' }), /no longer active/);
    });
    await t.test('owner and administrator can remove client-only accounts with no bookings', async () => {
      await call('owner', 'delete', path('empty'), confirmation).expect(200);
      await call('admin', 'delete', path('other'), confirmation).expect(200);
      assert.equal((await User.findById(users.other._id)).blocked, true);
      assert.equal((await Booking.findById(otherBooking._id)).status, 'cancelled');
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
