// Isolated disposable MongoDB only. No production accounts or payments are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

test('personal schedule publish is public-safe, durable, isolated, and respected by bookings', {timeout:180000}, async t => {
  const replica = await MongoMemoryReplSet.create({replSet:{count:1},binary:{version:'8.0.5'}});
  process.env.NODE_ENV='test'; process.env.MONGODB_URI=replica.getUri(); process.env.MONGODB_DB='trainer_schedule_test'; process.env.APP_ORIGIN='http://localhost:5173'; delete process.env.STRIPE_SECRET_KEY;
  try {
    const {default:app}=await import('../server/app.js');
    const {connectDb}=await import('../server/db.js');
    const {User,Session,Settings,TrainerSchedule,Booking,Slot,AuditEvent}=await import('../server/models.js');
    const {dateTime,ZONE}=await import('../server/scheduling.js'); const {DateTime}=await import('luxon');
    await connectDb();
    await Settings.updateOne({_id:'schedule'},{$set:{enabled:true,weekdays:[1,2,3,4,5],hours:['09:00','10:00','11:00'],revision:0}});
    const users={},cookies={};
    for (const [name,role] of Object.entries({owner:'owner',alice:'staff',bob:'staff',client:'member'})) {
      users[name]=await User.create({name:`Private ${name}`,email:`${name}@private.example`,role,passwordHash:'test-only',phone:'PRIVATE_PHONE',address:'PRIVATE_ADDRESS'});
      const token=randomBytes(32).toString('hex'); await Session.create({userId:users[name]._id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}); cookies[name]=`bravo_session=${token}`;
    }
    const id=name=>String(users[name]._id);
    const call=(who,method,path,body)=>{let req=request(app)[method](path).set('Origin',process.env.APP_ORIGIN);if(who)req=req.set('Cookie',cookies[who]);return body===undefined?req:req.send(body);};
    const endpoint=name=>`/api/admin/trainer-schedules/${id(name)}`;
    const pub=()=>call(null,'get','/api/team/schedules').expect(200);
    let monday=DateTime.now().setZone(ZONE).plus({days:1}).startOf('day');while(monday.weekday!==1)monday=monday.plus({days:1});
    const mon=monday.toISODate(),tue=monday.plus({days:1}).toISODate();
    let draft={enabled:true,weekdays:[1,2,3,4,5],hours:['09:00','10:00'],overrides:[],revision:0};
    const publish=async(changes={},who='alice',trainer='alice')=>{const result=await call(who,'put',endpoint(trainer),{...draft,...changes}).expect(200);draft=result.body.schedule;return result;};
    const day=(result,who,date)=>result.body.schedules.find(row=>row.staffId===id(who)).days.find(day=>day.date===date);
    await t.test('only trainer or administrator can edit; request fields are validated',async()=>{
      await call(null,'get',endpoint('alice')).expect(401);await call('client','get',endpoint('alice')).expect(403);await call('alice','get',endpoint('bob')).expect(403);
      await call('alice','put',endpoint('bob'),draft).expect(403);await call('owner','get',endpoint('bob')).expect(200);
      await call('alice','put',endpoint('alice'),{...draft,privateReason:'must not publish'}).expect(400);
      await call('alice','put',endpoint('alice'),{...draft,weekdays:[8]}).expect(400);
      await call('alice','put',endpoint('alice'),{...draft,overrides:[{date:'2026-02-30',hours:[]}]}).expect(400);
      assert.equal(await TrainerSchedule.countDocuments(),0);
    });
    await t.test('own days off publish without changing another trainer or shared hours',async()=>{
      await publish({overrides:[{date:mon,hours:[]}]});
      for(let i=0;i<2;i++) {const result=await pub();assert.deepEqual(day(result,'alice',mon).hours,[]);assert.equal(day(result,'bob',mon).hours.length,3);assert.match(result.headers['cache-control'],/no-store/);assert.equal(result.body.timezone,ZONE);}
      const settings=await Settings.findById('schedule').lean();assert.deepEqual(settings.weekdays,[1,2,3,4,5]);
      const feed=JSON.stringify((await pub()).body);for(const secret of ['PRIVATE_PHONE','PRIVATE_ADDRESS','private.example','Private alice'])assert.ok(!feed.includes(secret));
      assert.equal((await call('alice','get',endpoint('alice')).expect(200)).body.schedule.overrides[0].date,mon);
      await call('alice','put',endpoint('alice'),{...draft,revision:0}).expect(409);
    });
    await t.test('chosen-trainer calendar and direct requests honor days off',async()=>{
      const result=await call('client','get',`/api/availability?from=${mon}&to=${mon}&staffId=${id('alice')}`).expect(200);assert.deepEqual(result.body.days[0].slots,[]);
      const body={requestKey:randomUUID(),serviceIds:['training'],preferredTrainerId:id('alice'),dogName:'Fixture Dog',phone:'6055550100',address:'Private customer address',visits:[{date:mon,time:'09:00',service:'training'}]};
      await call('client','post','/api/bookings',body).expect(409);assert.equal(await Booking.countDocuments(),0);
      await publish({overrides:[]});
      assert.deepEqual((await call('client','get',`/api/availability?from=${mon}&to=${mon}&staffId=${id('alice')}`).expect(200)).body.days[0].slots,['09:00','10:00']);
      await call('client','post','/api/bookings',{...body,requestKey:randomUUID()}).expect(201);
      assert.equal(await Booking.countDocuments(),1);
    });
    await t.test('existing visits cannot be silently cancelled by publishing time off',async()=>{
      await call('alice','put',endpoint('alice'),{...draft,overrides:[{date:mon,hours:[]}]}).expect(409);
      assert.equal((await TrainerSchedule.findById(id('alice'))).revision,draft.revision);
      const booking=await Booking.findOne().lean();assert.equal(booking.status,'requested');assert.equal(await Slot.countDocuments({bookingId:booking._id}),1);
      await publish({overrides:[{date:tue,hours:[]}]});
      await call('client','patch',`/api/bookings/${booking._id}/visits`,{visits:[{date:tue,time:'09:00',service:'training'}]}).expect(409);
      await call('owner','put',endpoint('bob'),{enabled:true,weekdays:[1,2,3,4,5],hours:['09:00'],overrides:[{date:mon,hours:[]}],revision:0}).expect(200);
      await call('owner','patch',`/api/admin/bookings/${booking._id}/assignment`,{staffId:id('bob')}).expect(409);
    });
    await t.test('extra working days and shared time off reflect safely in the public feed',async()=>{
      await publish({weekdays:[1],overrides:[{date:tue,hours:['10:00']}]});
      assert.deepEqual(day(await pub(),'alice',tue).hours,['10:00']);
      await Slot.create({_id:`${tue}|10:00`,date:tue,time:'10:00',reason:'PRIVATE_TIME_OFF_REASON'});
      const result=await pub();assert.deepEqual(day(result,'alice',tue).hours,[]);assert.ok(!JSON.stringify(result.body).includes('PRIVATE_TIME_OFF_REASON'));
      await Slot.deleteOne({_id:`${tue}|10:00`});assert.deepEqual(day(await pub(),'alice',tue).hours,['10:00']);
      assert.ok(await AuditEvent.countDocuments({action:'trainer.schedule.published'})>=4);
      await User.updateOne({_id:id('bob')},{$set:{blocked:true}});assert.ok(!(await pub()).body.schedules.some(row=>row.staffId===id('bob')));
    });
  } finally {await mongoose.disconnect();await replica.stop();}
});
