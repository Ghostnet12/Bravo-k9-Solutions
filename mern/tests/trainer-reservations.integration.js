import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { JOINT_TRAINER_ID } from '../shared/trainers.js';

test('manual members and independent trainer reservations share one consistent calendar', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'trainer_reservations'; process.env.APP_ORIGIN = 'http://localhost:5173'; delete process.env.STRIPE_SECRET_KEY;
  try {
    const { default: app } = await import('../server/client-services-app.js');
    const { connectDb } = await import('../server/db.js');
    const { User, Booking, Subscription, Session, Settings, Slot, TrainerSchedule, AuditEvent } = await import('../server/models.js');
    const { MemberAccess } = await import('../server/member-app.js');
    const { digest } = await import('../server/auth.js');
    await connectDb(); await MemberAccess.init();
    const now = DateTime.now().setZone('America/Chicago'), date = now.plus({ days: 3 }).toISODate(), nextDate = now.plus({ days: 4 }).toISODate();
    const users = {}, cookies = {};
    for (const [key, name, role] of [['david', 'David Northrop', 'owner'], ['ashley', 'Ashley Northrop', 'staff'], ['clientD', 'David client', 'member'], ['clientA', 'Ashley client', 'member'], ['other', 'Other client', 'member'], ['joint', 'Joint client', 'member']]) {
      users[key] = await User.create({ name, role, email: `${key.toLowerCase()}@example.test`, passwordHash: 'fixture-only', dogName: 'Fixture dog', phone: '6055550100', address: 'Fixture address' });
      const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId: users[key]._id, expiresAt: new Date(Date.now() + 3600000) }); cookies[key] = `bravo_session=${token}`;
    }
    const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
    await Settings.updateOne({ _id: 'schedule' }, { $set: { enabled: true, weekdays: [1,2,3,4,5,6,7], hours: ['09:00','10:00','11:00','12:00','13:00','14:00'], overrides: [] } });
    for (const key of ['david', 'ashley']) await TrainerSchedule.create({ _id: String(users[key]._id), enabled: true, weekdays: [1,2,3,4,5,6,7], hours: ['09:00','10:00','11:00','12:00','13:00','14:00'], overrides: [] });
    const bookings = {};
    await t.test('account creation grants free membership; Make Member also covers existing clients', async () => {
      const created = await call('david', 'post', '/api/admin/users', { name: 'Manually added', dogName: 'Fixture dog', email: 'manual@example.test', membershipStartDate: '' }).expect(201);
      assert.equal(created.body.membership.active, true); assert.equal(await Subscription.countDocuments({ userId: created.body.user.id }), 2); assert.equal(await Booking.countDocuments({ userId: created.body.user.id }), 1);
      for (const key of ['clientD','clientA','other','joint']) {
        const r = await call('david', 'patch', `/api/admin/memberships/${users[key]._id}`, { enabled: true, expectedRevision: 0, startDate: now.minus({ days: 5 }).toISODate() }).expect(200);
        bookings[key] = r.body.membership.trainingBookingId;
        const me = await call(key, 'get', '/api/auth/me').expect(200);
        assert.deepEqual(me.body.services.sort(), ['online','training']); assert.equal(me.body.user.role, 'member');
        const b = await Booking.findById(bookings[key]); assert.equal(b.paymentStatus, 'covered'); assert.equal(b.paidAt, undefined); assert.equal(b.stripeSessionId, undefined);
      }
      assert.equal(await Subscription.countDocuments({ source: { $ne: 'grant' } }), 0);
    });
    const availability = async (trainer, when = date) => (await call(null, 'get', `/api/availability?from=${when}&to=${when}&staffId=${trainer}`).expect(200)).body.days[0];
    const assign = (key, trainer) => call('david', 'patch', `/api/admin/bookings/${bookings[key]}/assignment`, { staffId: trainer });
    const batch = async (who, key, additions, removals = []) => {
      const b = await Booking.findById(bookings[key]);
      return call(who, 'post', '/api/client-schedule/changes', { bookingId: bookings[key], revision: b.updatedAt.toISOString(), additions, removals, note: 'Agreed test schedule.' });
    };
    await t.test('legacy David reservation at 10:00 does not hide Ashley’s 10:00', async () => {
      await Booking.updateOne({ _id: bookings.clientD }, { $set: { staffId: users.david._id, staffIds: [users.david._id], visits: [{ date, time: '10:00', service: 'training' }] } });
      await Slot.create({ _id: `${date}|10:00`, date, time: '10:00', bookingId: bookings.clientD });
      const david = await availability(users.david._id), ashley = await availability(users.ashley._id);
      assert.ok(!david.slots.includes('10:00')); assert.ok(david.workingHours.includes('10:00')); assert.ok(david.reservedTimes.includes('10:00'));
      assert.ok(ashley.slots.includes('10:00')); assert.ok(!ashley.reservedTimes.includes('10:00'));
      assert.ok(!(await availability(JOINT_TRAINER_ID)).slots.includes('10:00'));
      assert.ok(!JSON.stringify(david).includes('clientD')); assert.ok(!JSON.stringify(david).includes(bookings.clientD));
    });
    await t.test('owner schedules Ashley at the same hour and client can independently add and cancel', async () => {
      await assign('clientA', String(users.ashley._id)).expect(200);
      assert.equal((await batch('david','clientA',[{date,time:'10:00'}])).status,200);
      assert.equal(await Slot.countDocuments({date,time:'10:00'}),2);
      assert.equal((await batch('clientA','clientA',[{date,time:'11:00'}])).status,200);
      assert.equal((await batch('clientA','clientA',[],[{date,time:'11:00'}])).status,200);
      const own = await call('clientA','get',`/api/client-schedule?month=${date.slice(0,7)}`).expect(200);
      assert.ok(own.body.visits.some(v=>v.date===date&&v.time==='10:00'&&v.status!=='cancelled'));
      const unrelated = await batch('clientD','clientA',[{date,time:'12:00'}]); assert.equal(unrelated.status,404);
    });
    await t.test('same trainer collisions are rejected, including reassignment and joint assignment',async()=>{
      await assign('other',String(users.ashley._id)).expect(200);
      assert.equal((await batch('david','other',[{date,time:'10:00'}])).status,409);
      await assign('clientA',String(users.david._id)).expect(409);
      await assign('clientA',JOINT_TRAINER_ID).expect(409);
      assert.equal(String((await Booking.findById(bookings.clientA)).staffId),String(users.ashley._id));
      assert.equal(await Slot.countDocuments({date,time:'10:00'}),2);
    });
    await t.test('single-visit and whole-request editors also allow a different trainer at 10:00',async()=>{
      const b=await Booking.findById(bookings.clientA);
      await call('clientA','post','/api/client-schedule/visit',{bookingId:bookings.clientA,action:'change',original:{date,time:'10:00',service:'training'},replacement:{date,time:'12:00',service:'training'},note:'Move visit.'}).expect(200);
      await call('clientA','post','/api/client-schedule/visit',{bookingId:bookings.clientA,action:'change',original:{date,time:'12:00',service:'training'},replacement:{date,time:'10:00',service:'training'},note:'Restore 10.'}).expect(200);
      await call('david','patch',`/api/bookings/${bookings.clientA}/visits`,{visits:[{date,time:'10:00',service:'training'}]}).expect(200);
      assert.equal(await Slot.countDocuments({date,time:'10:00'}),2);
    });
    await t.test('global closures block both trainers and cannot overwrite a booked hour',async()=>{
      await call('david','post','/api/admin/blocks',{date,time:'10:00',reason:'Shared closure'}).expect(409);
      await call('david','post','/api/admin/blocks',{date,time:'13:00',reason:'Shared closure'}).expect(201);
      for(const id of [users.david._id,users.ashley._id,JOINT_TRAINER_ID])assert.ok(!(await availability(id)).slots.includes('13:00'));
      assert.equal((await batch('clientA','clientA',[{date,time:'13:00'}])).status,409);
    });
    await t.test('concurrent same-trainer saves have one winner; cancellations free only that trainer',async()=>{
      const a=await Booking.findById(bookings.clientA),other=await Booking.findById(bookings.other);
      const body=b=>({bookingId:String(b._id),revision:b.updatedAt.toISOString(),additions:[{date:nextDate,time:'10:00'}],removals:[],note:'Race test.'});
      const results=await Promise.all([call('david','post','/api/client-schedule/changes',body(a)),call('david','post','/api/client-schedule/changes',body(other))]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(await Slot.countDocuments({date:nextDate,time:'10:00'}),1);
      assert.equal((await batch('clientA','clientA',[],[{date,time:'10:00'}])).status,200);
      assert.ok((await availability(users.ashley._id)).slots.includes('10:00'));assert.ok(!(await availability(users.david._id)).slots.includes('10:00'));
      assert.ok(await Slot.exists({_id:`${date}|10:00`,bookingId:bookings.clientD}));
    });
    await t.test('a free joint appointment blocks both trainers and reassignment updates legacy occupancy', async () => {
      const jointDate=now.plus({days:5}).toISODate();
      await assign('joint',JOINT_TRAINER_ID).expect(200);
      assert.equal((await batch('david','joint',[{date:jointDate,time:'11:00'}])).status,200);
      for(const id of [users.david._id,users.ashley._id])assert.ok(!(await availability(id,jointDate)).slots.includes('11:00'));
      await assign('clientD',String(users.ashley._id)).expect(200);
      assert.ok((await availability(users.david._id)).slots.includes('10:00'));
      assert.ok(!(await availability(users.ashley._id)).slots.includes('10:00'));
    });
    await t.test('trainer-specific day off and working hours determine the offered time list',async()=>{
      const schedule=await TrainerSchedule.findById(String(users.ashley._id));
      await call('ashley','put',`/api/admin/trainer-schedules/${users.ashley._id}`,{revision:schedule.revision,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['09:00','10:00','11:00','12:00','13:00'],overrides:[]}).expect(200);
      const ashleyHours=await availability(users.ashley._id);
      assert.ok(ashleyHours.businessHours.includes('14:00'));assert.ok(!ashleyHours.workingHours.includes('14:00'));assert.ok(!ashleyHours.reservedTimes.includes('14:00'));assert.ok((await availability(users.david._id)).slots.includes('14:00'));
      const future=now.plus({days:6}).toISODate();const updated=await TrainerSchedule.findById(String(users.ashley._id));
      await call('ashley','put',`/api/admin/trainer-schedules/${users.ashley._id}`,{revision:updated.revision,enabled:true,weekdays:[1,2,3,4,5,6,7],hours:updated.hours,overrides:[{date:future,hours:[]}]}).expect(200);
      assert.deepEqual((await availability(users.ashley._id,future)).slots,[]);assert.ok((await availability(users.david._id,future)).slots.includes('10:00'));
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
