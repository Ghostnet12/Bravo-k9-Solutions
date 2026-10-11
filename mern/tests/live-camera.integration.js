import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('camera-frame health is server validated, private, advancing and expires without new frames', { timeout:180000 }, async()=>{
 const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:replica.getUri(),MONGODB_DB:'live_camera_integration',APP_ORIGIN:'http://localhost:5173'});
 delete process.env.STRIPE_SECRET_KEY;delete process.env.BRAVO_LIVE_ENABLED;
 try{
  const {default:app}=await import('../server/client-services-app.js');
  const {connectDb}=await import('../server/db.js');
  const {User,Session,LiveSession}=await import('../server/models.js');await connectDb();
  const cookies={};
  for(const [name,role] of [['trainer','owner'],['other','staff'],['member','member']]){
   const user=await User.create({name,role,passwordHash:'fixture-only'}),token=randomBytes(32).toString('hex');
   if(name==='trainer')process.env.OWNER_USER_ID=String(user._id);
   await Session.create({userId:user._id,tokenHash:createHash('sha256').update(token).digest('hex'),issuedAt:new Date(),lastSeenAt:new Date(),expiresAt:new Date(Date.now()+3600000)});cookies[name]=`bravo_session=${token}`;
  }
  const post=(path,body,who='trainer')=>request(app).post(path).set('Origin',process.env.APP_ORIGIN).set('Cookie',cookies[who]).send(body);
  const created=(await post('/api/live',{audience:'public',dogName:'Test dog',publicConsent:true}).expect(201)).body.session;
  const endpoint=`/api/live/${created.id}/heartbeat`,id=randomUUID(),proof=n=>({id,kind:'camera',framesCaptured:n});
  assert.equal((await post(endpoint,{cameraReady:true}).expect(200)).body.session.status,'starting');
  assert.equal((await post(endpoint,{cameraReady:true,publication:proof(1)}).expect(200)).body.session.status,'starting');
  await post(endpoint,{cameraReady:true,publication:{...proof(2),framesEncoded:2}}).expect(400);
  await post(endpoint,{cameraReady:true,publication:proof(2)},'member').expect(403);
  await post(endpoint,{cameraReady:true,publication:proof(2)},'other').expect(404);
  const active=(await post(endpoint,{cameraReady:true,publication:proof(3)}).expect(200)).body.session;assert.equal(active.status,'live');
  const record=await LiveSession.findById(created.id).lean();assert.equal(record.publication.kind,'camera');assert.equal(record.publication.framesCaptured,3);assert.equal(record.publication.framesEncoded,undefined);assert.equal(record.publication.framesDecoded,undefined);
  const published=record.lastPublishedAt.getTime();
  assert.equal((await post(endpoint,{cameraReady:true,publication:proof(3)}).expect(200)).body.session.status,'reconnecting');
  assert.equal((await LiveSession.findById(created.id)).lastPublishedAt.getTime(),published,'repeated frames do not renew the media lease');
  assert.equal((await post(endpoint,{cameraReady:false,publication:proof(6)}).expect(200)).body.session.status,'reconnecting');
  assert.equal((await post(endpoint,{cameraReady:true,publication:proof(8)}).expect(200)).body.session.status,'live');
  const listing=(await request(app).get('/api/live').expect(200)).body;assert.equal(listing.sessions[0].id,created.id);assert.equal(listing.sessions[0].publication,undefined,'private counters are not in public discovery');
  await LiveSession.updateOne({_id:created.id},{$set:{lastPublishedAt:new Date(Date.now()-21000)}});
  assert.equal((await request(app).get('/api/live').expect(200)).body.sessions.length,0,'frozen publication expires even with a recently seen trainer');
 }finally{await mongoose.disconnect();await replica.stop();}
});
