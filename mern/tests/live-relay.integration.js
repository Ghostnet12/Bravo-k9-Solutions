import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('relay authorization keeps public guests welcome and private sessions isolated', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  Object.assign(process.env, { NODE_ENV:'test', MONGODB_URI:replica.getUri(), MONGODB_DB:'live_relay_test', APP_ORIGIN:'http://localhost:5173', BRAVO_TURN_PROVIDER:'coturn', BRAVO_TURN_URLS:'turn:127.0.0.1:3478?transport=tcp', BRAVO_TURN_SHARED_SECRET:randomBytes(32).toString('hex'), BRAVO_LIVE_ICE_POLICY:'relay' });
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Session, Booking, LiveSession, Subscription, RateBucket } = await import('../server/models.js');
  const { digest } = await import('../server/auth.js');
  const cookies={},users={}; const originalFetch=globalThis.fetch;
  const call=(who,method,path,body={})=>{const r=request(app)[method]('/api'+path).set('Origin',process.env.APP_ORIGIN);if(cookies[who])r.set('Cookie',cookies[who]);return method==='get'?r:r.send(body);};
  const offer={type:'offer',sdp:'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n'};
  const beat=(who,s)=>call(who,'post',`/live/${s.id}/heartbeat`,{cameraReady:true,publication:{id:randomUUID(),framesEncoded:5,framesDecoded:5}});
  let pub,priv;
  try {
    await connectDb();
    for(const [who,role]of Object.entries({owner:'owner',trainer:'staff',client:'member',stranger:'member'})){
      users[who]=await User.create({name:who,role,passwordHash:'fixture-only'});const token=randomBytes(32).toString('hex');cookies[who]='bravo_session='+token;
      await Session.create({userId:users[who]._id,tokenHash:digest(token),issuedAt:new Date(),lastSeenAt:new Date(),expiresAt:new Date(Date.now()+3600000)});
    }
    process.env.OWNER_USER_ID=String(users.owner._id);
    const booking=await Booking.create({userId:users.client._id,staffId:users.trainer._id,staffIds:[users.trainer._id],dogName:'Private Test Dog',status:'confirmed'});
    pub=(await call('owner','post','/live',{dogName:'Public Test Dog',audience:'public',publicConsent:true}).expect(201)).body.session;
    priv=(await call('trainer','post','/live',{dogName:'Private Test Dog',audience:'client',bookingId:String(booking._id)}).expect(201)).body.session;
    await t.test('unpublished sessions cannot dispense guest credentials',async()=>{
      await call(null,'post',`/live/${pub.id}/connection`).expect(410);
      await call('owner','post',`/live/${pub.id}/connection`).expect(200);
      await beat('owner',pub).expect(200);await beat('trainer',priv).expect(200);
    });
    await t.test('anonymous and non-subscribing users get public watch access and expiring relay credentials',async()=>{
      assert.equal(await Subscription.countDocuments({}),0);
      for(const who of [null,'stranger']){
        const r=await call(who,'post',`/live/${pub.id}/connection`).expect(200);
        assert.match(r.headers['cache-control'],/no-store/);assert.equal(r.body.iceTransportPolicy,'relay');assert.equal(r.body.relayConfigured,true);
        assert.ok(!JSON.stringify(r.body).includes(process.env.BRAVO_TURN_SHARED_SECRET));
        const peer=(await call(who,'post',`/live/${pub.id}/watch`,{offer}).expect(200)).body;
        await call(who,'post',`/live/${pub.id}/peers/${peer.peerId}/poll`,{token:peer.token}).expect(200);
      }
    });
    await t.test('valid viewers behind one cellular address retain independent polling budgets',async()=>{
      const peers=[];for(let n=0;n<2;n++)peers.push((await call(null,'post',`/live/${pub.id}/watch`,{offer}).expect(200)).body);
      const window=Math.floor(Date.now()/60000);
      for(const ip of ['127.0.0.1','::ffff:127.0.0.1','::1'])for(const scope of ['api','live-peer-poll'])for(const bucket of [window,window+1])await RateBucket.updateOne({_id:digest(`${scope}:${ip}:${bucket}`)},{$set:{count:10000,expiresAt:new Date((bucket+1)*60000)}},{upsert:true});
      for(const peer of peers)await call(null,'post',`/live/${pub.id}/peers/${peer.peerId}/poll`,{token:peer.token}).expect(200);
      await call(null,'post',`/live/${pub.id}/peers/${peers[0].peerId}/poll`,{token:randomBytes(32).toString('hex')}).expect(429);
      await RateBucket.deleteMany({});
    });
    await t.test('guests and unrelated users cannot mint credentials or watch a private session',async()=>{
      for(const who of [null,'stranger']){
        await call(who,'post',`/live/${priv.id}/connection`).expect(404);
        await call(who,'post',`/live/${priv.id}/watch`,{offer}).expect(404);
        assert.ok(!(await call(who,'get','/live')).body.sessions.some(s=>s.id===priv.id));
      }
      for(const who of ['owner','trainer','client'])await call(who,'post',`/live/${priv.id}/connection`).expect(200);
    });
    await t.test('invalid sessions, cross-origin and custom ICE injections fail without issuing credentials',async()=>{
      await call(null,'post',`/live/${randomUUID()}/connection`).expect(404);
      await call(null,'post',`/live/${pub.id}/connection`,{iceServers:[{urls:'turn:untrusted.test:3478'}]}).expect(400);
      await request(app).post(`/api/live/${pub.id}/connection`).set('Origin','https://attacker.test').send({}).expect(403);
    });
    await t.test('an unavailable configured provider returns a safe error, not a fake connection',async()=>{
      process.env.BRAVO_TURN_SHARED_SECRET='';
      const r=await call(null,'post',`/live/${pub.id}/connection`).expect(503);assert.equal(r.body.code,'LIVE_RELAY_NOT_CONFIGURED');
      process.env.BRAVO_TURN_SHARED_SECRET=randomBytes(32).toString('hex');
    });
    await t.test('session closure during a credential request is rechecked before returning secrets',async()=>{
      process.env.BRAVO_TURN_PROVIDER='cloudflare';process.env.CLOUDFLARE_TURN_KEY_ID='fixture-key';process.env.CLOUDFLARE_TURN_API_TOKEN=randomBytes(32).toString('hex');
      globalThis.fetch=async()=>{await LiveSession.updateOne({_id:pub.id},{$set:{open:false,status:'ended'}});return{ok:true,json:async()=>({iceServers:[{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'short-lived',credential:'short-lived'}]})};};
      await call(null,'post',`/live/${pub.id}/connection`).expect(410);
      globalThis.fetch=originalFetch;process.env.BRAVO_TURN_PROVIDER='coturn';
    });
    await t.test('ended sessions and revoked trainers never issue fresh relay access',async()=>{
      await call(null,'post',`/live/${pub.id}/connection`).expect(410);
      await User.updateOne({_id:users.trainer._id},{$set:{blocked:true}});
      await call('client','post',`/live/${priv.id}/connection`).expect(410);
    });
  }finally{globalThis.fetch=originalFetch;await mongoose.disconnect();await replica.stop();}
});
