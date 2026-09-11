import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('media editor persistence and server authorization (isolated MongoDB)', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'media_editor_test';
  process.env.APP_ORIGIN = 'http://localhost:5173'; process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app, SiteImage } = await import('../server/site-image-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Session, MediaUpload, MediaChunk, Lesson, AuditEvent } = await import('../server/models.js');
    await connectDb(); await SiteImage.init();
    const users = {}, cookies = {};
    for (const [name, role] of Object.entries({ owner: 'owner', administrator: 'owner', staff: 'staff', client: 'member' })) {
      const user = await User.create({ ...(name === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), email: `${name}@example.test`, name, role, passwordHash: 'test-only-not-a-login-hash' });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: user._id, expiresAt: new Date(Date.now() + 3600000) });
      users[name] = user; cookies[name] = `bravo_session=${token}`;
    }
    const call = (who, method, path, data = {}) => {
      let req = request(app)[method](path).set('Origin', process.env.APP_ORIGIN);
      if (who) req = req.set('Cookie', cookies[who]);
      return req.send(data);
    };
    const edit = { expectedRevision: 0, alt: 'Fixture', x: 50.1, y: 50, zoom: 1, fit: 'cover' };
    await t.test('staff and clients cannot bypass permissions via old or new media APIs', async () => {
      const paths = [['patch', '/api/site-images/home-method'], ['put', '/api/site-images/home-method'], ['post', '/api/site-images/home-method/undo'], ['post', '/api/admin/media/start'], ['put', '/api/admin/media/fake/chunks/0'], ['post', '/api/admin/media/fake/complete'], ['delete', '/api/admin/lessons/sample/media/video'], ['put', '/api/admin/lessons/sample']];
      for (const who of ['staff', 'client', null]) for (const [method, path] of paths) await call(who, method, path, edit).expect(who ? 403 : 401);
    });
    await t.test('owner saves a slight nudge with zero file uploads', async () => {
      const response = await call('owner', 'patch', '/api/site-images/home-method', edit).expect(200);
      assert.equal(response.body.image.x, 50.1); assert.equal(response.body.image.framed, true); assert.equal(response.body.image.src, null);
      assert.equal(await MediaUpload.countDocuments(), 0); assert.equal(await MediaChunk.countDocuments(), 0);
      const read = await request(app).get('/api/site-images').expect(200); assert.equal(read.body.images['home-method'].x, 50.1);
    });
    await t.test('delegated administrator zoom persists; stale edits are rejected', async () => {
      await call('administrator', 'patch', '/api/site-images/home-method', { ...edit, expectedRevision: 1, zoom: 1.01 }).expect(200);
      assert.equal((await SiteImage.findById('home-method')).current.zoom, 1.01);
      await call('owner', 'patch', '/api/site-images/home-method', edit).expect(409);
      await call('owner', 'patch', '/api/site-images/home-method', { ...edit, expectedRevision: 2, zoom: 4 }).expect(400);
      await call('owner', 'post', '/api/site-images/home-method/undo', { expectedRevision: 2 }).expect(200);
      assert.equal((await SiteImage.findById('home-method')).current.zoom, 1);
    });
    await t.test('adjusting an uploaded photo retains the same stored bytes', async () => {
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1cAAAAASUVORK5CYII=';
      const key = 'asset-training-education.webp';
      await call('owner', 'put', `/api/site-images/${key}`, { ...edit, filename: 'test.png', contentType: 'image/png', data: png }).expect(200);
      const id = (await SiteImage.findById(key)).current.uploadId, count = await MediaChunk.countDocuments();
      await call('owner', 'patch', `/api/site-images/${key}`, { ...edit, expectedRevision: 1, y: 50.1, zoom: 1.5 }).expect(200);
      assert.equal((await SiteImage.findById(key)).current.uploadId, id); assert.equal(await MediaChunk.countDocuments(), count);
    });
    await Lesson.create({ _id: 'sample', title: 'Sample', category: 'Test', instructor: 'Owner', image: '/images/training-education.webp', published: true });
    await t.test('video framing does not unpublish or expose a lesson', async () => {
      await call('owner', 'patch', '/api/site-images/video-lesson-sample', { ...edit, zoom: 1.5 }).expect(200);
      assert.equal((await Lesson.findById('sample')).published, true);
      await request(app).get('/api/site-images/video-lesson-sample/image').expect(404);
      await request(app).get('/api/lessons/sample/video').expect(401);
      await request(app).get('/api/lessons/sample/video').set('Cookie', cookies.client).expect(403);
    });
    await t.test('video replacement uses protected chunks and returns lesson to draft', async () => {
      const bytes = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');
      const start = await call('administrator', 'post', '/api/admin/media/start', { lessonId: 'sample', kind: 'video', filename: 'fixture.mp4', contentType: 'video/mp4', size: bytes.length, chunks: 1 }).expect(201);
      await call('administrator', 'put', `/api/admin/media/${start.body.uploadId}/chunks/0`, { data: bytes.toString('base64') }).expect(200);
      await call('administrator', 'post', `/api/admin/media/${start.body.uploadId}/complete`).expect(200);
      assert.equal((await Lesson.findById('sample')).published, false);
      await request(app).get('/api/lessons/sample/video').set('Cookie', cookies.administrator).expect(200);
    });
    await t.test('revocation and cross-origin writes fail server-side', async () => {
      await User.updateOne({ _id: users.administrator._id }, { $set: { role: 'staff' } });
      await call('administrator', 'patch', '/api/site-images/home-hero', edit).expect(403);
      await call('owner', 'patch', '/api/site-images/asset-bravo-logo-small.webp', edit).expect(400);
      await request(app).patch('/api/site-images/home-method').set('Cookie', cookies.owner).set('Origin', 'https://unrelated.example').send(edit).expect(403);
      assert.ok(await AuditEvent.countDocuments({ action: 'site-media.reframed' }) >= 3);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
