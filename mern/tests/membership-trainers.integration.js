import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { manualMonthTerm, membershipDate } from '../shared/membership-terms.js';
import { JOINT_TRAINER_ID } from '../shared/trainers.js';

test('backdated onboarding and actual two-trainer assignments persist atomically', {timeout:180000}, async t=>{
  const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
  process.env.NODE_ENV='test'; process.env.MONGODB_URI=replica.getUri();process.env.MONGODB_DB='membership_trainers';process.env.APP_ORIGIN='http://localhost:5173';delete process.env.STRIPE_SECRET_KEY;
  const {default:app}=await import('../server/client-services-app.js');
  const {connectDb}=await import('../server/db.js');
  const {User,Booking,Subscription,Session,Settings,Slot,TrainerSchedule,Notification,AuditEvent}=await import('../server/models.js');
  const {MemberAccess}=await import('../server/member-app.js');
  const {digest}=await import('../server/auth.js');
  const {getEntitlements,trainerCapacity,promoteTrainerWaitlist}=await import('../server/bookings.js');
  const {quote}=await import('../shared/catalog.js');
  const now=DateTime.now().setZone('America/Chicago'), date=now.plus({days:3}).toISODate();
  const people={},cookies={};let onboarded;
  try{
    await connectDb();await MemberAccess.init();
    for(const [key,name,role] of [['david','David Northrop','owner'],['ashley','Ashley Northrop','staff'],['admin','Janet','owner'],['client','Existing client','member'],['other','Other client','member']]){
      people[key]=await User.create({name,role,email:`${key}@example.test`,passwordHash:'isolated-fixture-not-used'});
      const token=randomBytes(32).toString('hex');await Session.create({tokenHash:digest(token),userId:people[key]._id,expiresAt:new Date(Date.now()+3600000)});cookies[key]=`bravo_session=${token}`;
    }
    const ids=[String(people.david._id),String(people.ashley._id)];
    const call=(who,method,path,body)=>{let r=request(app)[method](path).set('Origin',process.env.APP_ORIGIN);if(who)r=r.set('Cookie',cookies[who]);return body===undefined?r:r.send(body)};
    await Settings.updateOne({_id:'schedule'},{$set:{enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['10:00','11:00','13:00'],overrides:[]}});
    await t.test('only staff/admin/owner can create dated access; invalid input has no side effects',async()=>{
      const payload={name:'Added client',dogName:'Fixture dog',email:'blocked@example.test',membershipStartDate:'2026-01-01'};
      for(const who of [null,'client'])await call(who,'post','/api/admin/users',payload).expect(who?403:401);
      await call('david','post','/api/admin/users',{...payload,membershipStartDate:'2026-02-30'}).expect(400);
      assert.equal(await User.countDocuments({email:payload.email}),0);assert.equal(await Subscription.countDocuments(),0);
    });
    await t.test('historical month is exact and expired, with no Stripe charge or invented payment date',async()=>{
      const response=await call('admin','post','/api/admin/users',{name:'Historical client',dogName:'Fixture dog',email:'history@example.test',membershipStartDate:'2026-01-01',trainingDogCount:2,role:'owner'}).expect(201);
      const id=response.body.user.id;assert.equal(response.body.user.role,'member');assert.equal(response.body.membership.active,false);
      assert.equal(membershipDate(response.body.membership.validFrom),'2026-01-01');assert.equal(membershipDate(response.body.membership.validUntil),'2026-02-01');
      const term=await Subscription.findOne({userId:id,serviceIds:'training'});assert.equal(term.source,'grant');assert.equal(term.dogCount,2);assert.equal(term.autoPayDisabled,true);
      const b=await Booking.findOne({userId:id});assert.equal(b.paymentStatus,'covered');assert.equal(b.visits.length,0);assert.equal(b.paidAt,undefined);assert.equal((await User.findById(id)).firstPaidAt,undefined);assert.deepEqual((await getEntitlements(id)).services,[]);
      assert.ok(await AuditEvent.exists({targetId:id,action:'client.created'}));
      await call('admin','post','/api/admin/users',{name:'Duplicate',dogName:'Fixture dog',email:'history@example.test',membershipStartDate:'2026-01-01'}).expect(409);
      assert.equal(await Subscription.countDocuments({userId:id}),2);assert.equal(await Booking.countDocuments({userId:id}),1);
    });
    await t.test('blank start activates full membership today; future start does not activate access early',async()=>{
      const plain=await call('david','post','/api/admin/users',{name:'Account only',dogName:'Fixture dog',email:'plain@example.test',membershipStartDate:''}).expect(201);
      assert.equal(plain.body.membership.active,true);assert.equal(membershipDate(plain.body.membership.validFrom),now.toISODate());assert.equal(await Subscription.countDocuments({userId:plain.body.user.id}),2);
      const future=await call('david','post','/api/admin/users',{name:'Future client',dogName:'Fixture dog',email:'future@example.test',membershipStartDate:now.plus({months:2}).toISODate()}).expect(201);
      assert.equal(future.body.membership.active,false);assert.deepEqual((await getEntitlements(future.body.user.id)).services,[]);
    });
    await t.test('backdated current month gives only its remaining time and survives a fresh read',async()=>{
      const start=now.minus({days:5}).toISODate();
      const r=await call('david','post','/api/admin/users',{name:'Current client',dogName:'Fixture dog',email:'current@example.test',membershipStartDate:start,trainingDogCount:1}).expect(201);onboarded=r.body.user.id;
      assert.equal(r.body.membership.active,true);assert.deepEqual((await getEntitlements(onboarded)).services.sort(),['online','training']);
      const schedule=await call('david','get',`/api/client-schedule?client=${onboarded}&month=${date.slice(0,7)}`).expect(200);
      assert.equal(membershipDate(schedule.body.terms[0].validFrom),start);assert.equal(membershipDate(schedule.body.terms[0].validUntil),membershipDate(manualMonthTerm(start).validUntil));assert.equal(schedule.body.trainingBookings.length,1);
      const b=schedule.body.trainingBookings[0];
      await call('david','post','/api/client-schedule/changes',{bookingId:b._id,revision:b.updatedAt,additions:[{date,time:'13:00'}],removals:[],note:'Training month imported; appointment agreed.'}).expect(200);
      assert.ok(await Slot.exists({date: date, time: '13:00',bookingId:b._id}));
    });
    await t.test('membership date corrections cannot strand saved training visits',async()=>{
      const path=`/api/admin/memberships/${onboarded}`;
      await call('david','patch',path,{enabled:true,expectedRevision:1,startDate:now.toISODate()}).expect(200);
      assert.ok((await getEntitlements(onboarded)).services.includes('online'));
      await call('david','patch',path,{enabled:true,expectedRevision:2,startDate:'2026-01-01'}).expect(409);
      assert.deepEqual((await getEntitlements(onboarded)).services.sort(),['online','training']);
      assert.equal(await Subscription.countDocuments({userId:onboarded,serviceIds:'online',status:'active'}),1);
      await call('david','patch',path,{enabled:false,expectedRevision:2}).expect(200);
      assert.equal(await Subscription.countDocuments({userId:onboarded,serviceIds:'training',status:'active'}),1);
      await call('david','patch',path,{enabled:true,expectedRevision:2,startDate:now.toISODate()}).expect(409);
    });
    await t.test('third option is based on two real active accounts, not a dummy staff user',async()=>{
      const r=await call('client','get','/api/trainers').expect(200);
      assert.deepEqual(r.body.trainers.slice(0,3).map(p=>p.name),['David Northrop','Ashley Northrop','David and Ashley']);assert.deepEqual(r.body.trainers[2].staffIds,ids);
      await User.updateOne({_id:people.ashley._id},{$set:{blocked:true}});
      const missing=await call('client','get','/api/trainers').expect(200);assert.equal(missing.body.trainers.find(p=>p.id===JOINT_TRAINER_ID).disabled,true);
      await call('david','get',`/api/availability?from=${date}&to=${date}&staffId=${JOINT_TRAINER_ID}`).expect(409);
      await User.updateOne({_id:people.ashley._id},{$set:{blocked:false}});
      assert.equal(await User.countDocuments(),9);
    });
    await t.test('joint availability intersects both work schedules, and booking honors either closure',async()=>{
      await TrainerSchedule.create({_id:people.david._id,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['10:00','11:00'],overrides:[]});
      await TrainerSchedule.create({_id:people.ashley._id,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['11:00'],overrides:[]});
      const r=await call('client','get',`/api/availability?from=${date}&to=${date}&staffId=${JOINT_TRAINER_ID}`).expect(200);assert.deepEqual(r.body.days[0].slots,['11:00']);
      const body={requestKey:randomUUID(),serviceIds:['training'],dogCount:1,dogName:'Joint dog',phone:'6055550100',address:'Isolated test address',preferredTrainerId:JOINT_TRAINER_ID,visits:[{date,time:'10:00',service:'training'}]};
      await call('client','post','/api/bookings',body).expect(409);assert.equal(await Booking.countDocuments({requestKey:body.requestKey}),0);
      const made=await call('client','post','/api/bookings',{...body,visits:[{date,time:'11:00',service:'training'}]}).expect(201);
      const b=await Booking.findById(made.body.booking._id);assert.deepEqual(b.staffIds.map(String),ids);assert.equal(String(b.staffId),ids[0]);assert.equal(b.trainerAcceptanceRequired,true);
      for(const trainer of ids)assert.equal((await trainerCapacity(trainer)).activeDogs,1);
    });
    await t.test('both trainers see the client; one accepts only for herself; owner can accept for both',async()=>{
      let b=await Booking.findOne({userId:people.client._id});await Booking.updateOne({_id:b._id},{$set:{paymentStatus:'covered'}});b=await Booking.findById(b._id);
      const endpoint=`/api/admin/bookings/${b._id}/accept-client`,feed=`/api/client-schedule?month=${date.slice(0,7)}`;
      for(const key of ['david','ashley'])assert.equal((await call(key,'get',`/api/admin/trainers/${people[key]._id}/clients`).expect(200)).body.bookings.some(row=>row._id===String(b._id)),true);
      await call('ashley','post',endpoint,{staffId:JOINT_TRAINER_ID,revision:b.updatedAt.toISOString()}).expect(403);
      await call('ashley','post',endpoint,{staffId:ids[1],revision:b.updatedAt.toISOString()}).expect(200);
      b=await Booking.findById(b._id);assert.equal(b.trainerAcceptanceRequired,true);assert.deepEqual(b.trainerAcceptedIds.map(String),[ids[1]]);
      const pending=await call('client','get',feed).expect(200);assert.equal(pending.body.visits[0].trainer,'Awaiting acceptance from David Northrop');
      await call('david','post',endpoint,{staffId:ids[0],revision:b.updatedAt.toISOString()}).expect(200);
      b=await Booking.findById(b._id);assert.equal(b.trainerAcceptanceRequired,false);assert.ok(b.trainerAcceptedAt);
      const accepted=await call('client','get',feed).expect(200);assert.equal(accepted.body.visits[0].trainer,'David and Ashley');assert.equal(accepted.body.visits[0].trainerChoice,JOINT_TRAINER_ID);
      const count=await Notification.countDocuments({_id:new RegExp(`^trainer:${b._id}:`)});
      await call('ashley','post',endpoint,{staffId:ids[1],revision:b.updatedAt.toISOString()}).expect(200);assert.equal(await Notification.countDocuments({_id:new RegExp(`^trainer:${b._id}:`)}),count);
      await call('admin','patch',`/api/admin/bookings/${b._id}/assignment`,{staffId:JOINT_TRAINER_ID}).expect(200);b=await Booking.findById(b._id);
      await call('admin','post',endpoint,{staffId:JOINT_TRAINER_ID,revision:b.updatedAt.toISOString()}).expect(200);assert.equal((await Booking.findById(b._id)).trainerAcceptanceRequired,false);
      // Secondary trainer must not close hours containing a joint booking.
      await call('ashley','put',`/api/admin/trainer-schedules/${ids[1]}`,{revision:0,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['10:00'],overrides:[]}).expect(409);
    });
    await t.test('either trainer at capacity waitlists the whole pair without reserving a slot',async()=>{
      const full=await Booking.create({userId:people.other._id,requestKey:randomUUID(),serviceIds:['training'],dogCount:4,staffId:people.ashley._id,status:'confirmed',visits:[],quote:quote(['training'])});
      const tomorrow=now.plus({days:4}).toISODate();
      const r=await call('admin','post','/api/admin/bookings',{requestKey:randomUUID(),userId:onboarded,staffId:JOINT_TRAINER_ID,serviceIds:['training'],dogCount:1,dogName:'Waiting dog',phone:'6055550100',address:'Isolated test address',visits:[{date:tomorrow,time:'11:00',service:'training'}]}).expect(201);
      const b=r.body.booking;assert.equal(b.status,'waitlisted');assert.deepEqual(b.requestedStaffIds,ids);assert.deepEqual(b.staffIds,[]);assert.equal(await Slot.exists({date: tomorrow, time: '11:00'}),null);
      await call('admin','post',`/api/admin/bookings/${b._id}/accept-client`,{staffId:JOINT_TRAINER_ID,revision:b.updatedAt}).expect(409);
      await Booking.deleteOne({_id:full._id});
      await promoteTrainerWaitlist(ids[1]);
      const promoted=await Booking.findById(b._id);
      assert.equal(promoted.status,'requested');assert.deepEqual(promoted.staffIds.map(String),ids);
      assert.equal(promoted.trainerAcceptanceRequired,true);
      assert.ok(await Slot.exists({date: tomorrow, time: '11:00',bookingId:b._id}));
    });
  }finally{await mongoose.disconnect();await replica.stop()}
});
