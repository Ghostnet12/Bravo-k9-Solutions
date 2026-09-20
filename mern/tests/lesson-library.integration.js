import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('lesson studio, closed-library boundaries and paid access', {timeout:180000}, async t=>{
 const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
 process.env.NODE_ENV='test';process.env.MONGODB_URI=replica.getUri();process.env.MONGODB_DB='lesson_library_test';process.env.APP_ORIGIN='http://localhost:5173';delete process.env.STRIPE_SECRET_KEY;
 try {
  const {default:app}=await import('../server/client-services-app.js');
  const {connectDb}=await import('../server/db.js');
  const {User,Session,Lesson,LessonLibrary,LessonSection,Subscription,Booking}=await import('../server/models.js');
  const {digest}=await import('../server/auth.js');
  const {quote}=await import('../shared/catalog.js');
  const {checkout,processStripeEvent}=await import('../server/payments.js');
  const {getEntitlements}=await import('../server/bookings.js');
  const {expireLessonCheckouts}=await import('../server/lesson-library.js');
  await connectDb();const users={},cookies={};
  for(const [name,role]of Object.entries({owner:'owner',admin:'owner',staff:'staff',client:'member',paid:'member'})){users[name]=await User.create({name,role,passwordHash:'fixture-only',stripeCustomerId:name==='paid'?'cus_fixture_paid':undefined});const token=randomBytes(32).toString('hex');await Session.create({tokenHash:digest(token),userId:users[name]._id,expiresAt:new Date(Date.now()+3600000)});cookies[name]=`bravo_session=${token}`;}
  const call=(who,method,path,body)=>{let r=request(app)[method](path).set('Origin',process.env.APP_ORIGIN);if(who)r=r.set('Cookie',cookies[who]);return body===undefined?r:r.send(body);};
  const setOpen=async open=>{const current=(await call('owner','get','/api/admin/lesson-library').expect(200)).body.library;return call('owner','put','/api/admin/lesson-library',{open,expectedRevision:current.revision});};
  let section;
  const base={title:'Read your dog',description:'Learn the signals.',category:'Behavior',instructor:'David and Ashley',image:'/images/training-education.webp',transcript:'Watch the posture and give your dog space.',format:'text',published:false};
  await t.test('default closed: no public catalog, paid media or purchase; owner and administrator can prepare',async()=>{
   const oldCheckout=await Booking.create({userId:users.client._id,serviceIds:['online'],paymentStatus:'unpaid',stripeSessionId:'cs_before_deployment',checkoutExpiresAt:new Date(Date.now()+1800000)});
   const config=(await call(null,'get','/api/config').expect(200)).body;assert.equal(config.lessonLibrary.open,false);assert.equal(config.lessonLibrary.pendingCheckouts,1,'initial closed mode reconciles pre-deployment checkout links');assert.ok((await LessonLibrary.findById('library')).cleanupAfter);
   let expired=false;await expireLessonCheckouts({checkout:{sessions:{retrieve:async()=>({id:'cs_before_deployment',status:'open'}),expire:async()=>{expired=true;}}}});assert.equal(expired,true);await Booking.deleteOne({_id:oldCheckout._id});assert.equal(config.services.find(s=>s.id==='online').cents,7500);assert.equal(config.services.find(s=>s.id==='online').enabled,false);
   for(const who of [null,'client','paid','staff'])await call(who,'get','/api/lessons').expect(404);
   for(const who of ['owner','admin'])await call(who,'get','/api/admin/lessons').expect(200);
   for(const who of ['client','staff'])await call(who,'get','/api/admin/lessons').expect(403);
   for(const who of ['client','staff'])await call(who,'put','/api/admin/lesson-library',{open:true,expectedRevision:0}).expect(403);
   await request(app).put('/api/admin/lesson-library').set('Cookie',cookies.owner).set('Origin','https://evil.example').send({open:true,expectedRevision:0}).expect(403);
   await setOpen(true).then(r=>assert.equal(r.status,400));
   await call('client','post','/api/bookings',{requestKey:randomUUID(),serviceIds:['online'],visits:[],dogName:'Dog',phone:'6055550100',address:''}).expect(400);
  });
  await t.test('sections, descriptions and instructor choices save privately',async()=>{
   await call('admin','post','/api/admin/lesson-sections',{title:'Private future section',description:'Unreleased curriculum',order:9}).expect(201);
   section=(await call('admin','post','/api/admin/lesson-sections',{title:'Foundations',description:'Start here',order:1}).expect(201)).body.section;
   await call('owner','put','/api/admin/lessons/body-language',{...base,sectionId:section._id}).expect(200);
   await call('staff','put','/api/admin/lessons/body-language',base).expect(403);
   await call('owner','put','/api/admin/lessons/unknown-instructor',{...base,instructor:'Invented'}).expect(400);
   await call('owner','put','/api/admin/lessons/unknown-section',{...base,sectionId:'missing'}).expect(400);
   await call('owner','get','/api/lessons/body-language/transcript').expect(200);
   await call('paid','get','/api/lessons/body-language/transcript').expect(404);
   await call('owner','delete',`/api/admin/lesson-sections/${section._id}`,{}).expect(400);
   await call('owner','put',`/api/admin/lesson-sections/${section._id}`,{title:'Everyday foundations',description:'Understand your dog',order:2}).expect(200);
   assert.equal((await LessonSection.findById(section._id)).title,'Everyday foundations');
   await call('owner','put','/api/admin/lessons/body-language',{...base,sectionId:section._id,published:true}).expect(200);
   const saved=await Lesson.findById('body-language');assert.equal(saved.instructor,'David and Ashley');assert.equal(saved.description,base.description);
  });
  async function upload(lessonId,kind,data,contentType){const result=await call('admin','post','/api/admin/media/start',{lessonId,kind,filename:`fixture.${kind==='captions'?'vtt':kind==='video'?'mp4':'png'}`,contentType,size:data.length,chunks:1}).expect(201);await call('admin','put',`/api/admin/media/${result.body.uploadId}/chunks/0`,{data:data.toString('base64')}).expect(200);await call('admin','post',`/api/admin/media/${result.body.uploadId}/complete`,{}).expect(200);}
  await t.test('photo lessons and thumbnails are separate and private while closed',async()=>{
   const photo={...base,format:'photo',instructor:'Ashley Northrop',photoAlt:'A relaxed dog',published:false};
   await call('owner','put','/api/admin/lessons/photo-demo',photo).expect(200);
   await call('owner','put','/api/admin/lessons/photo-demo',{...photo,published:true}).expect(400);
   const png=Buffer.from('89504e470d0a1a0a00000000','hex');await upload('photo-demo','photo',png,'image/png');await upload('photo-demo','image',png,'image/png');
   await call('owner','put','/api/admin/lessons/photo-demo',{...photo,image:'/api/lessons/photo-demo/image',published:true}).expect(200);
   for(const type of ['photo','image']){await call('owner','get',`/api/lessons/photo-demo/${type}`).expect(200);await call('paid','get',`/api/lessons/photo-demo/${type}`).expect(404);}
  });
  await t.test('video lessons require captions and transcript and remain range protected',async()=>{
   const video={...base,format:'video',instructor:'David Northrop'};await call('owner','put','/api/admin/lessons/video-demo',video).expect(200);
   await upload('video-demo','video',Buffer.from('00000018667479706d703432000000006d70343269736f6d','hex'),'video/mp4');
   await call('owner','put','/api/admin/lessons/video-demo',{...video,published:true}).expect(400);
   await upload('video-demo','captions',Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nA relaxed dog\n'),'text/vtt');
   await call('owner','put','/api/admin/lessons/video-demo',{...video,published:true}).expect(200);
   await call('owner','get','/api/lessons/video-demo/video').set('Range','bytes=0-7').expect(206);
  });
  await t.test('opening exposes published descriptions only; payment unlocks content for one month',async()=>{
   const opened=await setOpen(true);assert.equal(opened.status,200);
   await call('owner','put','/api/admin/lesson-library',{open:false,expectedRevision:0}).expect(409);
   await call('owner','put','/api/admin/lessons/draft-only',base).expect(200);
   const catalog=(await call(null,'get','/api/lessons').expect(200)).body;assert.equal(catalog.lessons.length,3);assert.equal(catalog.sections[0].title,'Everyday foundations');assert.equal(catalog.sections.length,1,'unpublished sections stay private');assert.ok(catalog.lessons.every(l=>!l.transcript&&!l.videoUpload&&!l.photoUpload));
   await call('client','get','/api/lessons/body-language/transcript').expect(403);
   await call('client','get','/api/lessons/photo-demo/photo').expect(403);
   const booking=(await call('paid','post','/api/bookings',{requestKey:randomUUID(),serviceIds:['online'],visits:[],dogName:'Dog',phone:'6055550100',address:''}).expect(201)).body.booking;assert.equal(booking.quote.dueNowCents,7500);
   const event={id:'evt_lesson_paid',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),data:{object:{id:'cs_lesson_paid',mode:'payment',payment_status:'paid',currency:'usd',amount_total:7500,customer:'cus_fixture_paid',client_reference_id:String(booking._id),metadata:{app:'bravo-k9',billing:'manual-month-v1',userId:String(users.paid._id),bookingId:String(booking._id)}}}};
   await processStripeEvent(event,{});await processStripeEvent(event,{});assert.equal(await Subscription.countDocuments({userId:users.paid._id}),1);assert.ok((await getEntitlements(users.paid._id)).services.includes('online'));
   for(const path of ['body-language/transcript','photo-demo/photo','video-demo/video','video-demo/captions'])await call('paid','get','/api/lessons/'+path).expect(200);
   await call('paid','get','/api/lessons/draft-only/transcript').expect(404);
  });
  await t.test('bundle prices include dog coverage and Stripe uses exact server totals',async()=>{
   assert.equal(quote(['online']).monthlyCents,7500);assert.equal(quote(['training','online']).monthlyCents,25000);assert.equal(quote(['training','online'],[],{dogCount:3}).monthlyCents,45000);
   const booking=await Booking.create({userId:users.client._id,status:'requested',paymentStatus:'unpaid',serviceIds:['training','online'],dogCount:2,quote:quote(['training','online'],[],{dogCount:2})});
   users.client.stripeCustomerId='cus_fixture_client';await users.client.save();let params;
   const stripe={checkout:{sessions:{create:async input=>{params=input;return{id:'cs_bundle',url:'https://checkout.stripe.test/fixture',expires_at:Math.floor(Date.now()/1000)+1800};}}}};
   await checkout(booking,users.client,stripe);assert.equal(params.mode,'payment');assert.equal(params.line_items.reduce((n,l)=>n+l.quantity*l.price_data.unit_amount,0),35000);assert.equal(params.metadata.serviceIds,'["training","online"]');assert.ok(params.line_items.every(l=>!l.price_data.recurring));
  });
  await t.test('closing blocks stale purchases and paid content without deleting lessons or memberships',async()=>{
   const closed=await setOpen(false);assert.equal(closed.status,200);assert.equal(closed.body.pendingCheckouts,1,'unavailable Stripe expiration is reported');
   for(const who of [null,'client','paid','staff'])await call(who,'get','/api/lessons').expect(404);
   for(const path of ['body-language/transcript','photo-demo/photo','photo-demo/image','video-demo/video','video-demo/captions'])await call('paid','get','/api/lessons/'+path).expect(404);
   await call('admin','get','/api/lessons/body-language/transcript').expect(200);
   const stale=await Booking.findOne({stripeSessionId:'cs_bundle'});await assert.rejects(checkout(stale,users.client,{}),/closed/);
   assert.equal(await Lesson.countDocuments(),4);assert.equal(await Subscription.countDocuments({userId:users.paid._id}),1);
   const reopened=await setOpen(true);assert.equal(reopened.status,200);await call('paid','get','/api/lessons/body-language/transcript').expect(200);
   await Subscription.updateMany({userId:users.paid._id},{$set:{validUntil:new Date(Date.now()-1000)}});await call('paid','get','/api/lessons/body-language/transcript').expect(403);
  });
 }finally{await mongoose.disconnect();await replica.stop();}
});
