import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('discovery publishing, consent, privacy and performance reporting persist', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'discovery_test'; process.env.APP_ORIGIN = 'http://localhost:5173';
  delete process.env.VERCEL_ENV;
  t.after(async () => { await mongoose.disconnect(); await replica.stop(); });
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session } = await import('../server/models.js');
  const { digest } = await import('../server/auth.js');
  await connectDb();
  const cookies = {};
  for (const role of ['owner','staff','member']) {
    const user = await User.create({ name: role, role, passwordHash: 'fixture-only' });
    if (role === 'owner') process.env.OWNER_USER_ID = String(user._id);
    const token = randomBytes(32).toString('hex'); await Session.create({ userId: user._id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000) }); cookies[role] = `bravo_session=${token}`;
  }
  const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
  const { publicPageHandler } = await import('../server/public-page.js');
  const publicApp = express().get('/workshops', publicPageHandler);
  await t.test('workshop owner publishing with stale-write protection and private drafts', async () => {
    const first = (await call(null,'get','/api/workshops').expect(200)).body.event;
    assert.equal(first.cents,10000); assert.equal(first.time,'12:00 PM–2:00 PM'); assert.equal(first.location,'Wylie Park, Aberdeen, SD');
    const { revision, ...details } = first;
    const update = { ...details, expectedRevision: revision, location: 'Fixture training location', time: '10:00 a.m.' };
    await call('staff','put','/api/workshops',update).expect(403);
    await call(null,'put','/api/workshops',update).expect(401);
    await call('owner','put','/api/workshops',{ ...update, date:'2026-02-31' }).expect(400);
    await call('owner','put','/api/workshops',update).expect(200);
    assert.equal((await call(null,'get','/api/workshops')).body.event.time,'10:00 a.m.');
    const publishedHtml = (await request(publicApp).get('/workshops').expect(200)).text;
    assert.match(publishedHtml,/Fixture training location/); assert.match(publishedHtml,/10:00 a.m./); assert.match(publishedHtml,/October 3, 2026/); assert.match(publishedHtml,/\$100/);
    await call('owner','put','/api/workshops',update).expect(409);
    await call('owner','put','/api/workshops',{ ...update, expectedRevision:1, published:false }).expect(200);
    assert.equal((await call(null,'get','/api/workshops')).body.event,null);
    const privateHtml = (await request(publicApp).get('/workshops').expect(200)).text;
    assert.doesNotMatch(privateHtml,/Fixture training location|10:00 a.m./); assert.match(privateHtml,/Ask about the next session/);
    assert.equal((await call('owner','get','/api/workshops')).body.event.revision,2);
  });
  await t.test('launch requests require consent, deduplicate and stay private', async () => {
    await call(null,'post','/api/course-interest',{ email:'visitor@example.test',consent:false }).expect(400);
    await call(null,'post','/api/course-interest',{ email:'visitor@example.test',consent:true }).expect(202);
    await call(null,'post','/api/course-interest',{ email:'VISITOR@example.test',consent:true }).expect(202);
    await call(null,'post','/api/course-interest',{ email:'robot@example.test',consent:true,website:'spam' }).expect(202);
    await call(null,'get','/api/admin/course-interest').expect(401);
    await call('member','get','/api/admin/course-interest').expect(403);
    await call('staff','get','/api/admin/course-interest').expect(403);
    const list = (await call('owner','get','/api/admin/course-interest').expect(200)).body.interests;
    assert.equal(list.length,1); assert.equal(list[0].email,'visitor@example.test');
    await call('owner','delete',`/api/admin/course-interest/${list[0]._id}`,{}).expect(200);
    assert.equal((await call('owner','get','/api/admin/course-interest')).body.interests.length,0);
  });
  await t.test('metrics validate input, honor privacy and report genuine samples', async () => {
    const metric = { id:'v5-test-metric',name:'LCP',value:1250,area:'home',device:'mobile' };
    await call(null,'post','/api/telemetry/vitals',{...metric,email:'private@example.test'}).expect(400);
    await call(null,'post','/api/telemetry/vitals',metric).set('DNT','1').expect(204);
    assert.equal((await call('owner','get','/api/admin/site-health')).body.vitals.length,0);
    await call(null,'post','/api/telemetry/vitals',metric).expect(204);
    await call(null,'post','/api/telemetry/vitals',{...metric,value:1500}).expect(204);
    const token=randomUUID();
    await call(null,'post','/api/telemetry/visit',{token,channel:'direct',stage:'goal_selected'}).expect(204);
    await call(null,'post','/api/telemetry/visit',{token,channel:'direct',stage:'review_step'}).expect(204);
    const report = (await call('owner','get','/api/admin/site-health').expect(200)).body;
    assert.equal(report.vitals[0].count,1); assert.equal(report.vitals[0].p75,1500); assert.equal(report.stages.find(row=>row.stage==='review_step').count,1);
    assert.equal(report.totals.saved,0); assert.doesNotMatch(JSON.stringify(report),/private@example|v5-test-metric/);
  });
});
