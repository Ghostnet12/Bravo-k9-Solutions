import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DEFAULT_HOME_ADS } from '../shared/site-ads.js';

test('sitewide ads are public but mutations are owner-only, durable and conflict-safe', { timeout: 180000 }, async () => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV='test'; process.env.MONGODB_URI=replica.getUri(); process.env.MONGODB_DB='site_ads_test'; process.env.APP_ORIGIN='http://localhost:5173';
  try {
    const { default: app } = await import('../server/site-image-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Session, AuditEvent, ProofVideo } = await import('../server/models.js');
    await connectDb(); const cookies={};
    for (const name of ['owner','administrator','staff','member']) {
      const user=await User.create({name,role:name==='administrator'?'owner':name,passwordHash:'fixture'});
      const token=randomBytes(32).toString('hex');
      await Session.create({tokenHash:createHash('sha256').update(token).digest('hex'),userId:user._id,expiresAt:new Date(Date.now()+3600000)});
      cookies[name]=`bravo_session=${token}`;
    }
    const initial=await request(app).get('/api/site-ads').expect(200);
    assert.equal(initial.body.revision,0); assert.equal(initial.body.ads[0].id,DEFAULT_HOME_ADS[0].id);
    const { Workshop }=await import('../server/workshop-store.js');
    const { DEFAULT_WORKSHOP }=await import('../shared/workshops.js');
    const { resolveWorkshop }=await import('../shared/workshop-schedule.js');
    await Workshop.create({_id:'featured',details:{...DEFAULT_WORKSHOP,scheduleMode:'weekly',startTime:'12:00',endTime:'14:00'},revision:1});
    const recurring=(await request(app).get('/api/site-ads').expect(200)).body.ads[0];
    const resolved=resolveWorkshop({...DEFAULT_WORKSHOP,scheduleMode:'weekly',startTime:'12:00',endTime:'14:00'});
    assert.equal(recurring.workshop.date,resolved.date);assert.equal(recurring.workshop.time,resolved.time);
    assert.equal(recurring.scheduleHidden,resolved.date!=='2026-10-03','dated artwork cannot advertise another occurrence');
    await Workshop.updateOne({_id:'featured'},{$set:{'details.scheduleMode':'none'}});
    const undated=(await request(app).get('/api/site-ads').expect(200)).body.ads[0];
    assert.equal(undated.workshop.date,null);assert.equal(undated.workshop.time,'');assert.equal(undated.scheduleHidden,true);
    await Workshop.updateOne({_id:'featured'},{$set:{'details.published':false}});
    assert.equal((await request(app).get('/api/site-ads').expect(200)).body.ads[0].workshop,null);
    await Workshop.deleteOne({_id:'featured'});


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
    await write('post','/api/site-ads','owner',{expectedRevision:4,title:'Video ad',alt:'Recorded training',videoId:'missing'}).expect(400);
    await ProofVideo.create({_id:'approved-video',title:'Recorded Bravo training',description:'Published footage',order:50,revision:1,uploadId:'approved-upload',deleted:false});
    const videoAd=await write('post','/api/site-ads','administrator',{expectedRevision:4,title:'Video ad',alt:'Recorded training',videoId:'approved-video'}).expect(201);
    assert.equal(videoAd.body.ads.at(-1).videoSrc,'/api/proof-videos/approved-video/video?v=1');
    // More than the previous 20-ad ceiling can be published, reordered and edited.
    let many=videoAd.body;
    for(let index=0; index<23; index++) {
      many=(await write('post','/api/site-ads','owner',{expectedRevision:many.revision,title:`Additional ad ${index}`,alt:'Published test ad',videoId:'approved-video'}).expect(201)).body;
    }
    assert.equal(many.ads.length,25);
    const ids=many.ads.map(ad=>ad.id).reverse();
    many=(await write('put','/api/site-ads','owner',{expectedRevision:many.revision,ids,settings:{autoplaySeconds:12}}).expect(200)).body;
    assert.deepEqual(many.ads.map(ad=>ad.id),ids);
    const first=ids[0];
    many=(await write('put',`/api/site-ads/${first}`,'owner',{expectedRevision:many.revision,title:'Updated beyond former cap',alt:'Updated ad',enabled:false,videoId:'approved-video'}).expect(200)).body;
    assert.equal(many.ads[0].enabled,false);
    many=(await write('delete',`/api/site-ads/${first}`,'owner',{expectedRevision:many.revision}).expect(200)).body;
    assert.equal(many.ads.length,24);
    const persisted=(await request(app).get('/api/site-ads').expect(200)).body;
    assert.deepEqual(persisted,many);
    await ProofVideo.updateOne({_id:'approved-video'},{$set:{deleted:true}});
    assert.equal((await request(app).get('/api/site-ads').expect(200)).body.ads.at(-1).videoSrc,'');


    // Legacy destination repair is presentation-only. Explicit authenticated
    // edits persist and can intentionally restore Contact or remove the link.
    const { SiteAdCollection } = await import('../server/site-ads.js');
    const legacy = [
      ['ad-b3df1e50-01ff-498b-8ddf-e6c3271a125a', 'Online courses', '/learn'],
      ['ad-2b5c8355-930e-40dc-b036-4c99a92cf18c', 'Gunner', '/#specialist-training'],
      ['ad-84622f25-49c4-46b4-9fab-f48956a8988e', 'Saturday workshops', '/workshops'],
      ['ad-25871280-b5a3-430c-bac6-22da0edc2009', 'No treats or toys', '/dog-training'],
      ['ad-10a0021e-75de-42e1-9944-2f89ebdea4f3', 'Live', '/live'],
    ];
    await Workshop.create({ _id: 'featured', details: { ...DEFAULT_WORKSHOP, published: true, scheduleMode: 'weekly', startTime: '12:00', endTime: '14:00' }, revision: 1 });
    await SiteAdCollection.updateOne({ _id: 'home' }, { $set: { ads: legacy.map(([id, title]) => ({ id, title, alt: title, link: '/contact', enabled: true, image: '/images/training-education.webp' })) } });
    const beforeRead = await SiteAdCollection.findById('home').lean();
    const routed = (await request(app).get('/api/site-ads').expect(200)).body;
    assert.deepEqual(routed.ads.map(ad => ad.link), legacy.map(ad => ad[2]));
    assert.equal(routed.ads[2].scheduleHidden, false);
    assert.equal(routed.ads[2].workshop.date, resolved.date, 'workshop metadata uses the same effective destination');
    assert.deepEqual(await SiteAdCollection.findById('home').lean(), beforeRead, 'a public GET never edits stored data');
    const edited = routed.ads[0];
    const explicit = (await write('put', `/api/site-ads/${edited.id}`, 'owner', { expectedRevision: routed.revision, title: edited.title, alt: edited.alt, link: '/contact', enabled: true }).expect(200)).body;
    assert.equal(explicit.ads[0].link, '/contact');
    assert.equal((await request(app).get('/api/site-ads').expect(200)).body.ads[0].link, '/contact', 'explicit Contact choice survives a fresh read');
    const saved = await SiteAdCollection.findById('home').lean();
    assert.equal(saved.ads[0].destinationConfigured, true);
    assert.equal(saved.ads[0].image, beforeRead.ads[0].image, 'destination-only edit retains artwork');
    await write('put', `/api/site-ads/${edited.id}`, 'administrator', { expectedRevision: explicit.revision, title: edited.title, alt: edited.alt, link: '', enabled: true }).expect(200);
    assert.equal((await request(app).get('/api/site-ads').expect(200)).body.ads[0].link, '', 'an explicit empty destination remains optional');

  } finally { await mongoose.disconnect(); await replica.stop(); }
});

