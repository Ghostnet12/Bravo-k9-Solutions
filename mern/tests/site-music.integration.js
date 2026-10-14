import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
test('music permissions, uploads, publishing, range streaming and conflicts', { timeout: 180000 }, async () => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'music_test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  try {
    const { default: app } = await import('../server/site-image-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Session, MediaUpload } = await import('../server/models.js');
    await connectDb(); const cookies = {};
    for (const role of ['owner', 'administrator', 'staff', 'member']) {
      const user = await User.create({ name: role, role: role === 'administrator' ? 'owner' : role, passwordHash: 'fixture' });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: user._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[role] = `bravo_session=${token}`;
    }
    const write = (role, method, path, body) => { const r = request(app)[method](`/api/site-music${path}`).set('Origin', process.env.APP_ORIGIN); if (role) r.set('Cookie', cookies[role]); return r.send(body); };
    const initial = (await request(app).get('/api/site-music').expect(200)).body;
    const body = { expectedRevision: 0, enabled: true, startId: '', tracks: [] };
    for (const role of [null, 'staff', 'member']) await write(role, 'put', '', body).expect(role ? 403 : 401);
    const bytes = Buffer.from('ID3test-audio-fixture');
    const upload = (await write('administrator', 'post', '/uploads', { filename: 'holiday.mp3', contentType: 'audio/mpeg', size: bytes.length }).expect(201)).body;
    await write('owner', 'put', `/uploads/${upload.id}/chunks/0`, { data: bytes.toString('base64') }).expect(404);
    const playlist = { ...body, startId: upload.id, tracks: [{ id: upload.id, title: 'Holiday', enabled: true }] };
    await write('administrator', 'put', '', playlist).expect(400);
    await write('administrator', 'put', `/uploads/${upload.id}/chunks/0`, { data: bytes.toString('base64') }).expect(200);
    await request(app).get(`/api/site-music/tracks/${upload.id}`).expect(404);
    const saved = (await write('administrator', 'put', '', playlist).expect(200)).body;
    assert.equal(saved.revision, initial.revision + 1);
    const range = await request(app).get(`/api/site-music/tracks/${upload.id}`).set('Range', 'bytes=0-2').expect(206);
    assert.equal(range.headers['content-length'], '3');
    await write('owner', 'put', '', playlist).expect(409);
    await write('owner', 'put', '', { ...body, expectedRevision: 1 }).expect(200);
    await request(app).get(`/api/site-music/tracks/${upload.id}`).expect(404);
    assert.ok(await MediaUpload.exists({ _id: upload.id, completed: true }), 'removing track retains stored asset');
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
