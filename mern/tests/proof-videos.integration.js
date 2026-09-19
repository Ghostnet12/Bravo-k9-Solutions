import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DEFAULT_PROOF_VIDEOS, PROOF_PAGE_SIZE } from '../shared/proof-videos.js';

test('homepage video publishing, isolation, and persistence', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'proof_videos_test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  process.env.OWNER_USER_ID = new mongoose.Types.ObjectId().toString(); delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app } = await import('../server/site-image-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Session, ProofVideo, MediaUpload, MediaChunk, AuditEvent } = await import('../server/models.js');
    const { CHUNK_SIZE } = await import('../server/media.js');
    await connectDb();
    const users = {}, cookies = {};
    for (const [name, role] of Object.entries({ owner: 'owner', administrator: 'owner', staff: 'staff', client: 'member' })) {
      const user = await User.create({ ...(name === 'owner' ? { _id: process.env.OWNER_USER_ID } : {}), email: `${name}@example.test`, name, role, passwordHash: 'test-only' });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: user._id, expiresAt: new Date(Date.now() + 3600000) });
      users[name] = user; cookies[name] = `bravo_session=${token}`;
    }
    const call = (who, method, path, body = {}) => { let req = request(app)[method](`/api/proof-videos${path}`).set('Origin', process.env.APP_ORIGIN); if (who) req = req.set('Cookie', cookies[who]); return req.send(body); };
    const data = Buffer.alloc(CHUNK_SIZE + 42, 9); Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex').copy(data);
    const meta = { filename: 'fixture.mp4', contentType: 'video/mp4', size: data.length, chunks: 2 };
    const edit = { expectedRevision: 0, mutationId: randomUUID(), title: 'Real fixture training', description: 'First line\nSecond line', fit: 'contain' };
    const clipId = DEFAULT_PROOF_VIDEOS[0].id;
    const before = await request(app).get('/api/proof-videos').expect(200);
    assert.equal(before.body.clips.length, 3); assert.equal(await ProofVideo.countDocuments(), 0);
    await t.test('visitors, members, staff, and cross-origin callers cannot mutate the carousel', async () => {
      for (const who of [null, 'staff', 'client']) for (const [method, path] of [['post', `/${clipId}/uploads`], ['put', `/${clipId}`], ['put', `/${clipId}/uploads/${randomUUID()}/chunks/0`], ['delete', `/${clipId}`]]) await call(who, method, path, edit).expect(who ? 403 : 401);
      await request(app).put(`/api/proof-videos/${clipId}`).set('Origin', 'https://unrelated.example').set('Cookie', cookies.owner).send(edit).expect(403);
    });
    await t.test('carousel timing is owner/admin-only, validated, durable and revision protected', async () => {
      assert.deepEqual(before.body.carousel, { intervalSeconds: 8, revision: 0 });
      const settings = { expectedRevision: 0, intervalSeconds: 12 };
      for (const who of [null, 'staff', 'client']) await call(who, 'put', '/settings', settings).expect(who ? 403 : 401);
      await request(app).put('/api/proof-videos/settings').set('Origin', 'https://unrelated.example').set('Cookie', cookies.owner).send(settings).expect(403);
      for (const intervalSeconds of [0, 1, 61, 2.5, '5']) await call('owner', 'put', '/settings', { ...settings, intervalSeconds }).expect(400);
      await call('owner', 'put', '/settings', settings).expect(200);
      assert.deepEqual((await request(app).get('/api/proof-videos')).body.carousel, { intervalSeconds: 12, revision: 1 });
      await call('administrator', 'put', '/settings', settings).expect(409);
      await call('administrator', 'put', '/settings', { expectedRevision: 1, intervalSeconds: 2 }).expect(200);
      assert.deepEqual((await request(app).get('/api/proof-videos')).body.carousel, { intervalSeconds: 2, revision: 2 });
      assert.equal(await AuditEvent.countDocuments({ action: 'proof-carousel.published' }), 2);
      assert.equal(await ProofVideo.countDocuments(), 0, 'timing changes do not modify videos');
    });
    await t.test('hero photos are owner-only, validated, revision protected and durable', async () => {
      const initial = (await request(app).get('/api/hero-carousel').expect(200)).body.carousel;
      const save = (who, body) => { let req = request(app).put('/api/hero-carousel').set('Origin', process.env.APP_ORIGIN); if (who) req = req.set('Cookie', cookies[who]); return req.send(body); };
      const settings = { expectedRevision: initial.revision, intervalSeconds: 2, photos: ['team-ashley-northrop'] };
      for (const who of [null, 'staff', 'client']) await save(who, settings).expect(who ? 403 : 401);
      await request(app).put('/api/hero-carousel').set('Origin', 'https://unrelated.example').set('Cookie', cookies.owner).send(settings).expect(403);
      for (const photos of [['https://evil.example/photo'], ['lesson-private'], ['team-ashley-northrop', 'team-ashley-northrop']]) await save('owner', { ...settings, photos }).expect(400);
      await save('owner', { ...settings, intervalSeconds: 1 }).expect(400);
      await save('owner', settings).expect(200);
      assert.deepEqual((await request(app).get('/api/hero-carousel')).body.carousel, { revision: 1, intervalSeconds: 2, photos: ['team-ashley-northrop'] });
      await save('administrator', settings).expect(409);
      await save('administrator', { expectedRevision: 1, intervalSeconds: 3, photos: [] }).expect(200);
      assert.equal(await AuditEvent.countDocuments({ action: 'hero-carousel.published' }), 2);
    });
    await t.test('hero video uploads are editable, range-playable and isolated from proof and lessons', async () => {
      const id = randomUUID();
      const hero = (who, method, path, body={}) => { let req=request(app)[method](`/api/hero-videos${path}`).set('Origin',process.env.APP_ORIGIN); if(who)req=req.set('Cookie',cookies[who]); return req.send(body); };
      assert.deepEqual((await request(app).get('/api/hero-videos').expect(200)).body.clips,[]);
      for (const who of [null,'staff','client']) { await hero(who,'post',`/${id}/uploads`,meta).expect(who?403:401); await hero(who,'put',`/${id}`,edit).expect(who?403:401); await hero(who,'delete',`/${id}`,{expectedRevision:0}).expect(who?403:401); }
      await request(app).post(`/api/hero-videos/${id}/uploads`).set('Origin','https://unrelated.example').set('Cookie',cookies.owner).send(meta).expect(403);
      const uploadId=(await hero('owner','post',`/${id}/uploads`,meta).expect(201)).body.uploadId;
      for(const index of [0,1]) await hero('owner','put',`/${id}/uploads/${uploadId}/chunks/${index}`,{data:data.subarray(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE).toString('base64')}).expect(200);
      await call('owner','put',`/${id}`,{...edit,uploadId,mutationId:randomUUID()}).expect(400);
      const clip=(await hero('owner','put',`/${id}`,{...edit,uploadId,mutationId:randomUUID()}).expect(200)).body.clip;
      assert.match(clip.src,/^\/api\/hero-videos\//);
      await request(app).get(`/api/hero-videos/${id}/video`).set('Range','bytes=0-23').expect(206);
      await request(app).get(`/api/proof-videos/${id}/video`).expect(404);
      assert.equal((await request(app).get('/api/proof-videos')).body.clips.some(clip=>clip.id===id),false);
      const carousel=(await request(app).get('/api/hero-carousel')).body.carousel;
      await request(app).put('/api/hero-carousel').set('Origin',process.env.APP_ORIGIN).set('Cookie',cookies.owner).send({expectedRevision:carousel.revision,intervalSeconds:2,photos:[`hero-video-${id}`]}).expect(200);
      assert.deepEqual((await request(app).get('/api/hero-carousel')).body.carousel.photos,[`hero-video-${id}`]);
      await hero('administrator','put',`/${id}`,{...edit,expectedRevision:1,mutationId:randomUUID(),description:'Updated hero description'}).expect(200);
      assert.equal((await request(app).get('/api/hero-videos')).body.clips[0].description,'Updated hero description');
      await hero('owner','delete',`/${id}`,{expectedRevision:2}).expect(200);
      await request(app).get(`/api/hero-videos/${id}/video`).expect(404);
      assert.equal(await MediaUpload.countDocuments({_id:uploadId}),0);
    });
    const start = await call('owner', 'post', `/${clipId}/uploads`, meta).expect(201), uploadId = start.body.uploadId;
    const uploadChunk = index => call('owner', 'put', `/${clipId}/uploads/${uploadId}/chunks/${index}`, { data: data.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).toString('base64') }).expect(200);
    await t.test('incomplete files stay private and cannot replace the current video', async () => {
      await uploadChunk(0);
      await call('owner', 'put', `/${clipId}`, { ...edit, uploadId }).expect(400);
      await request(app).get(`/api/proof-videos/${clipId}/video`).expect(404);
      assert.equal((await request(app).get('/api/proof-videos')).body.clips[0].facebookUrl, DEFAULT_PROOF_VIDEOS[0].facebookUrl);
      assert.equal((await MediaUpload.findById(uploadId)).completed, false);
      await call('administrator', 'put', `/${clipId}/uploads/${uploadId}/chunks/1`, { data: data.subarray(CHUNK_SIZE).toString('base64') }).expect(404);
    });
    await t.test('publishing atomically attaches exact chunks and supports Safari range requests', async () => {
      await uploadChunk(1); await uploadChunk(1); // Safe retry, no duplicate bytes.
      const saved = await call('owner', 'put', `/${clipId}`, { ...edit, uploadId }).expect(200);
      assert.equal(saved.body.clip.revision, 1); assert.equal(saved.body.clip.facebookUrl, null);
      assert.equal(saved.body.clip.description, edit.description);
      await call('owner', 'put', `/${clipId}`, { ...edit, uploadId }).expect(200); // Lost response retry.
      assert.equal(await AuditEvent.countDocuments({ action: 'proof-video.published' }), 1);
      assert.equal((await MediaUpload.findById(uploadId)).expiresAt, undefined);
      assert.equal(await MediaChunk.countDocuments({ uploadId, expiresAt: { $exists: true } }), 0);
      for (const [start, end] of [[0, 1], [CHUNK_SIZE - 4, CHUNK_SIZE + 8]]) {
        const range = await request(app).get(`/api/proof-videos/${clipId}/video`).set('Range', `bytes=${start}-${end}`).buffer(true).parse((res, done) => { const chunks = []; res.on('data', bytes => chunks.push(bytes)); res.on('end', () => done(null, Buffer.concat(chunks))); }).expect(206);
        assert.deepEqual(range.body, data.subarray(start, end + 1));
      }
      await request(app).head(`/api/proof-videos/${clipId}/video`).expect(200).expect('Content-Length', String(data.length));
      await request(app).get(`/api/proof-videos/${clipId}/video`).set('Range', 'bytes=999999999-').expect(416);
    });
    await t.test('description-only edits persist without replacing bytes and reject stale changes', async () => {
      const changed = { ...edit, expectedRevision: 1, mutationId: randomUUID(), description: '<b>Plain text</b>\nProgress update', posterData: Buffer.from([0xff,0xd8,0xff,0xdb,0,0]).toString('base64') };
      await call('administrator', 'put', `/${clipId}`, changed).expect(200);
      assert.equal((await ProofVideo.findById(clipId)).uploadId, uploadId);
      assert.equal((await ProofVideo.findById(clipId)).hasPoster, true);
      await request(app).get(`/api/proof-videos/${clipId}/poster`).expect(200).expect('Content-Type', /image\/jpeg/);
      assert.equal(await MediaChunk.countDocuments({ uploadId }), 2);
      assert.equal((await request(app).get('/api/proof-videos')).body.clips[0].description, changed.description);
      await call('owner', 'put', `/${clipId}`, { ...edit, mutationId: randomUUID() }).expect(409);
    });
    await t.test('private lessons and another card’s upload cannot be attached to public proof', async () => {
      const privateId = randomUUID();
      await MediaUpload.create({ _id: privateId, lessonId: 'private-lesson', kind: 'video', completed: true, uploadedBy: users.owner._id });
      await call('owner', 'put', `/${clipId}`, { ...edit, expectedRevision: 2, uploadId: privateId, mutationId: randomUUID() }).expect(400);
      await call('owner', 'put', '/new-card', { ...edit, uploadId, mutationId: randomUUID() }).expect(400);
      await call('owner', 'put', '/new-card', { ...edit, mutationId: randomUUID() }).expect(400);
      assert.equal((await ProofVideo.findById(clipId)).uploadId, uploadId);
    });
    await t.test('additional cards are paginated with no three-card limit or duplicates', async () => {
      await ProofVideo.insertMany(Array.from({ length: 55 }, (_, i) => ({ _id: `extra-${String(i).padStart(3, '0')}`, title: `Fixture ${i}`, description: 'Pagination fixture', order: 100 + Math.floor(i / 3), revision: 1 })));
      let after = '', all = [];
      do { const response = await request(app).get(`/api/proof-videos${after ? `?after=${after}` : ''}`).expect(200); assert.ok(response.body.clips.length <= PROOF_PAGE_SIZE); all.push(...response.body.clips); after = response.body.nextCursor; } while (after);
      assert.equal(all.length, 58); assert.equal(new Set(all.map(clip => clip.id)).size, 58);
      await request(app).get('/api/proof-videos?after=broken').expect(400);
    });
    await t.test('removal hides playback and defaults stay removed after reload', async () => {
      await call('owner', 'delete', `/${clipId}`, { expectedRevision: 2 }).expect(200);
      await request(app).get(`/api/proof-videos/${clipId}/video`).expect(404);
      assert.equal((await request(app).get('/api/proof-videos')).body.clips.some(clip => clip.id === clipId), false);
      assert.equal(await MediaChunk.countDocuments({ uploadId }), 0);
    });
    await t.test('Reel links persist, reject unsafe URLs, and switch cleanly to and from uploads', async () => {
      const id = 'reel-url-card', facebookUrl = 'https://www.facebook.com/share/r/AbC123/';
      const linked = { ...edit, mutationId: randomUUID(), facebookUrl: `${facebookUrl}?mibextid=test` };
      for (const who of [null, 'staff', 'client']) await call(who, 'put', `/${id}`, linked).expect(who ? 403 : 401);
      for (const value of ['javascript:alert(1)', 'https://facebook.com.evil.example/reel/123/', 'https://facebook.com/profile.php?id=123']) await call('owner', 'put', `/${id}`, { ...linked, facebookUrl: value }).expect(400);
      await call('owner', 'put', `/${id}`, { ...linked, uploadId: randomUUID() }).expect(400);
      const saved = await call('owner', 'put', `/${id}`, linked).expect(200);
      assert.equal(saved.body.clip.facebookUrl, facebookUrl); assert.equal(saved.body.clip.src, null); assert.equal(saved.body.clip.poster, null);
      await call('owner', 'put', `/${id}`, linked).expect(200);
      assert.equal((await ProofVideo.findById(id)).revision, 1);
      const description = { ...edit, expectedRevision: 1, mutationId: randomUUID(), description: 'Saved Reel description' };
      await call('administrator', 'put', `/${id}`, description).expect(200);
      assert.equal((await ProofVideo.findById(id)).facebookUrl, facebookUrl);
      const started = await call('owner', 'post', `/${id}/uploads`, meta).expect(201), replacement = started.body.uploadId;
      for (const index of [0, 1]) await call('owner', 'put', `/${id}/uploads/${replacement}/chunks/${index}`, { data: data.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).toString('base64') }).expect(200);
      const uploaded = await call('owner', 'put', `/${id}`, { ...description, expectedRevision: 2, mutationId: randomUUID(), uploadId: replacement }).expect(200);
      assert.equal(uploaded.body.clip.facebookUrl, null); assert.ok(uploaded.body.clip.src);
      await request(app).head(`/api/proof-videos/${id}/video`).expect(200);
      const switched = await call('owner', 'put', `/${id}`, { ...description, expectedRevision: 3, mutationId: randomUUID(), facebookUrl }).expect(200);
      assert.equal(switched.body.clip.facebookUrl, facebookUrl); assert.equal(switched.body.clip.src, null);
      assert.equal(await MediaUpload.countDocuments({ _id: replacement }), 0); assert.equal(await MediaChunk.countDocuments({ uploadId: replacement }), 0);
      await request(app).get(`/api/proof-videos/${id}/video`).expect(404);
      // A replacement Reel must never display the thumbnail of an unrelated original.
      const original = DEFAULT_PROOF_VIDEOS[1];
      const replaced = await call('owner', 'put', `/${original.id}`, { ...edit, mutationId: randomUUID(), facebookUrl }).expect(200);
      assert.equal(replaced.body.clip.poster, null);
      const listed = (await request(app).get('/api/proof-videos')).body.clips.find(clip => clip.id === original.id);
      assert.equal(listed.facebookUrl, facebookUrl);
      await call('owner', 'delete', `/${id}`, { expectedRevision: 4 }).expect(200);
      assert.equal((await ProofVideo.findById(id)).deleted, true);
    });
    await t.test('role revocation applies to active uploads and edits', async () => {
      const begin = await call('administrator', 'post', '/new-admin-card/uploads', meta).expect(201);
      await User.updateOne({ _id: users.administrator._id }, { $set: { role: 'staff' } });
      await call('administrator', 'put', `/new-admin-card/uploads/${begin.body.uploadId}/chunks/0`, { data: data.subarray(0, CHUNK_SIZE).toString('base64') }).expect(403);
      await call('administrator', 'put', '/new-admin-card', { ...edit, uploadId: begin.body.uploadId }).expect(403);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
