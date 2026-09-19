import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomBytes, createHash } from 'node:crypto';
test('public ratings contain client accounts only, preserve honest negative feedback and never delete team history', {timeout:180000}, async()=>{
  const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
  process.env.NODE_ENV='test';process.env.MONGODB_URI=replica.getUri();process.env.MONGODB_DB='review_clarity';process.env.APP_ORIGIN='http://localhost:5173';
  try {
    const {default:app}=await import('../server/app.js');const {connectDb}=await import('../server/db.js');const {User,Review,Session}=await import('../server/models.js');await connectDb();
    const rows=[];for(const [role,rating] of [['owner',5],['staff',5],['member',5],['member',1]]){
      const user=await User.create({name:'Same Name',role,passwordHash:'fixture'});await Review.create({userId:user._id,authorName:user.name,rating,body:'Authentic fixture feedback.'});rows.push(user);
    }
    const publicRead=await request(app).get('/api/reviews').expect(200);assert.equal(publicRead.body.count,2);assert.equal(publicRead.body.average,3);assert.ok(publicRead.body.reviews.every(r=>!('userId'in r)&&!('author'in r)));
    const token=randomBytes(32).toString('hex');await Session.create({userId:rows[1]._id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)});
    await request(app).put('/api/reviews/mine').set('Origin',process.env.APP_ORIGIN).set('Cookie',`bravo_session=${token}`).send({rating:5,body:'A new staff review should be rejected.'}).expect(403);
    assert.equal(await Review.countDocuments(),4);
    await User.updateOne({_id:rows[2]._id},{$set:{role:'staff'}});const promoted=await request(app).get('/api/reviews').expect(200);assert.equal(promoted.body.count,1);assert.equal(promoted.body.average,1);
  } finally {await mongoose.disconnect();await replica.stop();}
});
