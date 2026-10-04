import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { RoomServiceClient, TokenVerifier, TrackType, TrackSource, AccessToken } from 'livekit-server-sdk';

test('Bravo Live isolates client streams and confirms media before advertising live', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'live_tests', APP_ORIGIN: 'http://localhost:5173', BRAVO_LIVE_ENABLED: 'true', LIVEKIT_URL: 'wss://live.bravounleashed.com', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: randomBytes(32).toString('hex') });
  delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, Booking, LiveSession, Notification, RateBucket } = await import('../server/models.js');
  const { digest } = await import('../server/auth.js');
  let publishing = false, failDelete = false;
  t.mock.method(RoomServiceClient.prototype, 'createRoom', async () => ({}));
  t.mock.method(RoomServiceClient.prototype, 'deleteRoom', async () => { if (failDelete) throw new Error('media unavailable'); });
  t.mock.method(RoomServiceClient.prototype, 'getParticipant', async (_room, identity) => ({ identity, tracks: publishing ? [{ type: TrackType.VIDEO, source: TrackSource.CAMERA, muted: false }] : [] }));
  const users = {}, cookies = {};
  const call = (who, method, path, body = {}) => {
    let r = request(app)[method](`/api${path}`).set('Origin', process.env.APP_ORIGIN);
    if (cookies[who]) r = r.set('Cookie', cookies[who]);
    return method === 'get' ? r : r.send(body);
  };
  let booking, privateSession, publicSession;
  try {
    await connectDb();
    for (const [who, role] of Object.entries({ owner: 'owner', trainer: 'staff', otherTrainer: 'staff', client: 'member', stranger: 'member' })) {
      users[who] = await User.create({ name: who, role, passwordHash: 'not-a-real-password', dogName: 'Gunner' });
      const token = randomBytes(32).toString('hex'); cookies[who] = `bravo_session=${token}`;
      await Session.create({ userId: users[who]._id, tokenHash: digest(token), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    booking = await Booking.create({ userId: users.client._id, staffId: users.trainer._id, staffIds: [users.trainer._id], dogName: 'Gunner', status: 'confirmed' });
    const body = { audience: 'client', bookingId: String(booking._id), dogName: 'Injected dog label' };
    await t.test('staff authorization, assignment checks, CSRF and audience validation', async () => {
      await call(null, 'get', '/live/studio').expect(401);
      await call('client', 'get', '/live/studio').expect(403);
      await call('client', 'post', '/live', body).expect(403);
      await call('otherTrainer', 'post', '/live', body).expect(404);
      await call('trainer', 'post', '/live', { audience: 'client', dogName: 'Gunner' }).expect(400);
      await call('trainer', 'post', '/live', { ...body, clientId: String(users.stranger._id) }).expect(400);
      await call('trainer', 'post', '/live', { audience: 'public', dogName: 'Gunner' }).expect(400);
      await request(app).post('/api/live').set('Cookie', cookies.trainer).set('Origin', 'https://attacker.test').send(body).expect(403);
      const studio = (await call('trainer', 'get', '/live/studio').expect(200)).body;
      assert.equal(studio.bookings[0].dogName, 'Gunner');
      assert.equal((await call('otherTrainer', 'get', '/live/studio')).body.bookings.length, 0);
    });
    await t.test('create is private and starting until camera publication is verified', async () => {
      const created = (await call('trainer', 'post', '/live', body).expect(201)).body;
      privateSession = created.session; assert.equal(privateSession.dogName, 'Gunner');
      assert.equal(privateSession.status, 'starting');
      const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).verify(created.token);
      assert.equal(claims.video.canPublish, true); assert.equal(claims.video.canSubscribe, false); assert.equal(claims.video.canPublishData, false);
      assert.ok(claims.exp - claims.nbf <= 60);
      assert.ok(!JSON.stringify(created.session).includes('clientId'));
      await call('trainer', 'post', '/live', body).expect(409);
      assert.equal((await call('client', 'get', '/live')).body.sessions.length, 0);
      await call('trainer', 'post', `/live/${privateSession.id}/heartbeat`).expect(409);
      publishing = true;
      const live = (await call('trainer', 'post', `/live/${privateSession.id}/heartbeat`).expect(200)).body;
      assert.equal(live.session.status, 'live'); assert.ok(live.session.startedAt);
      assert.equal(await Notification.countDocuments({ userId: users.client._id, _id: `live:${privateSession.id}` }), 1);
    });
    await t.test('only assigned client, broadcaster and authorized owner can discover/watch private streams', async () => {
      for (const who of [null, 'stranger', 'otherTrainer']) {
        assert.equal((await call(who, 'get', '/live')).body.sessions.length, 0);
        await call(who, 'post', `/live/${privateSession.id}/watch`).expect(404);
      }
      for (const who of ['client', 'trainer', 'owner']) {
        assert.equal((await call(who, 'get', '/live')).body.sessions.length, 1);
        const result = (await call(who, 'post', `/live/${privateSession.id}/watch`).expect(200)).body;
        const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).verify(result.token);
        assert.equal(claims.video.canSubscribe, true); assert.equal(claims.video.canPublish, false); assert.equal(claims.video.canPublishData, false);
        assert.equal(claims.video.roomAdmin, undefined); assert.ok(claims.sub.startsWith('viewer-'));
        for (const secret of ['clientId', 'bookingId', 'roomName', 'publisherIdentity', 'credentialVersion']) assert.equal(result.session[secret], undefined);
      }
      await call('otherTrainer', 'post', `/live/${privateSession.id}/end`).expect(404);
      await call('client', 'post', `/live/${privateSession.id}/heartbeat`).expect(403);
    });
    await t.test('public sessions appear anonymously with no client details and stop removes admission', async () => {
      publicSession = (await call('owner', 'post', '/live', { dogName: 'Ranger', audience: 'public', publicConsent: true }).expect(201)).body.session;
      await call('owner', 'post', `/live/${publicSession.id}/heartbeat`).expect(200);
      const publicList = (await call(null, 'get', '/live').expect(200)).body;
      assert.deepEqual(publicList.sessions.map(s => s.id), [publicSession.id]);
      await call(null, 'post', `/live/${publicSession.id}/watch`).expect(200);
      await call('owner', 'post', `/live/${publicSession.id}/end`).expect(200);
      await call(null, 'post', `/live/${publicSession.id}/watch`).expect(410);
      await call('owner', 'post', `/live/${publicSession.id}/end`).expect(200);
    });
    await t.test('camera loss, stale heartbeats and revoked staff stop admission', async () => {
      publishing = false;
      await call('trainer', 'post', `/live/${privateSession.id}/heartbeat`).expect(409);
      assert.equal((await call('client', 'get', '/live')).body.sessions.length, 0);
      publishing = true;
      await call('trainer', 'post', `/live/${privateSession.id}/heartbeat`).expect(200);
      await LiveSession.updateOne({ _id: privateSession.id }, { $set: { lastSeenAt: new Date(Date.now() - 76000) } });
      assert.equal((await call('client', 'get', '/live')).body.sessions.length, 0);
      await call('client', 'post', `/live/${privateSession.id}/watch`).expect(410);
      await LiveSession.updateOne({ _id: privateSession.id }, { $set: { lastSeenAt: new Date() } });
      await User.updateOne({ _id: users.trainer._id }, { $inc: { credentialVersion: 1 } });
      assert.equal((await call('client', 'get', '/live')).body.sessions.length, 0);
      await call('client', 'post', `/live/${privateSession.id}/watch`).expect(410);
      await User.updateOne({ _id: users.trainer._id }, { $set: { credentialVersion: 0 } });
    });
    await t.test('failed room shutdown is hidden, retains the lock and can be retried', async () => {
      failDelete = true;
      await call('trainer', 'post', `/live/${privateSession.id}/end`).expect(503);
      const stored = await LiveSession.findById(privateSession.id); assert.equal(stored.status, 'ending'); assert.equal(stored.open, true);
      assert.equal((await call('client', 'get', '/live')).body.sessions.length, 0);
      failDelete = false;
      await call('trainer', 'post', `/live/${privateSession.id}/end`).expect(200);
      assert.equal((await LiveSession.findById(privateSession.id)).open, false);
    });
    await t.test('concurrent start creates only one session per trainer', async () => {
      await RateBucket.deleteMany({});
      const results = await Promise.all([call('trainer', 'post', '/live', body), call('trainer', 'post', '/live', body)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      privateSession = results.find(r => r.status === 201).body.session;
      assert.equal(await LiveSession.countDocuments({ trainerId: users.trainer._id, open: true }), 1);
    });
    await t.test('webhooks require signatures and publisher departure ends the room', async () => {
      const record = await LiveSession.findById(privateSession.id);
      const event = JSON.stringify({ event: 'participant_left', room: { name: record.roomName }, participant: { identity: record.publisherIdentity } });
      await request(app).post('/api/live/webhook').type('application/webhook+json').send(event).expect(401);
      publishing = false;
      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { ttl: '60s' });
      token.sha256 = createHash('sha256').update(event).digest('base64');
      await request(app).post('/api/live/webhook').type('application/webhook+json').set('Authorization', await token.toJwt()).send(event).expect(200);
      assert.equal((await LiveSession.findById(record._id)).status, 'ended');
    });
    await t.test('unconfigured live service fails closed without fake live rows', async () => {
      delete process.env.BRAVO_LIVE_ENABLED;
      assert.equal((await call(null, 'get', '/live')).body.sessions.length, 0);
      assert.equal((await call('trainer', 'get', '/live/studio')).body.configured, false);
      await call('trainer', 'post', '/live', body).expect(503);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
