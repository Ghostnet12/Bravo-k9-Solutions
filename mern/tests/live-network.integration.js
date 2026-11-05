import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const sdp = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\n';

test('live relay issuance is session-authorized: guests and non-subscribers can watch public, private stays private', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'relay_access', APP_ORIGIN: 'http://localhost:5173', BRAVO_TURN_URLS: JSON.stringify(['turn:127.0.0.1:3478?transport=tcp']), BRAVO_TURN_SHARED_SECRET: randomBytes(32).toString('hex') });
  delete process.env.STRIPE_SECRET_KEY; delete process.env.BRAVO_TURN_KEY_ID; delete process.env.BRAVO_TURN_API_TOKEN;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, LiveSession, LivePeer, Booking, Subscription } = await import('../server/models.js');
  const users = {}, cookies = {};
  const call = (who, url, body) => { let r = request(app).post('/api' + url).set('Origin', process.env.APP_ORIGIN); if (cookies[who]) r = r.set('Cookie', cookies[who]); return r.send(body); };
  const network = (who, row, role = 'viewer') => call(who, `/live/${row._id}/network`, { role });
  try {
    await connectDb();
    for (const [name, role] of Object.entries({ owner: 'owner', trainer: 'staff', strangerTrainer: 'staff', unpaid: 'member', assigned: 'member' })) {
      users[name] = await User.create({ name, role, passwordHash: 'synthetic-only' });
      const token = randomBytes(32).toString('hex'); cookies[name] = 'bravo_session=' + token;
      await Session.create({ userId: users[name]._id, tokenHash: createHash('sha256').update(token).digest('hex'), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    const row = await LiveSession.create({ _id: randomUUID(), trainerId: users.trainer._id, trainerName: 'Trainer fixture', dogName: 'Private fixture dog', roomName: 'relay-isolated-room', clientId: users.assigned._id, credentialVersion: 0, audience: 'public', publicConsentAt: new Date(), transport: 'direct', open: true, status: 'live', startedAt: new Date(), lastSeenAt: new Date(), lastPublishedAt: new Date() });
    const touch = () => LiveSession.updateOne({ _id: row._id }, { $set: { lastSeenAt: new Date(), lastPublishedAt: new Date() } });
    await t.test('guest and unpaid member receive temporary relay config without subscribing or creating a peer', async () => {
      assert.equal(await Subscription.countDocuments(), 0); assert.equal(await Booking.countDocuments(), 0);
      const before = await LiveSession.findById(row._id).lean();
      for (const who of [null, 'unpaid']) {
        const response = await network(who, row).expect(200);
        assert.match(response.headers['cache-control'], /no-store/);
        assert.equal(response.body.relayConfigured, true);
        assert.ok(response.body.iceServers.some(server => server.username && server.credential));
        assert.ok(!JSON.stringify(response.body).includes(process.env.BRAVO_TURN_SHARED_SECRET));
      }
      assert.deepEqual(await LiveSession.findById(row._id).lean(), before); assert.equal(await LivePeer.countDocuments(), 0);
      for (const who of [null, 'unpaid']) await call(who, `/live/${row._id}/watch`, { offer: { type: 'offer', sdp } }).expect(200);
      assert.equal(await LivePeer.countDocuments(), 2); assert.equal(await Subscription.countDocuments(), 0);
    });
    await t.test('only the owning broadcaster gets publisher config and cross-origin issuance is denied', async () => {
      await touch(); await network('trainer', row, 'publisher').expect(200);
      await network(null, row, 'publisher').expect(401);
      for (const who of ['owner', 'unpaid']) await network(who, row, 'publisher').expect(403);
      await network('strangerTrainer', row, 'publisher').expect(404);
      await request(app).post(`/api/live/${row._id}/network`).set('Origin', 'https://attacker.example').send({ role: 'viewer' }).expect(403);
      await call(null, `/live/${row._id}/network`, { role: 'viewer', iceServers: [] }).expect(400);
    });
    await t.test('private visibility is retained for both relay issuance and viewing', async () => {
      await LiveSession.updateOne({ _id: row._id }, { $set: { audience: 'client' } }); await touch();
      for (const who of [null, 'unpaid', 'strangerTrainer']) {
        await network(who, row).expect(404);
        await call(who, `/live/${row._id}/watch`, { offer: { type: 'offer', sdp } }).expect(404);
      }
      for (const who of ['assigned', 'owner', 'trainer']) await network(who, row).expect(200);
      assert.equal((await request(app).get('/api/live').expect(200)).body.sessions.length, 0);
    });
    await t.test('ended, stalled and revoked sessions never mint working relay access', async () => {
      await LiveSession.updateOne({ _id: row._id }, { $set: { audience: 'public', lastPublishedAt: new Date(Date.now() - 9000) } });
      await network(null, row).expect(410);
      await touch(); await User.updateOne({ _id: users.trainer._id }, { $set: { blocked: true } });
      await network(null, row).expect(410);
      await LiveSession.updateOne({ _id: row._id }, { $set: { open: false, status: 'ended' } }); await network(null, row).expect(410);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
