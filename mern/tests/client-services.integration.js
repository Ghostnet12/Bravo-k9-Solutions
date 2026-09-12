import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';

test('client services: schedules, notifications, recovery and monthly payments', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'client_services'; process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.CRON_SECRET = 'isolated-test-cron';
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Booking, Subscription, Session, DirectMessage, Notification, PasswordReset, StripeEvent } = await import('../server/models.js');
  const { digest, hashPassword, verifyPassword } = await import('../server/auth.js');
  const { processStripeEvent } = await import('../server/payments.js');
  const { getEntitlements } = await import('../server/bookings.js');
  const { membershipNotifications } = await import('../server/membership-notifications.js');
  const { quote } = await import('../shared/catalog.js');
  try {
    await connectDb();
    const users = {}, cookies = {};
    for (const [name, role] of Object.entries({ owner: 'owner', staff: 'staff', secondStaff: 'staff', client: 'member', other: 'member' })) {
      users[name] = await User.create({ name, role, email: `${name}@example.test`, passwordHash: await hashPassword('fixture-administrator-password'), stripeCustomerId: `cus_${name}` });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId: users[name]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[name] = `bravo_session=${token}`;
    }
    const call = (name, method, path, body) => { let req = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (name) req = req.set('Cookie', cookies[name]); return body === undefined ? req : req.send(body); };
    const booking = await Booking.create({ userId: users.client._id, requestKey: 'fixture', serviceIds: ['training'], dogCount: 1, dogName: 'Fixture Dog', visits: [{ date: '2026-09-21', time: '10:00', service: 'training' }, { date: '2026-10-02', time: '11:00', service: 'training' }], status: 'confirmed', paymentStatus: 'unpaid', stripeSessionId: 'cs_fixture', quote: quote(['training']) });
    await t.test('schedule shows saved visits by month and protects other clients', async () => {
      const url = `/api/client-schedule?client=${users.client._id}&month=2026-09`;
      await call(null, 'get', url).expect(401); await call('other', 'get', url).expect(403);
      for (const who of ['client', 'staff', 'owner']) { const r = await call(who, 'get', url).expect(200); assert.equal(r.body.visits.length, 1); assert.equal(r.body.visits[0].date, '2026-09-21'); assert.equal(r.body.client.name, 'client'); assert.equal(r.body.client.email, undefined); }
      const october = await call('client', 'get', '/api/client-schedule?month=2026-10').expect(200); assert.equal(october.body.visits[0].date, '2026-10-02');
      await call('client', 'get', '/api/client-schedule?month=2026-99').expect(400);
    });
    await t.test('every staff member receives client messages with independent read receipts', async () => {
      const message = await DirectMessage.create({ memberId: users.client._id, senderId: users.client._id, senderName: 'client', senderRole: 'member', recipientId: users.staff._id, body: 'Fixture message' });
      for (const who of ['staff', 'secondStaff', 'owner']) { const r = await call(who, 'get', '/api/notifications').expect(200); assert.equal(r.body.items.length, 1); }
      await call('staff', 'post', '/api/notifications/read', { ids: [`message:${message._id}`] }).expect(200);
      assert.equal((await call('staff', 'get', '/api/notifications')).body.items.length, 0);
      assert.equal((await call('secondStaff', 'get', '/api/notifications')).body.items.length, 1);
      assert.equal((await call('other', 'get', '/api/notifications')).body.items.length, 0);
    });
    await t.test('verified one-time monthly payments grant exactly one term across webhook retries', async () => {
      const event = { id: 'evt_paid', type: 'checkout.session.completed', created: Math.floor(Date.now()/1000), data: { object: { id: 'cs_fixture', mode: 'payment', metadata: { app: 'bravo-k9', billing: 'manual-month-v1', userId: String(users.client._id), bookingId: String(booking._id) }, payment_status: 'paid', currency: 'usd', amount_total: 20000, customer: 'cus_client', client_reference_id: String(booking._id), payment_intent: 'pi_fixture' } } };
      await processStripeEvent(event, {}); const first = await Subscription.findOne({ bookingId: booking._id }).lean();
      await processStripeEvent(event, {}); await processStripeEvent({ ...event, id: 'evt_paid_duplicate', created: event.created + 10 }, {});
      assert.equal(await Subscription.countDocuments({ bookingId: booking._id }), 1); const current = await Subscription.findOne({ bookingId: booking._id }).lean(); assert.equal(current.validUntil.getTime(), first.validUntil.getTime()); assert.equal(current.autoPayDisabled, true);
      const falsePayment = { ...event, id: 'evt_wrong_amount', data: { object: { ...event.data.object, amount_total: 1 } } }; await assert.rejects(processStripeEvent(falsePayment, {}), /amount mismatch/); assert.equal(await StripeEvent.exists({ _id: falsePayment.id }), null);
    });
    await t.test('renewal ownership and concurrent taps do not create duplicate purchases', async () => {
      const term = await Subscription.findOne({ bookingId: booking._id }); term.validUntil = new Date(Date.now() + 86400000); await term.save();
      await call('other', 'post', '/api/membership-terms/renew', { termId: term.stripeId, requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }).expect(404);
      const body = { termId: term.stripeId, requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
      const first = await call('client', 'post', '/api/membership-terms/renew', body).expect(200); const second = await call('client', 'post', '/api/membership-terms/renew', body).expect(200); assert.equal(first.body.booking._id, second.body.booking._id); assert.equal(await Booking.countDocuments({ renewalOf: term.stripeId }), 1);
    });
    await t.test('daily notifications are deduplicated, private and include expiration', async () => {
      const now = new Date('2026-11-10T15:00:00Z'); const end = DateTime.fromJSDate(now, { zone: 'America/Chicago' }).plus({ days: 1 }).toJSDate();
      const term = await Subscription.create({ userId: users.other._id, stripeId: 'manual:reminder-fixture', serviceIds: ['training'], status: 'active', validFrom: new Date('2026-10-11T15:00:00Z'), validUntil: end });
      await membershipNotifications(now); await membershipNotifications(now);
      assert.equal(await Notification.countDocuments({ _id: /manual:reminder-fixture/ }), 2);
      await membershipNotifications(new Date(end.getTime() + 1)); assert.equal(await Notification.countDocuments({ _id: /manual:reminder-fixture/ }), 4);
      const clientNotices = (await call('client', 'get', '/api/notifications')).body.items; assert.equal(clientNotices.some(item => item.id.includes('reminder-fixture')), false);
      term.validUntil = new Date(Date.now() - 1000); await term.save(); assert.deepEqual((await getEntitlements(users.other._id)).services, []);
      await request(app).get('/api/cron/memberships').expect(401); await request(app).get('/api/cron/memberships').set('Authorization', 'Bearer isolated-test-cron').expect(200);
    });
    await t.test('recovery requires administrator reauthentication and token is one-use and hashed', async () => {
      const path = `/api/admin/recovery/${users.client._id}`;
      await call('staff', 'post', path, { currentPassword: 'fixture-administrator-password' }).expect(403);
      await call('owner', 'post', path, { currentPassword: 'wrong' }).expect(403);
      const link = await call('owner', 'post', path, { currentPassword: 'fixture-administrator-password' }).expect(200); const token = link.body.url.split('#')[1];
      const stored = await PasswordReset.findOne({ userId: users.client._id }).lean(); assert.equal(stored._id, digest(token)); assert.notEqual(stored._id, token);
      const body = { token, password: 'new-fixture-password-12345' }; await call(null, 'post', '/api/auth/recover', body).expect(200); await call(null, 'post', '/api/auth/recover', body).expect(400);
      assert.equal(await Session.countDocuments({ userId: users.client._id }), 0); const updated = await User.findById(users.client._id).select('+passwordHash'); assert.equal(await verifyPassword(body.password, updated.passwordHash), true); assert.equal((await User.findById(users.client._id).lean()).passwordHash, undefined);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
