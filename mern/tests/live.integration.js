import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { liveConfigured, validateDescription } from '../server/live-media.js';

const sdp = direction => `v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=${direction}\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=${direction}\r\n`;
const offer = { type: 'offer', sdp: sdp('recvonly') }, answer = { type: 'answer', sdp: sdp('sendonly') };

test('direct WebRTC isolates private signaling, admits concurrent viewers without a cap and expires credentials', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: replica.getUri(), MONGODB_DB: 'live_tests', APP_ORIGIN: 'http://localhost:5173' });
  delete process.env.BRAVO_LIVE_ENABLED; delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, Booking, LiveSession, LivePeer, Notification, RateBucket } = await import('../server/models.js');
  const { digest } = await import('../server/auth.js');
  const users = {}, cookies = {};
  const call = (who, method, path, body = {}) => {
    let r = request(app)[method](`/api${path}`).set('Origin', process.env.APP_ORIGIN);
    if (cookies[who]) r = r.set('Cookie', cookies[who]);
    return method === 'get' ? r : r.send(body);
  };
  const beat = (who, session, cameraReady = true) => call(who, 'post', `/live/${session.id}/heartbeat`, { cameraReady });
  const watch = (who, session) => call(who, 'post', `/live/${session.id}/watch`, { offer });
  const peerPath = (session, peer, action) => `/live/${session.id}/peers/${peer.peerId}/${action}`;
  let session, publicSession, clientPeer;
  try {
    await connectDb();
    for (const [who, role] of Object.entries({ owner: 'owner', trainer: 'staff', otherTrainer: 'staff', client: 'member', stranger: 'member' })) {
      users[who] = await User.create({ name: who, role, passwordHash: 'fixture-only', dogName: 'Gunner' });
      const token = randomBytes(32).toString('hex'); cookies[who] = `bravo_session=${token}`;
      await Session.create({ userId: users[who]._id, tokenHash: digest(token), issuedAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    }
    process.env.OWNER_USER_ID = String(users.owner._id);
    const booking = await Booking.create({ userId: users.client._id, staffId: users.trainer._id, staffIds: [users.trainer._id], dogName: 'Gunner', status: 'confirmed' });
    const body = { audience: 'client', bookingId: String(booking._id), dogName: 'Injected dog label' };
    await t.test('no paid service or keys; staff authorization, assignment, CSRF and consent remain enforced', async () => {
      assert.equal(liveConfigured(), true);
      await call(null, 'get', '/live/studio').expect(401);
      await call('client', 'post', '/live', body).expect(403);
      await call('otherTrainer', 'post', '/live', body).expect(404);
      await call('trainer', 'post', '/live', { audience: 'client', dogName: 'Gunner' }).expect(400);
      await call('trainer', 'post', '/live', { ...body, clientId: String(users.stranger._id) }).expect(400);
      await call('trainer', 'post', '/live', { audience: 'public', dogName: 'Gunner' }).expect(400);
      await request(app).post('/api/live').set('Cookie', cookies.trainer).set('Origin', 'https://attacker.test').send(body).expect(403);
      const studio = (await call('trainer', 'get', '/live/studio')).body;
      assert.equal(studio.viewerLimit, null); assert.equal(studio.bookings[0].dogName, 'Gunner');
      assert.equal((await call('otherTrainer', 'get', '/live/studio')).body.bookings.length, 0);
    });
    await t.test('only an authenticated phone reporting a ready camera starts discovery', async () => {
      session = (await call('trainer', 'post', '/live', body).expect(201)).body.session;
      assert.equal(session.dogName, 'Gunner'); assert.equal(session.status, 'starting');
      await call('trainer', 'post', '/live', body).expect(409);
      assert.equal((await call('client', 'get', '/live')).body.sessions.length, 0);
      await beat('trainer', session, false).expect(409);
      assert.equal((await beat('trainer', session).expect(200)).body.session.status, 'live');
      assert.equal(await Notification.countDocuments({ _id: `live:${session.id}`, userId: users.client._id }), 1);
    });
    await t.test('private listings and SDP are inaccessible to strangers, other trainers and anonymous users', async () => {
      for (const who of [null, 'stranger', 'otherTrainer']) {
        assert.equal((await call(who, 'get', '/live')).body.sessions.length, 0);
        await watch(who, session).expect(404);
      }
      clientPeer = (await watch('client', session).expect(200)).body;
      for (const key of ['clientId', 'bookingId', 'roomName', 'publisherIdentity', 'credentialVersion']) assert.equal(clientPeer.session[key], undefined);
      assert.equal(clientPeer.offer, undefined);
      const stored = await LivePeer.findById(clientPeer.peerId);
      assert.notEqual(stored.tokenHash, clientPeer.token); assert.equal(stored.tokenHash, digest(clientPeer.token));
      await call('client', 'post', peerPath(session, clientPeer, 'answer'), { answer }).expect(403);
      await call('otherTrainer', 'post', peerPath(session, clientPeer, 'answer'), { answer }).expect(404);
      await call('owner', 'post', peerPath(session, clientPeer, 'answer'), { answer }).expect(403);
      await call('trainer', 'post', peerPath(session, clientPeer, 'answer'), { answer }).expect(200);
      await call('trainer', 'post', peerPath(session, clientPeer, 'answer'), { answer }).expect(200);
      await call('trainer', 'post', peerPath(session, clientPeer, 'answer'), { answer: { ...answer, sdp: answer.sdp + 'a=x-changed\r\n' } }).expect(410);
      await call('owner', 'post', peerPath(session, clientPeer, 'reject')).expect(403);
      await call('otherTrainer', 'post', peerPath(session, clientPeer, 'reject')).expect(404);
      for (const who of [null, 'stranger', 'otherTrainer']) await call(who, 'post', peerPath(session, clientPeer, 'poll'), { token: clientPeer.token }).expect(404);
      await call('owner', 'post', peerPath(session, clientPeer, 'poll'), { token: clientPeer.token }).expect(410);
      await call('client', 'post', peerPath(session, clientPeer, 'poll'), { token: '0'.repeat(64) }).expect(410);
      assert.deepEqual((await call('client', 'post', peerPath(session, clientPeer, 'poll'), { token: clientPeer.token }).expect(200)).body.answer, answer);
      const heartbeat = (await beat('trainer', session)).body;
      assert.deepEqual(heartbeat.peers.map(p => p.id), [clientPeer.peerId]);
      assert.equal(heartbeat.peers[0].tokenHash, undefined);
      assert.ok(!JSON.stringify((await call('client', 'get', '/live')).body).includes('sdp'));
    });
    await t.test('viewer publication/data-channel offers and oversized signaling are refused', async () => {
      for (const bad of [sdp('sendrecv'), sdp('sendonly'), offer.sdp.replace('a=recvonly', 'a=recvonly\r\na=sendrecv'), offer.sdp + 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n', 'x'.repeat(40001)]) {
        await call('client', 'post', `/live/${session.id}/watch`, { offer: { type: 'offer', sdp: bad } }).expect(400);
      }
      assert.equal(validateDescription(offer, 'offer'), true);
    });
    await t.test('concurrent joins exceed three viewers, including existing sessions; expired credentials cannot be reused', async () => {
      await RateBucket.deleteMany({});
      // A session started before the cap removal used zero-based slots.
      await LivePeer.updateOne({ _id: clientPeer.peerId }, { $set: { slot: 0 } });
      const results = await Promise.all(Array.from({ length: 5 }, () => watch('client', session)));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 200, 200, 200]);
      assert.equal(await LivePeer.countDocuments({ sessionId: session.id }), 6);
      const peers = await LivePeer.find({ sessionId: session.id }).lean();
      assert.equal(new Set(peers.map(peer => peer.slot)).size, 6);
      assert.equal((await beat('trainer', session)).body.peers.length, 6);
      await LivePeer.updateOne({ _id: clientPeer.peerId }, { $set: { expiresAt: new Date(0) } });
      await call('client', 'post', peerPath(session, clientPeer, 'poll'), { token: clientPeer.token }).expect(410);
      const replacement = (await watch('client', session).expect(200)).body;
      assert.notEqual(replacement.peerId, clientPeer.peerId);
      await call('client', 'post', peerPath(session, clientPeer, 'leave'), { token: clientPeer.token }).expect(200);
      assert.equal(await LivePeer.countDocuments({ sessionId: session.id }), 6);
      await call('client', 'post', peerPath(session, replacement, 'leave'), { token: replacement.token }).expect(200);
      assert.equal(await LivePeer.countDocuments({ sessionId: session.id }), 5);
      const failedPeer = results.find(r => r.status === 200).body;
      await call('trainer', 'post', peerPath(session, failedPeer, 'reject')).expect(200);
      assert.equal(await LivePeer.countDocuments({ sessionId: session.id }), 4);
    });
    await t.test('viewer revocation removes peers from the trainer and stale broadcaster sessions fail closed', async () => {
      await User.updateOne({ _id: users.client._id }, { $inc: { credentialVersion: 1 } });
      assert.equal((await beat('trainer', session)).body.peers.length, 0);
      assert.equal(await LivePeer.countDocuments({ sessionId: session.id }), 0);
      await LiveSession.updateOne({ _id: session.id }, { $set: { lastSeenAt: new Date(Date.now() - 76000) } });
      assert.equal((await call('owner', 'get', '/live')).body.sessions.length, 0);
      await watch('owner', session).expect(410);
      await LiveSession.updateOne({ _id: session.id }, { $set: { lastSeenAt: new Date() } });
      await User.updateOne({ _id: users.trainer._id }, { $inc: { credentialVersion: 1 } });
      await watch('owner', session).expect(410);
      assert.equal((await call('owner', 'get', '/live')).body.sessions.length, 0);
      await call('owner', 'post', `/live/${session.id}/end`).expect(200);
    });
    await t.test('public watching requires no login; stopping removes all connection data and future access', async () => {
      publicSession = (await call('owner', 'post', '/live', { dogName: 'Ranger', audience: 'public', publicConsent: true }).expect(201)).body.session;
      await beat('owner', publicSession).expect(200);
      assert.deepEqual((await call(null, 'get', '/live')).body.sessions.map(s => s.id), [publicSession.id]);
      const peer = (await watch(null, publicSession).expect(200)).body;
      await call(null, 'post', peerPath(publicSession, peer, 'poll'), { token: peer.token }).expect(200);
      await call('owner', 'post', `/live/${publicSession.id}/end`).expect(200);
      assert.equal(await LivePeer.countDocuments({ sessionId: publicSession.id }), 0);
      await watch(null, publicSession).expect(410);
      await call(null, 'post', peerPath(publicSession, peer, 'poll'), { token: peer.token }).expect(410);
    });
    await t.test('concurrent start is singular and emergency disable is explicit', async () => {
      await RateBucket.deleteMany({});
      const starts = await Promise.all([call('owner', 'post', '/live', body), call('owner', 'post', '/live', body)]);
      assert.deepEqual(starts.map(r => r.status).sort(), [201, 409]);
      process.env.BRAVO_LIVE_ENABLED = 'false';
      assert.equal((await call(null, 'get', '/live')).body.sessions.length, 0);
      assert.equal((await call('owner', 'get', '/live/studio')).body.configured, false);
      await call('owner', 'post', '/live', body).expect(503);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
