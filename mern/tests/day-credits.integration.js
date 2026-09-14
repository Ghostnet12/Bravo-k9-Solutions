import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { creditedEnd, remainingDays } from '../shared/day-credits.js';

test('staff day credits extend real membership access and scheduling atomically', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'day_credits'; process.env.APP_ORIGIN = 'http://localhost:5173';
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app } = await import('../server/client-services-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Booking, Subscription, Session, Settings, Slot, MemberAccess, MembershipCredit, AuditEvent, Notification } = await import('../server/models.js');
    const { digest } = await import('../server/auth.js');
    const { processStripeEvent } = await import('../server/payments.js');
    const { getEntitlements } = await import('../server/bookings.js');
    await connectDb();
    const people = {}, cookies = {};
    for (const [key, role] of [['owner', 'owner'], ['admin', 'owner'], ['staff', 'staff'], ['client', 'member'], ['other', 'member']]) {
      people[key] = await User.create({ name: key, role, dogName: 'Gunner', passwordHash: 'isolated-test-only' });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId: people[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    process.env.OWNER_USER_ID = String(people.owner._id);
    const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['10:00', '11:00'], overrides: [] } });
    const now = DateTime.now().setZone('America/Chicago').startOf('day'), end = now.plus({ days: 6 }).toJSDate(), start = now.minus({ days: 24 }).toJSDate();
    const missed = now.plus({ days: 1 }).toISODate(), missedPast = now.minus({ days: 1 }).toISODate();
    const booking = await Booking.create({ userId: people.client._id, requestKey: randomUUID(), dogName: 'Gunner', dogCount: 2, serviceIds: ['training'], status: 'confirmed', paymentStatus: 'covered', staffId: people.staff._id, staffIds: [people.staff._id], trainerAcceptedIds: [people.staff._id], trainerAcceptedAt: now.toJSDate(), visits: [{ date: missed, time: '10:00', service: 'training' }, { date: missedPast, time: '11:00', service: 'training' }], termStartsAt: start, termEndsAt: end });
    const term = await Subscription.create({ stripeId: 'grant:fixture', source: 'grant', userId: people.client._id, serviceIds: ['training'], bookingId: booking._id, status: 'active', dogCount: 2, autoPayDisabled: true, validFrom: start, validUntil: end });
    await MemberAccess.create({ _id: people.client._id, enabled: true, revision: 1, startsAt: start, endsAt: end, trainingSubscriptionId: term.stripeId, trainingBookingId: booking._id });
    const online = await Subscription.create({ stripeId: 'grant:online', source: 'grant', userId: people.client._id, serviceIds: ['online'], status: 'active', validFrom: start, validUntil: end });
    await Slot.create({ _id: 'test-missed-slot', bookingId: booking._id, date: missed, time: '10:00' });
    const payload = (extra = {}) => ({ clientId: String(people.client._id), termId: term.stripeId, expectedEnd: end.toISOString(), requestKey: randomUUID(), days: 1, reason: 'Rain', ...extra });
    const credit = (who, body) => call(who, 'post', '/api/client-schedule/credits', body);
    await Notification.create({ _id: `term:${term.stripeId}:${end.toISOString()}:tomorrow:client`, userId: people.client._id, staff: false, body: 'Stale reminder' });
    let first;
    await t.test('role, origin, invalid days, wrong client and stale-end guards make no changes', async () => {
      await credit(null, payload()).expect(401); await credit('client', payload()).expect(403);
      for (const days of [0, -1, 1.5, 32]) await credit('staff', payload({ days })).expect(400);
      await request(app).post('/api/client-schedule/credits').set('Cookie', cookies.staff).set('Origin', 'https://other.test').send(payload()).expect(403);
      await credit('staff', payload({ clientId: String(people.other._id) })).expect(409);
      await credit('staff', payload({ expectedEnd: start.toISOString() })).expect(409);
      assert.equal(await MembershipCredit.countDocuments(), 0);
    });
    await t.test('one day changes six to seven, cancels weather visit, releases slot and preserves assignments and money', async () => {
      first = payload({ missedDate: missed, reason: undefined }); await credit('staff', first).expect(200);
      const updated = await Subscription.findById(term._id), b = await Booking.findById(booking._id), grant = await MemberAccess.findById(people.client._id);
      assert.equal(remainingDays(end, now.toJSDate()), 6); assert.equal(remainingDays(updated.validUntil, now.toJSDate()), 7);
      assert.equal(updated.validUntil.toISOString(), creditedEnd(end, 1).toISOString()); assert.equal(b.termEndsAt.toISOString(), updated.validUntil.toISOString());
      assert.equal(grant.endsAt.toISOString(), updated.validUntil.toISOString()); assert.equal((await Subscription.findById(online._id)).validUntil.toISOString(), updated.validUntil.toISOString());
      assert.equal(grant.revision, 2); assert.equal(b.visits.length, 1); assert.equal(b.cancelledVisits.length, 1); assert.equal(await Slot.countDocuments({ bookingId: booking._id }), 0);
      assert.deepEqual(b.staffIds, booking.staffIds); assert.deepEqual(b.trainerAcceptedAt, booking.trainerAcceptedAt); assert.equal(b.paymentStatus, 'covered'); assert.equal(b.paidAt, undefined); assert.equal((await User.findById(people.client._id)).firstPaidAt, undefined);
      assert.equal(await MembershipCredit.countDocuments(), 1); assert.equal(await AuditEvent.countDocuments({ action: 'membership.days-credited' }), 1); assert.equal(await Notification.countDocuments({ _id: /^credit:/ }), 2); assert.equal(await Notification.countDocuments({ body: 'Stale reminder' }), 0);
    });
    await t.test('duplicate requests and already-credited dates cannot add days twice', async () => {
      await credit('staff', first).expect(200);
      await credit('staff', { ...first, days: 2, missedDate: undefined }).expect(409);
      await credit('admin', payload({ expectedEnd: creditedEnd(end, 1).toISOString(), missedDate: missed })).expect(409);
      assert.equal(await MembershipCredit.countDocuments(), 1);
    });
    await t.test('client sees history and can schedule a replacement on the newly covered day', async () => {
      const schedule = await call('client', 'get', `/api/client-schedule?month=${now.toFormat('yyyy-MM')}`).expect(200);
      assert.equal(schedule.body.dayCredits.length, 1); assert.equal(schedule.body.dayCredits[0].note, ''); assert.equal(schedule.body.dayCredits[0].reason, 'Other'); assert.equal(schedule.body.dayCredits[0].actorId, undefined);
      assert.equal(schedule.body.terms.find(t => t.stripeId === term.stripeId).creditedDays, 1);
      const at = DateTime.fromJSDate(end, { zone: 'America/Chicago' }), b = await Booking.findById(booking._id);
      await call('client', 'post', '/api/client-schedule/changes', { bookingId: String(b._id), revision: b.updatedAt.toISOString(), additions: [{ date: at.toISODate(), time: '10:00' }], removals: [] }).expect(200);
      const after = await Booking.findById(booking._id);
      await call('client', 'post', '/api/client-schedule/changes', { bookingId: String(b._id), revision: after.updatedAt.toISOString(), additions: [{ date: at.plus({ days: 1 }).toISODate(), time: '10:00' }], removals: [] }).expect(400);
      const me = await call('client', 'get', '/api/auth/me').expect(200); assert.equal(me.body.serviceDogCounts.training, 2); assert.equal(me.body.membership.active, true);
    });
    await t.test('past missed dates work; owner and administrator can credit; concurrent stale saves are rejected', async () => {
      const current = await Subscription.findById(term._id);
      await credit('admin', payload({ expectedEnd: current.validUntil.toISOString(), reason: 'Snow', missedDate: missedPast })).expect(200);
      const currentEnd = (await Subscription.findById(term._id)).validUntil.toISOString();
      const responses = await Promise.all(['owner', 'admin'].map(who => credit(who, payload({ expectedEnd: currentEnd, days: 2, reason: 'Trainer unavailable' }))));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal((await Subscription.findById(term._id)).creditedDays, 4);
      const revised = (await Subscription.findById(term._id)).validUntil.toISOString();
      const retry = payload({ expectedEnd: revised }); const duplicate = await Promise.all([credit('staff', retry), credit('staff', retry)]); assert.deepEqual(duplicate.map(r => r.status), [200, 200]);
      assert.equal((await Subscription.findById(term._id)).creditedDays, 5);
    });
    await t.test('invalid missed dates roll back, renewed or refunded months and blocked accounts reject credit', async () => {
      const before = await Subscription.findById(term._id).lean(), count = await MembershipCredit.countDocuments();
      await credit('owner', payload({ expectedEnd: before.validUntil.toISOString(), missedDate: now.plus({ days: 3 }).toISODate() })).expect(409);
      assert.deepEqual((await Subscription.findById(term._id)).validUntil, before.validUntil); assert.equal(await MembershipCredit.countDocuments(), count);
      await Subscription.updateOne({ _id: term._id }, { $set: { status: 'refunded' } }); await credit('owner', payload({ expectedEnd: before.validUntil.toISOString() })).expect(409);
      await Subscription.updateOne({ _id: term._id }, { $set: { status: 'active' } });
      await User.updateOne({ _id: people.client._id }, { $set: { blocked: true } }); await credit('owner', payload({ expectedEnd: before.validUntil.toISOString() })).expect(409); await User.updateOne({ _id: people.client._id }, { $set: { blocked: false } });
      const next = await Subscription.create({ userId: people.client._id, stripeId: 'next-fixture', renewalOf: term.stripeId, serviceIds: ['training'], status: 'active', validFrom: before.validUntil, validUntil: creditedEnd(before.validUntil, 30) });
      await credit('owner', payload({ expectedEnd: before.validUntil.toISOString() })).expect(409); await Subscription.deleteOne({ _id: next._id });
    });
    await t.test('renewal payment and a simultaneous credit cannot overlap the extra day', async () => {
      const before = await Subscription.findById(term._id);
      await User.updateOne({ _id: people.client._id }, { $set: { stripeCustomerId: 'cus_credit_renewal' } });
      const renewal = await Booking.create({ userId: people.client._id, requestKey: randomUUID(), renewalOf: term.stripeId, serviceIds: ['training'], dogCount: 2, status: 'requested', paymentStatus: 'unpaid', quote: { monthlyCents: 30000, dueNowCents: 30000 }, stripeSessionId: 'cs_credit_renewal', visits: [] });
      const event = { id: 'evt_credit_renewal', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: { id: 'cs_credit_renewal', mode: 'payment', payment_status: 'paid', currency: 'usd', amount_total: 30000, customer: 'cus_credit_renewal', client_reference_id: String(renewal._id), metadata: { app: 'bravo-k9', billing: 'manual-month-v1', userId: String(people.client._id), bookingId: String(renewal._id) } } } };
      const [response] = await Promise.all([credit('staff', payload({ expectedEnd: before.validUntil.toISOString() })), processStripeEvent(event, {})]);
      assert.ok([200, 409].includes(response.status));
      const current = await Subscription.findById(term._id), next = await Subscription.findOne({ bookingId: renewal._id });
      assert.equal(next.validFrom.toISOString(), current.validUntil.toISOString());
      assert.equal(current.creditedDays, before.creditedDays + (response.status === 200 ? 1 : 0));
    });
    await t.test('paid legacy terms retain credited access after a Stripe sync, without charging', async () => {
      const rawEnd = now.plus({ days: 2 }).toJSDate();
      await User.updateOne({ _id: people.other._id }, { $set: { stripeCustomerId: 'cus_fixture' } });
      const paid = await Subscription.create({ stripeId: 'sub_fixture', source: 'stripe', userId: people.other._id, serviceIds: ['training'], status: 'active', autoPayDisabled: true, validFrom: start, validUntil: rawEnd });
      await credit('staff', payload({ clientId: String(people.other._id), termId: paid.stripeId, expectedEnd: rawEnd.toISOString() })).expect(200);
      const sub = { id: paid.stripeId, metadata: { app: 'bravo-k9', serviceIds: '["training"]', userId: String(people.other._id) }, customer: 'cus_fixture', items: { data: [] }, current_period_start: start.getTime() / 1000, current_period_end: rawEnd.getTime() / 1000, status: 'canceled' };
      await processStripeEvent({ id: 'evt_credit_fixture', type: 'customer.subscription.deleted', created: Math.floor(Date.now() / 1000), data: { object: sub } }, { subscriptions: { retrieve: async () => sub } });
      assert.equal((await Subscription.findById(paid._id)).validUntil.toISOString(), creditedEnd(rawEnd, 1).toISOString());
      assert.ok((await getEntitlements(people.other._id)).services.includes('training'));
    });
    await t.test('expired memberships extend from their saved end, never start a free new month', async () => {
      const oldEnd = now.minus({ days: 10 }).toJSDate();
      const old = await Subscription.create({ stripeId: 'grant:old', userId: people.other._id, serviceIds: ['training'], source: 'grant', status: 'active', validFrom: now.minus({ days: 40 }).toJSDate(), validUntil: oldEnd });
      await credit('staff', payload({ clientId: String(people.other._id), termId: old.stripeId, expectedEnd: oldEnd.toISOString() })).expect(200);
      const updated = await Subscription.findById(old._id); assert.equal(updated.validUntil.toISOString(), creditedEnd(oldEnd, 1).toISOString()); assert.ok(updated.validUntil < new Date());
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
