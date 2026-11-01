// Disposable local replica set only. No production records or provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../server/client-services-app.js';
import { User, Session, AuditEvent } from '../server/models.js';
import { TransportBreeder, TransportTrip } from '../server/transport-models.js';
import { digest } from '../server/auth.js';

test('private breeder and client transport lifecycle', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.5' } });
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'bravo_transport_test';
  process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.TRANSPORT_GPS_WEBHOOK_SECRET = 'disposable-test-secret-'.repeat(3);
  t.after(async () => { await mongoose.disconnect(); await replica.stop(); });
  await request(app).get('/api/health/ready').expect(200);
  const identities = {};
  for (const [index, name] of ['owner', 'breeder', 'otherBreeder', 'client', 'stranger', 'staff'].entries()) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@example.test`, passwordHash: 'unused', role: name === 'owner' ? 'owner' : name === 'staff' ? 'staff' : 'member' });
    const token = String(index + 1).repeat(64);
    await Session.create({ tokenHash: digest(token), userId: user._id, credentialVersion: 0, issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    identities[name] = { user, cookie: `bravo_session=${token}` };
  }
  const call = (who, method, path, body) => {
    const req = request(app)[method](path).set('Cookie', identities[who].cookie);
    return method === 'get' ? req : req.set('Origin', process.env.APP_ORIGIN).send(body);
  };
  const gps = (input, options = {}) => {
    const body = JSON.stringify(input), timestamp = options.timestamp || String(Math.floor(Date.now() / 1000));
    const signature = options.signature || createHmac('sha256', process.env.TRANSPORT_GPS_WEBHOOK_SECRET).update(timestamp + '.').update(body).digest('hex');
    return request(app).post('/api/transport/gps').set('Content-Type', 'application/json').set('X-Bravo-Timestamp', timestamp).set('X-Bravo-Signature', signature).send(body);
  };
  let breederId, tripId;
  const base = { dogName: 'Gunner', pickup: 'Aberdeen, SD', destination: 'Omaha, NE', clientEmail: 'client@example.test', breederId: null, deviceId: 'durango-test', pickupAt: '', etaAt: '' };
  await t.test('authentication, CSRF and owner-only controls', async () => {
    await request(app).get('/api/transport').expect(401);
    await call('client', 'post', '/api/transport/breeders', { name: 'Forbidden', accountEmail: 'client@example.test' }).expect(403);
    await call('staff', 'post', '/api/transport/trips', base).expect(403);
    await request(app).post('/api/transport/breeders').set('Cookie', identities.owner.cookie).set('Origin', 'https://foreign.example').send({ name: 'Forbidden', accountEmail: 'breeder@example.test' }).expect(403);
    const result = await call('owner', 'post', '/api/transport/breeders', { name: 'Prairie Kennels', accountEmail: 'breeder@example.test' }).expect(201); breederId = result.body.id;
    const trip = await call('owner', 'post', '/api/transport/trips', { ...base, breederId }).expect(201); tripId = trip.body.id;
  });
  await t.test('exact assignment isolates lists, IDs, private identifiers and account data', async () => {
    for (const who of ['client', 'breeder']) {
      const list = await call(who, 'get', '/api/transport').expect(200);
      assert.equal(list.body.trips.length, 1); assert.equal(list.body.trips[0].breederName, 'Prairie Kennels');
      assert.equal(list.headers['cache-control'], 'private, no-store');
      const detail = (await call(who, 'get', `/api/transport/trips/${tripId}`).expect(200)).body.trip;
      assert.equal(detail.clientEmail, undefined); assert.equal(detail.deviceId, undefined); assert.equal(detail.clientId, undefined);
      assert.equal(detail.location, null); assert.equal(detail.locationState, 'paused');
    }
    for (const who of ['otherBreeder', 'stranger', 'staff']) {
      assert.equal((await call(who, 'get', '/api/transport').expect(200)).body.trips.length, 0);
      await call(who, 'get', `/api/transport/trips/${tripId}`).expect(404);
    }
    await call('stranger', 'get', '/api/transport/trips/not-an-id').expect(404);
  });
  await t.test('no sharing before configured GPS or pickup; revisions prevent lost edits', async () => {
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: 0, sharingEnabled: true }).expect(200);
    let trip = await TransportTrip.findById(tripId); assert.equal(trip.sharingEnabled, false);
    const secret = process.env.TRANSPORT_GPS_WEBHOOK_SECRET; delete process.env.TRANSPORT_GPS_WEBHOOK_SECRET;
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: 1, status: 'picked_up', sharingEnabled: true }).expect(400);
    await request(app).post('/api/transport/gps').send({}).expect(503);
    process.env.TRANSPORT_GPS_WEBHOOK_SECRET = secret;
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: 1, status: 'picked_up', sharingEnabled: true, note: 'Picked up safely.' }).expect(200);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: 1, note: 'Stale edit' }).expect(409);
    trip = (await call('client', 'get', `/api/transport/trips/${tripId}`).expect(200)).body.trip;
    assert.equal(trip.locationState, 'waiting'); assert.equal(trip.events.at(-1).note, 'Picked up safely.');
  });
  await t.test('signed GPS updates only active assigned trips; invalid/tampered/stale input fails', async () => {
    const input = { deviceId: 'durango-test', latitude: 45.46, longitude: -98.48, accuracy: 15, observedAt: new Date().toISOString() };
    await gps(input, { signature: '0'.repeat(64) }).expect(401);
    await gps(input, { timestamp: String(Math.floor(Date.now() / 1000) - 600) }).expect(401);
    await gps({ ...input, latitude: 91 }).expect(400);
    await gps({ ...input, observedAt: new Date(Date.now() + 86400000).toISOString() }).expect(400);
    await gps({ ...input, deviceId: 'wrong-vehicle' }).expect(202);
    assert.equal((await TransportTrip.findById(tripId)).location, undefined);
    await gps(input).expect(202);
    let detail = (await call('client', 'get', `/api/transport/trips/${tripId}`).expect(200)).body.trip;
    assert.equal(detail.locationState, 'live'); assert.equal(detail.location.latitude, 45.46);
    await gps({ ...input, latitude: 46, observedAt: new Date(Date.parse(input.observedAt) - 1).toISOString() }).expect(202);
    await gps(input).expect(202);
    assert.equal((await TransportTrip.findById(tripId)).location.latitude, 45.46);
    await TransportTrip.updateOne({ _id: tripId }, { $set: { 'location.observedAt': new Date(Date.now() - 180000) } });
    detail = (await call('breeder', 'get', `/api/transport/trips/${tripId}`).expect(200)).body.trip;
    assert.equal(detail.locationState, 'stale');
  });
  await t.test('pausing, changing vehicles and resuming clear location and reject pre-trip fixes', async () => {
    let record = await TransportTrip.findById(tripId);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: record.revision, sharingEnabled: false }).expect(200);
    assert.equal((await TransportTrip.findById(tripId)).location, undefined);
    await gps({ deviceId: 'durango-test', latitude: 45, longitude: -98, observedAt: new Date().toISOString() }).expect(202);
    assert.equal((await TransportTrip.findById(tripId)).location, undefined);
    record = await TransportTrip.findById(tripId);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: record.revision, sharingEnabled: true, deviceId: 'new-vehicle' }).expect(200);
    const past = new Date(Date.now() - 60000).toISOString();
    await gps({ deviceId: 'new-vehicle', latitude: 45, longitude: -98, observedAt: past }).expect(202);
    assert.equal((await TransportTrip.findById(tripId)).location, undefined);
    await gps({ deviceId: 'new-vehicle', latitude: 45, longitude: -98, observedAt: new Date().toISOString() }).expect(202);
    assert.ok((await TransportTrip.findById(tripId)).location);
  });
  await t.test('breeder access can be revoked independently; disabled breeder trips remain manageable', async () => {
    await call('owner', 'patch', `/api/transport/breeders/${breederId}`, { revision: 0, enabled: false }).expect(200);
    await call('breeder', 'get', `/api/transport/trips/${tripId}`).expect(404);
    await call('client', 'get', `/api/transport/trips/${tripId}`).expect(200);
    const record = await TransportTrip.findById(tripId);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: record.revision, breederId, note: 'Rest stop complete.' }).expect(200);
    await call('owner', 'patch', `/api/transport/breeders/${breederId}`, { revision: 1, enabled: true }).expect(200);
    await call('breeder', 'get', `/api/transport/trips/${tripId}`).expect(200);
  });
  await t.test('delivery clears location, stops GPS writes and cannot be reopened', async () => {
    const record = await TransportTrip.findById(tripId);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: record.revision, status: 'delivered', note: 'Delivered to the client.' }).expect(200);
    await gps({ deviceId: 'new-vehicle', latitude: 45.5, longitude: -98, observedAt: new Date().toISOString() }).expect(202);
    const detail = (await call('client', 'get', `/api/transport/trips/${tripId}`).expect(200)).body.trip;
    assert.equal(detail.locationState, 'ended'); assert.equal(detail.location, null); assert.equal(detail.sharingEnabled, false);
    assert.equal((await TransportTrip.findById(tripId)).location, undefined);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: detail.revision, status: 'in_transit', sharingEnabled: true }).expect(400);
  });
  await t.test('blocking an assigned client does not prevent updates, pausing or delivery', async () => {
    const body = { ...base, clientEmail: 'stranger@example.test', deviceId: 'blocked-client-vehicle' };
    const created = await call('owner', 'post', '/api/transport/trips', body).expect(201);
    const path = `/api/transport/trips/${created.body.id}`;
    const update = async changes => {
      const record = await TransportTrip.findById(created.body.id);
      return call('owner', 'patch', path, { ...body, revision: record.revision, ...changes });
    };
    assert.equal((await update({ status: 'picked_up', sharingEnabled: true })).status, 200);
    await gps({ deviceId: body.deviceId, latitude: 45, longitude: -98, observedAt: new Date().toISOString() }).expect(202);
    assert.ok((await TransportTrip.findById(created.body.id)).location);
    await User.updateMany({ _id: { $in: [identities.stranger.user._id, identities.otherBreeder.user._id] } }, { $set: { blocked: true } });
    await call('stranger', 'get', path).expect(401);
    assert.equal((await update({ status: 'rest_stop', note: 'Care stop complete.' })).status, 200);
    assert.equal(String((await TransportTrip.findById(created.body.id)).clientId), String(identities.stranger.user._id));
    assert.equal((await update({ clientEmail: 'otherbreeder@example.test' })).status, 400, 'new blocked assignees remain forbidden');
    await call('owner', 'post', '/api/transport/trips', body).expect(400);
    assert.equal((await update({ sharingEnabled: false })).status, 200);
    assert.equal((await TransportTrip.findById(created.body.id)).location, undefined);
    assert.equal((await update({ sharingEnabled: true })).status, 200);
    await gps({ deviceId: body.deviceId, latitude: 45, longitude: -98, observedAt: new Date().toISOString() }).expect(202);
    assert.ok((await TransportTrip.findById(created.body.id)).location);
    assert.equal((await update({ status: 'delivered' })).status, 200);
    const completed = await TransportTrip.findById(created.body.id);
    assert.equal(completed.status, 'delivered'); assert.equal(completed.sharingEnabled, false); assert.equal(completed.location, undefined);
    assert.equal(String(completed.clientId), String(identities.stranger.user._id));
    await call('stranger', 'get', path).expect(401);
  });
  await t.test('client reassignment and account blocking revoke reads immediately', async () => {
    const record = await TransportTrip.findById(tripId);
    await call('owner', 'patch', `/api/transport/trips/${tripId}`, { revision: record.revision, clientEmail: '' }).expect(200);
    await call('client', 'get', `/api/transport/trips/${tripId}`).expect(404);
    await User.updateOne({ _id: identities.breeder.user._id }, { $set: { blocked: true } });
    await call('breeder', 'get', `/api/transport/trips/${tripId}`).expect(401);
    assert.ok(await AuditEvent.countDocuments({ action: 'transport.trip.update' }));
    assert.equal(await TransportBreeder.countDocuments(), 1);
    const audits = JSON.stringify(await AuditEvent.find({ targetType: 'transport' }).lean());
    assert.ok(!audits.includes('latitude')); assert.ok(!audits.includes('client@example.test'));
  });
});
