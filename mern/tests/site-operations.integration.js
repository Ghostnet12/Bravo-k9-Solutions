import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('owner monitoring and server-authoritative booking funnel', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'site_operations'; process.env.APP_ORIGIN = 'http://localhost:5173';
  delete process.env.VERCEL; delete process.env.STRIPE_SECRET_KEY;
  const logs = [], originalError = console.error; console.error = (...args) => logs.push(JSON.stringify(args));
  try {
    const { default: app } = await import('../server/client-services-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Booking, Session, FunnelVisit, SiteError } = await import('../server/models.js');
    const { digest } = await import('../server/auth.js');
    await connectDb();
    const people = {}, cookies = {};
    for (const [key, role] of [['owner', 'owner'], ['admin', 'owner'], ['staff', 'staff'], ['client', 'member']]) {
      people[key] = await User.create({ name: key, role, passwordHash: 'fixture-only' });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId: people[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    process.env.OWNER_USER_ID = String(people.owner._id);
    const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
    const report = () => call('owner', 'get', '/api/admin/site-health');
    const visit = { token: randomUUID(), channel: 'search', stage: 'visit' };
    const bookingBody = () => ({ requestKey: randomUUID(), serviceIds: ['online'], visits: [], dogName: 'Fixture dog', phone: '5551234567', address: '' });
    await t.test('only actual owner can read reports and database readiness is real', async () => {
      await call(null, 'get', '/api/admin/site-health').expect(401);
      for (const role of ['client', 'staff', 'admin']) await call(role, 'get', '/api/admin/site-health').expect(403);
      await report().expect(200);
      await call('owner', 'get', '/api/admin/site-health?days=9999').expect(400);
      const ready = await call(null, 'get', '/api/health/ready').expect(200); assert.equal(ready.body.databaseConnected, true);
      const command = mongoose.connection.db.command;
      mongoose.connection.db.command = () => { throw new Error('private connection details'); };
      try { const unavailable = await call(null, 'get', '/api/health/ready').expect(503); assert.equal(unavailable.body.databaseConnected, false); }
      finally { mongoose.connection.db.command = command; }
    });
    await t.test('strict private schemas, origin and staff/privacy exclusions', async () => {
      await call(null, 'post', '/api/telemetry/visit', { ...visit, email: 'private@example.test' }).expect(400);
      await request(app).post('/api/telemetry/visit').set('Origin', 'https://wrong.test').send(visit).expect(403);
      for (const role of ['owner', 'admin', 'staff']) await call(role, 'post', '/api/telemetry/visit', visit).expect(204);
      await call(null, 'post', '/api/telemetry/visit', visit).set('DNT', '1').expect(204);
      await call(null, 'post', '/api/telemetry/visit', visit).set('Sec-GPC', '1').expect(204);
      assert.equal(await FunnelVisit.countDocuments(), 0);
      await call(null, 'post', '/api/telemetry/error', { kind: 'page_crash', area: 'account', message: 'password private' }).expect(400);
      await call(null, 'post', '/api/telemetry/error', { kind: 'page_crash', area: '/account?secret=123' }).expect(400);
    });
    let saved;
    await t.test('visits and retries deduplicate; no client event can claim a booking or payment', async () => {
      await call(null, 'post', '/api/telemetry/visit', visit).expect(204);
      await call(null, 'post', '/api/telemetry/visit', visit).expect(204);
      await call('client', 'post', '/api/telemetry/visit', { ...visit, stage: 'booking_started' }).expect(204);
      await call('client', 'post', '/api/telemetry/visit', { ...visit, stage: 'paid' }).expect(400);
      assert.deepEqual((await report()).body.totals, { visits: 1, started: 1, saved: 0, paid: 0 });
      const body = bookingBody();
      saved = (await call('client', 'post', '/api/bookings', body).set('X-Bravo-Visit', visit.token).expect(201)).body.booking;
      const retry = await call('client', 'post', '/api/bookings', body).set('X-Bravo-Visit', visit.token).expect(201);
      assert.equal(retry.body.booking._id, saved._id); assert.equal(retry.body.booking.analyticsSession, undefined);
      assert.equal(await Booking.countDocuments(), 1);
      assert.deepEqual((await report()).body.totals, { visits: 1, started: 1, saved: 1, paid: 0 });
      const all = await call('client', 'get', '/api/bookings').expect(200); assert.equal(all.body.bookings[0].analyticsSession, undefined);
    });
    await t.test('payment requires persisted verified status; coverage and checkout URLs do not count', async () => {
      await Booking.updateOne({ _id: saved._id }, { $set: { paymentStatus: 'covered', checkoutUrl: 'https://example.test/paid' } });
      assert.equal((await report()).body.totals.paid, 0);
      await Booking.updateOne({ _id: saved._id }, { $set: { paymentStatus: 'paid' } });
      assert.equal((await report()).body.totals.paid, 0);
      await Booking.updateOne({ _id: saved._id }, { $set: { paidAt: new Date() } });
      assert.equal((await report()).body.totals.paid, 1);
      await Booking.updateOne({ _id: saved._id }, { $set: { paymentStatus: 'refunded' } });
      assert.equal((await report()).body.totals.paid, 1);
      const nextVisit = { ...visit, token: randomUUID(), channel: 'direct' };
      await call(null, 'post', '/api/telemetry/visit', nextVisit).expect(204);
      await call('staff', 'post', '/api/bookings', bookingBody()).set('X-Bravo-Visit', nextVisit.token).expect(201);
      assert.equal((await report()).body.totals.saved, 1);
      await call('client', 'post', '/api/bookings', bookingBody()).set('X-Bravo-Visit', nextVisit.token).set('Sec-GPC', '1').expect(201);
      assert.equal((await report()).body.totals.saved, 1);
    });
    await t.test('telemetry storage failure cannot fail a saved booking', async () => {
      const original = FunnelVisit.findOne;
      FunnelVisit.findOne = () => { throw new Error('secret database URI must stay private'); };
      try { await call('client', 'post', '/api/bookings', bookingBody()).set('X-Bravo-Visit', visit.token).expect(201); }
      finally { FunnelVisit.findOne = original; }
    });
    await t.test('browser and nested API errors are grouped without exposing secrets', async () => {
      for (let i = 0; i < 2; i++) await call('client', 'post', '/api/telemetry/error', { kind: 'page_crash', area: 'schedule' }).expect(204);
      const find = Booking.find; Booking.find = () => { throw new TypeError('mongodb://user:secret-password@private-host email@example.test'); };
      try {
        const failed = await call('client', 'get', '/api/bookings?private=email@example.test').expect(500);
        assert.ok(failed.headers['x-bravo-request-id']); assert.doesNotMatch(JSON.stringify(failed.body), /secret-password/);
      } finally { Booking.find = find; }
      // finish listeners persist asynchronously on the local test server.
      for (let i = 0; i < 30 && !await SiteError.exists({ source: 'server' }); i++) await new Promise(r => setTimeout(r, 20));
      const data = (await report()).body;
      assert.equal(data.errors.find(e => e.kind === 'page_crash').count, 2);
      assert.equal(data.errors.find(e => e.source === 'server').status, 500);
      assert.doesNotMatch(JSON.stringify(data), /email@example|secret-password|private-host|analyticsSession|token/);
      assert.doesNotMatch(logs.join('\n'), /secret-password|private-host|email@example/);
    });
    await t.test('expired data is excluded before TTL cleanup, indexed, and ingestion is bounded', async () => {
      await FunnelVisit.updateMany({}, { $set: { expiresAt: new Date(0) } });
      assert.equal((await report()).body.totals.visits, 0);
      assert.ok((await FunnelVisit.collection.indexes()).some(i => i.expireAfterSeconds === 0));
      assert.ok((await SiteError.collection.indexes()).some(i => i.expireAfterSeconds === 0));
      let limited = false;
      for (let i = 0; i < 12; i++) { const r = await call('client', 'post', '/api/telemetry/error', { kind: 'page_crash', area: 'schedule' }); if (r.status === 429) { limited = true; break; } }
      assert.equal(limited, true);
    });
  } finally { console.error = originalError; await mongoose.disconnect(); await replica.stop(); }
});
