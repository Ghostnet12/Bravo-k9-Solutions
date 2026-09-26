import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DEFAULT_HOME_ADS } from '../shared/site-ads.js';

test('homepage ads are public but mutations are owner-only, durable and conflict-safe', { timeout: 180000 }, async () => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV='test'; process.env.MONGODB_URI=replica.getUri(); process.env.MONGODB_DB='site_ads_test'; process.env.APP_ORIGIN='http://localhost:5173';
  try {
    const { default: app } = await import('../server/site-image-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Session, AuditEvent } = await import('../server/models.js');
    await connectDb(); const cookies={};
    for (const name of ['owner','administrator','staff','member']) {
      const user=await User.create({name,role:name==='administrator'?'owner':name,passwordHash:'fixture'});
      const token=randomBytes(32).toString('hex');
      await Session.create({tokenHash:createHash('sha256').update(token).digest('hex'),userId:user._id,expiresAt:new Date(Date.now()+3600000)});
      cookies[name]=`bravo_session=${token}`;
    }
    const initial=await request(app).get('/api/site-ads').expect(200);
    assert.equal(initial.body.revision,0); assert.equal(initial.body.ads[0].id,DEFAULT_HOME_ADS[0].id);

    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl9sAAAAASUVORK5CYII=';
    const body={expectedRevision:0,title:'Second ad',alt:'Second Bravo advertisement',link:'/contact',enabled:true,image:{filename:'ad.png',contentType:'image/png',data:png}};
    const write=(method,path,role,payload,origin=process.env.APP_ORIGIN)=>{const r=request(app)[method](path).set('Origin',origin);if(role)r.set('Cookie',cookies[role]);return r.send(payload);};
    for(const role of [null,'staff','member']) await write('post','/api/site-ads',role,body).expect(role?403:401);
    await write('post','/api/site-ads','owner',body,'https://wrong.example').expect(403);
    await write('post','/api/site-ads','owner',{...body,link:'javascript:alert(1)'}).expect(400);

    const added=await write('post','/api/site-ads','owner',body).expect(201);
    assert.equal(added.body.revision,1); assert.equal(added.body.ads.length,2);
    const dynamic=added.body.ads.find(ad=>ad.title==='Second ad'); assert.ok(dynamic.src.startsWith('/api/site-ads/'));
    await request(app).get(new URL(dynamic.src,'http://x').pathname).expect('Content-Type',/image\/png/).expect(200);
    await write('post','/api/site-ads','owner',body).expect(409);

    const reordered=await write('put','/api/site-ads','administrator',{expectedRevision:1,ids:[dynamic.id,DEFAULT_HOME_ADS[0].id],settings:{autoplaySeconds:9}}).expect(200);
    assert.equal(reordered.body.ads[0].id,dynamic.id); assert.equal(reordered.body.settings.autoplaySeconds,9);
    const updated=await write('put',`/api/site-ads/${dynamic.id}`,'owner',{expectedRevision:2,title:'Updated ad',alt:'Updated Bravo advertisement',link:'https://example.com/workshop',enabled:false}).expect(200);
    assert.equal(updated.body.ads.find(ad=>ad.id===dynamic.id).enabled,false);
    const removed=await write('delete',`/api/site-ads/${dynamic.id}`,'owner',{expectedRevision:3}).expect(200);
    assert.equal(removed.body.ads.length,1);
    assert.ok(await AuditEvent.countDocuments({targetType:'site-ads'})>=4);
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
