import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DEFAULT_BANNER } from '../shared/site-banner.js';
test('banner permissions, validation, durable updates and edit conflicts', { timeout: 180000 }, async () => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'banner_test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  try {
    const { default: app } = await import('../server/site-image-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Session, AuditEvent } = await import('../server/models.js');
    const { SiteBanner } = await import('../server/site-banner.js');
    await connectDb(); const cookies = {};
    for (const role of ['owner', 'administrator', 'staff', 'member']) {
      const user = await User.create({ name: role, role: role === 'administrator' ? 'owner' : role, passwordHash: 'fixture' });
      const token = randomBytes(32).toString('hex');
      await Session.create({ tokenHash: createHash('sha256').update(token).digest('hex'), userId: user._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[role] = `bravo_session=${token}`;
    }
    const put = (role, data, origin = process.env.APP_ORIGIN) => { const r = request(app).put('/api/site-banner').set('Origin', origin); if (role) r.set('Cookie', cookies[role]); return r.send(data); };
    const update = { expectedRevision: 0, alerts: ['Weather closure: call Bravo for updates.'] };
    for (const role of [null, 'staff', 'member']) await put(role, update).expect(role ? 403 : 401);
    await put('owner', update, 'https://wrong.example').expect(403);
    await put('owner', { ...update, alerts: ['x'.repeat(281)] }).expect(400);
    await put('owner', { ...update, alerts: [' '] }).expect(400);
    await put('owner', { ...update, alerts: Array(31).fill('notice') }).expect(400);
    await put('owner', { ...update, settings: { ...DEFAULT_BANNER, edgeColor: 'url(https://bad.example)' } }).expect(400);
    await put('owner', { ...update, settings: { ...DEFAULT_BANNER, speed: 0 } }).expect(400);
    update.settings = { ...DEFAULT_BANNER, locationLabel: '', timeLabel: '', weatherLabel: '', alertLabel: '', fallbackLabel: '', location: 'Aberdeen & Bath', weatherOverride: 'Outdoor sessions paused', timeOverride: 'Call for availability', centerColor: '#ffffaa', speed: 1.5 };
    const saved = await put('owner', update).expect(200); assert.equal(saved.body.revision, 1);
    const publicRead = await request(app).get('/api/site-banner').expect(200); assert.deepEqual(publicRead.body, saved.body);
    await put('owner', update).expect(409);
    const cleared = await put('administrator', { expectedRevision: 1, alerts: [] }).expect(200); assert.deepEqual(cleared.body.alerts, []);
    assert.deepEqual(cleared.body.settings, update.settings, 'Old clients preserve the published settings');
    assert.equal(await AuditEvent.countDocuments({ action: 'site-banner.published' }), 2);
    await SiteBanner.updateOne({ _id: 'home' }, { $set: { settings: { ...DEFAULT_BANNER, textColor: '#101010', borderColor: '#101010', centerColor: '#ffe8a4', edgeColor: '#f58a24' } } });
    const migratedLegacy = await request(app).get('/api/site-banner').expect(200);
    assert.equal(migratedLegacy.body.settings.textColor, '#101010');
    for (const key of ['borderColor', 'centerColor', 'edgeColor']) assert.equal(migratedLegacy.body.settings[key], '#ba9a64', `${key} migrates from the exact legacy default palette`);
    const customPalette = { ...DEFAULT_BANNER, textColor: '#fefefe', borderColor: '#123456', centerColor: '#654321', edgeColor: '#abcdef' };
    await SiteBanner.updateOne({ _id: 'home' }, { $set: { settings: customPalette } });
    const preservedCustom = await request(app).get('/api/site-banner').expect(200);
    assert.deepEqual(preservedCustom.body.settings, customPalette, 'Genuinely customized banner colors are preserved');
    await SiteBanner.updateOne({ _id: 'home' }, { $set: { alerts: ['Bravo is live now under live cams in menu on upper right-hand corner.', 'Training workshop this Saturday.'] } });
    assert.deepEqual((await request(app).get('/api/site-banner').expect(200)).body.alerts, ['Training workshop this Saturday.']);
    const blocked = await User.findOne({ role: 'owner' }); blocked.blocked = true; await blocked.save(); await put('owner', { expectedRevision: 2, alerts: ['blocked'] }).expect(401);
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
