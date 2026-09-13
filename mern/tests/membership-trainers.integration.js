import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { SHARED_TRAINER_ID } from '../shared/trainer-selection.js';

test('backdated onboarding, grant edits and shared trainers use isolated records only', {timeout:180000}, async t => {
  const replica=await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'7.0.14'}});
  process.env.NODE_ENV='test';process.env.MONGODB_URI=replica.getUri();process.env.MONGODB_DB='membership_trainers_test';process.env.APP_ORIGIN='http://localhost:5173';process.env.OWNER_USER_ID=new mongoose.Types.ObjectId().toString();
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const {default:app}=await import('../server/client-services-app.js');
    const {connectDb}=await import('../server/db.js');
    const {User,Session,Subscription,Booking,TrainerSchedule,Settings,Slot}=await import('../server/models.js');
    const {MemberAccess,manualGrantTerm}=await import('../server/member-grants.js');
    const {getEntitlements,trainerCapacity,assignTrainer}=await import('../server/bookings.js');
    const {digest}=await import('../server/auth.js');
    await connectDb();await MemberAccess.init();
    const users={},cookies={};
    for(const [key,name,role] of [['david','David Northrop','owner'],['ashley','Ashley Northrop','staff'],['other','Another Trainer','staff'],['client','Fixture Client','member'],['waiting','Waiting Client','member']]) {
      users[key]=await User.create({...(key==='david'?{_id:process.env.OWNER_USER_ID}:{}),name,role,email:`${key}@example.test`,passwordHash:'fixture-only'});
      const token=randomBytes(32).toString('hex');await Session.create({userId:users[key]._id,tokenHash:digest(token),expiresAt:new Date(Date.now()+3600000)});cookies[key]=`bravo_session=${token}`;
    }
    const call=(who,method,path,body)=>{let req=request(app)[method](path).set('Origin',process.env.APP_ORIGIN);if(who)req=req.set('Cookie',cookies[who]);return body===undefined?req:req.send(body)};
    const grant=(who,startDate,serviceIds=['training'])=>call('david','patch',`/api/admin/memberships/${users[who]._id}`,{enabled:true,expectedRevision:0,startDate,serviceIds,dogCount:1});
    const today=DateTime.now().setZone('America/Chicago').toISODate(),date=DateTime.now().setZone('America/Chicago').plus({days:2}).toISODate();
    let booking;
    await t.test('onboarding backdated full months does not restart access today or fabricate payments',async()=>{
      const r=await call('david','post','/api/admin/users',{name:'Past Client',email:'past@example.test',membership:{startDate:'2026-01-01',serviceIds:['training'],dogCount:2}}).expect(201);
      assert.equal(r.body.membership.manual,false);assert.equal(r.body.user.role,'member');
      const term=await Subscription.findOne({userId:r.body.user.id}).lean();
      assert.equal(DateTime.fromJSDate(term.validFrom,{zone:'America/Chicago'}).toISODate(),'2026-01-01');assert.equal(DateTime.fromJSDate(term.validUntil,{zone:'America/Chicago'}).toISODate(),'2026-02-01');
      assert.equal(term.source,'grant');assert.equal(term.dogCount,2);assert.equal((await User.findById(r.body.user.id)).firstPaidAt,undefined);assert.equal(await Booking.countDocuments({userId:r.body.user.id}),0);
      await call('david','post','/api/admin/users',{name:'Invalid Client',email:'invalid@example.test',membership:{startDate:'2026-02-30'}}).expect(400);
      assert.equal(await User.countDocuments({email:'invalid@example.test'}),0);
      await call('ashley','post','/api/admin/users',{name:'Unauthorized',email:'unauth@example.test',membership:{startDate:today}}).expect(403);
      await call('david','post','/api/admin/users',{name:'Future Client',email:'future@example.test',membership:{startDate:'2090-01-01',serviceIds:['online']}}).expect(201);
      const future=await User.findOne({email:'future@example.test'});assert.deepEqual((await getEntitlements(future._id)).services,[]);
    });
    await t.test('grant edits replace only manual access and honor timezone, services and stale revisions',async()=>{
      await Subscription.create({userId:users.client._id,stripeId:'sub_untouched_fixture',source:'stripe',serviceIds:['online'],status:'active',validUntil:new Date(Date.now()+86400000)});
      const before=await Subscription.findOne({stripeId:'sub_untouched_fixture'}).lean();
      await grant('client',today).expect(200);
      const me=await call('client','get','/api/auth/me').expect(200);assert.ok(me.body.services.includes('training'));
      await call('david','patch',`/api/admin/memberships/${users.client._id}`,{enabled:true,expectedRevision:0,startDate:today}).expect(409);
      await call('david','patch',`/api/admin/memberships/${users.client._id}`,{enabled:true,expectedRevision:1,startDate:today,serviceIds:['training'],dogCount:1}).expect(200);
      assert.equal(await Subscription.countDocuments({userId:users.client._id,source:'grant',status:'active'}),1);
      assert.deepEqual(await Subscription.findOne({stripeId:'sub_untouched_fixture'}).lean(),before);
      const dst=manualGrantTerm('2026-03-01');assert.equal(dst.validFrom.toISOString(),'2026-03-01T06:00:00.000Z');assert.equal(dst.validUntil.toISOString(),'2026-04-01T05:00:00.000Z');
    });
    await t.test('shared selection intersects both working schedules and persists both actual trainer IDs',async()=>{
      await Settings.updateOne({_id:'schedule'},{$set:{enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['10:00','11:00']}});
      await TrainerSchedule.create({_id:users.ashley._id,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['11:00']});
      const roster=await call('client','get','/api/trainers').expect(200);assert.equal(roster.body.trainers.at(-1).id,SHARED_TRAINER_ID);assert.equal(roster.body.trainers.at(-1).unavailable,undefined);
      const available=await call('client','get',`/api/availability?from=${date}&to=${date}&staffId=${SHARED_TRAINER_ID}`).expect(200);assert.deepEqual(available.body.days[0].slots,['11:00']);
      const payload={requestKey:randomUUID(),preferredTrainerId:SHARED_TRAINER_ID,serviceIds:['training'],visits:[{date,time:'11:00',service:'training'}],dogCount:1,dogName:'Fixture Dog',phone:'6055550100',address:'123 Test Street'};
      const r=await call('client','post','/api/bookings',payload).expect(201);booking=r.body.booking;
      assert.equal(booking.staffId,String(users.david._id));assert.equal(booking.coTrainerId,String(users.ashley._id));assert.equal(booking.paymentStatus,'covered');
      assert.equal((await trainerCapacity(users.david._id)).activeDogs,1);assert.equal((await trainerCapacity(users.ashley._id)).activeDogs,1);
      for(const who of ['david','ashley']) {const list=await call(who,'get',`/api/admin/trainers/${users[who]._id}/clients`).expect(200);assert.ok(list.body.bookings.some(b=>b._id===booking._id));}
      await call('other','post',`/api/admin/bookings/${booking._id}/accept-client`,{staffId:String(users.ashley._id),revision:booking.updatedAt}).expect(403);
    });
    await t.test('separate acceptances preserve the pair, reject stale saves and display both names to the client',async()=>{
      const first=await call('ashley','post',`/api/admin/bookings/${booking._id}/accept-client`,{staffId:String(users.ashley._id),revision:booking.updatedAt}).expect(200);
      assert.equal(first.body.booking.coTrainerId,String(users.ashley._id));assert.equal(first.body.booking.trainerAcceptanceRequired,true);
      await call('david','post',`/api/admin/bookings/${booking._id}/accept-client`,{staffId:String(users.david._id),revision:booking.updatedAt}).expect(409);
      const second=await call('david','post',`/api/admin/bookings/${booking._id}/accept-client`,{staffId:String(users.david._id),revision:first.body.booking.updatedAt}).expect(200);
      assert.equal(second.body.booking.trainerAcceptanceRequired,false);assert.equal(second.body.booking.trainerAcceptedIds.length,2);
      const schedule=await call('client','get',`/api/client-schedule?month=${date.slice(0,7)}`).expect(200);assert.equal(schedule.body.visits[0].trainer,'David and Ashley');assert.equal(schedule.body.trainingBookings[0].coTrainerId,String(users.ashley._id));
      // Saved visits prevent either member from silently closing their working day.
      const s=await TrainerSchedule.findById(users.ashley._id);
      await call('ashley','put',`/api/admin/trainer-schedules/${users.ashley._id}`,{revision:s.revision,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['10:00'],overrides:[]}).expect(409);
    });
    await t.test('full co-trainer waitlists the pair and cannot be bypassed through an owner assignment',async()=>{
      await Booking.create({userId:users.other._id,requestKey:'capacity-fixture',staffId:users.ashley._id,serviceIds:['training'],dogCount:4,status:'confirmed',paymentStatus:'covered',visits:[]});
      await grant('waiting',today).expect(200);
      const nextDate=DateTime.fromISO(date).plus({days:1}).toISODate();
      const r=await call('waiting','post','/api/bookings',{requestKey:randomUUID(),preferredTrainerId:SHARED_TRAINER_ID,serviceIds:['training'],visits:[{date:nextDate,time:'11:00',service:'training'}],dogName:'Wait Dog',phone:'6055550100',address:'123 Test Street'}).expect(201);
      assert.equal(r.body.booking.status,'waitlisted');assert.equal(r.body.booking.requestedCoTrainerId,String(users.ashley._id));assert.equal(await Slot.countDocuments({bookingId:r.body.booking._id}),0);
      await call('david','patch',`/api/admin/bookings/${r.body.booking._id}/assignment`,{staffId:SHARED_TRAINER_ID}).expect(409);
    });
    await t.test('missing or client-level Ashley never creates a phantom trainer or grants employee permissions',async()=>{
      await User.updateOne({_id:users.ashley._id},{$set:{role:'member'}});
      const roster=await call('client','get','/api/trainers').expect(200);assert.equal(roster.body.trainers.at(-1).unavailable,true);
      await call('client','get',`/api/availability?from=${date}&to=${date}&staffId=${SHARED_TRAINER_ID}`).expect(400);
      assert.equal((await User.findById(users.ashley._id)).role,'member');
    });
  } finally {await mongoose.disconnect();await replica.stop();}
});
