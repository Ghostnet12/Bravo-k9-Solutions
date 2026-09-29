import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomBytes, createHash } from 'node:crypto';
test('public ratings contain client accounts only, preserve honest negative feedback and never delete team history', {timeout:180000}, async t=>{
  const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
  process.env.NODE_ENV='test';process.env.MONGODB_URI=replica.getUri();process.env.MONGODB_DB='review_clarity';process.env.APP_ORIGIN='http://localhost:5173';
  try {
    const {default:app}=await import('../server/app.js');const {connectDb}=await import('../server/db.js');const {User,Review,Session,AuditEvent}=await import('../server/models.js');await connectDb();
    const rows=[];for(const [role,rating] of [['owner',5],['staff',5],['member',5],['member',1]]){
      const user=await User.create({name:'Same Name',role,passwordHash:'fixture'});await Review.create({userId:user._id,authorName:user.name,rating,body:'Authentic fixture feedback.'});rows.push(user);
    }
    const publicRead=await request(app).get('/api/reviews').expect(200);assert.equal(publicRead.body.count,2);assert.equal(publicRead.body.average,3);assert.ok(publicRead.body.reviews.every(r=>!('userId'in r)&&!('author'in r)));
    const token=randomBytes(32).toString('hex');await Session.create({userId:rows[1]._id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)});
    await request(app).put('/api/reviews/mine').set('Origin',process.env.APP_ORIGIN).set('Cookie',`bravo_session=${token}`).send({rating:5,body:'A new staff review should be rejected.'}).expect(403);
    assert.equal(await Review.countDocuments(),4);
    await User.updateOne({_id:rows[2]._id},{$set:{role:'staff'}});const promoted=await request(app).get('/api/reviews').expect(200);assert.equal(promoted.body.count,1);assert.equal(promoted.body.average,1);
    process.env.OWNER_USER_ID=String(rows[0]._id);
    const {WebsiteReview}=await import('../server/review-store.js');
    const {DEFAULT_REVIEWS}=await import('../shared/reviews.js');
    const delegate=await User.create({name:'Delegated admin',role:'owner',passwordHash:'fixture'});
    const cookies={};
    for(const [name,user] of Object.entries({owner:rows[0],administrator:delegate,staff:rows[1],member:rows[3]})) {
      const secret=randomBytes(32).toString('hex');await Session.create({userId:user._id,tokenHash:createHash('sha256').update(secret).digest('hex'),expiresAt:new Date(Date.now()+3600000)});cookies[name]=`bravo_session=${secret}`;
    }
    const call=(who,method,path,body={})=>{let r=request(app)[method](path).set('Origin',process.env.APP_ORIGIN);if(who)r=r.set('Cookie',cookies[who]);return r.send(body);};
    const draft={authorName:'Fixture reviewer',body:'Our dog has made steady progress with clear guidance.',source:'Client review',rating:null};
    await t.test('only the configured primary owner can list, create, edit or remove any review',async()=>{
      for(const who of [null,'administrator','staff','member'])for(const [method,path,body] of [['get','/api/admin/reviews',{}],['post','/api/admin/reviews',draft],['patch','/api/admin/reviews/imported-tamyra-borg',{expectedRevision:0,body:draft.body}],['delete','/api/admin/reviews/imported-tamyra-borg',{expectedRevision:0}],['patch',`/api/admin/reviews/${(await Review.findOne({userId:rows[3]._id}))._id}`,{expectedRevision:0,hidden:true}]])await call(who,method,path,body).expect(who?403:401);
      assert.equal(await WebsiteReview.countDocuments(),0);
      const list=(await call('owner','get','/api/admin/reviews').expect(200)).body.reviews;
      assert.equal(list.filter(r=>r.kind==='website').length,7);assert.equal(list.filter(r=>r.kind==='customer').length,4);
      const sherrie=list.find(r=>r.authorName==='Sherrie Humphries');assert.equal(sherrie.rating,null);assert.equal(sherrie.body,DEFAULT_REVIEWS.find(r=>r.id===sherrie.id).body);
    });
    await t.test('imported and newly added reviews persist edits, removal and restoration',async()=>{
      const id='imported-tamyra-borg';
      const edited=(await call('owner','patch',`/api/admin/reviews/${id}`,{expectedRevision:0,body:draft.body}).expect(200)).body.review;
      assert.equal(edited.revision,1);assert.equal(edited.excerpt,'');
      await call('owner','patch',`/api/admin/reviews/${id}`,{expectedRevision:0,body:'A stale edit must not overwrite a published review.'}).expect(409);
      await call('owner','delete',`/api/admin/reviews/${id}`,{expectedRevision:1}).expect(200);
      assert.ok(!(await request(app).get('/api/reviews')).body.recommendations.some(r=>r.id===id));
      await call('owner','patch',`/api/admin/reviews/${id}`,{expectedRevision:2,hidden:false}).expect(200);
      assert.equal((await request(app).get('/api/reviews')).body.recommendations.find(r=>r.id===id).body,draft.body);
      const created=(await call('owner','post','/api/admin/reviews',draft).expect(201)).body.review;
      assert.equal(created.rating,null);assert.ok((await request(app).get('/api/reviews')).body.recommendations.some(r=>r.id===created.id));
      await call('owner','delete',`/api/admin/reviews/${created.id}`,{expectedRevision:created.revision}).expect(200);
      assert.equal(await WebsiteReview.countDocuments({_id:created.id}),1,'removal is recoverable');
      await call('owner','post','/api/admin/reviews',{...draft,rating:6}).expect(400);
      await call('owner','post','/api/admin/reviews',{...draft,userId:rows[0]._id}).expect(400);
      assert.ok(await AuditEvent.exists({action:'review.edited',targetId:id,'details.before.authorName':'Tamyra Borg'}));
      assert.ok(await AuditEvent.exists({action:'review.removed',targetId:created.id}));
    });
    await t.test('owner can manage account reviews without changing the customer account or letting clients republish removed reviews',async()=>{
      const original=await Review.findOne({userId:rows[3]._id}), id=`customer-${original._id}`;
      await call('owner','patch',`/api/admin/reviews/${id}`,{expectedRevision:0,body:draft.body,authorName:'Reviewer public name',rating:1}).expect(200);
      assert.equal((await User.findById(rows[3]._id)).name,'Same Name');
      assert.equal((await request(app).get('/api/reviews')).body.reviews.find(r=>r._id===String(original._id)).editedByOwner,true);
      await call('owner','delete',`/api/admin/reviews/${id}`,{expectedRevision:1}).expect(200);
      await call('member','put','/api/reviews/mine',{rating:1,body:'The customer can still update their own honest feedback.',hidden:false}).expect(200);
      assert.equal((await Review.findById(original._id)).hidden,true);
      await call('owner','patch',`/api/admin/reviews/${id}`,{expectedRevision:2,hidden:false}).expect(409);
      await call('owner','patch',`/api/admin/reviews/${id}`,{expectedRevision:3,hidden:false}).expect(200);
      assert.equal((await request(app).get('/api/reviews')).body.average,1);
    });

  } finally {await mongoose.disconnect();await replica.stop();}
});
