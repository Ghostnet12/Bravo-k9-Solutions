import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DateTime } from 'luxon';
import { extendCalendarDays } from '../shared/training-credits.js';

test('training day credit permissions, atomicity and customer visibility', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '7.0.14' } });
  process.env.NODE_ENV = 'test'; process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'training_credits_isolated'; process.env.APP_ORIGIN = 'http://localhost:5173'; delete process.env.STRIPE_SECRET_KEY;
  const { default: app } = await import('../server/client-services-app.js');
  const { connectDb } = await import('../server/db.js');
  const { User, Booking, Subscription, MemberAccess, Session, Settings, Slot, Notification, AuditEvent, BillingLock } = await import('../server/models.js');
  const { TrainingDayCredit } = await import('../server/training-credits.js');
  const { digest } = await import('../server/auth.js');
  const { getEntitlements } = await import('../server/bookings.js');
  const { processStripeEvent } = await import('../server/payments.js');
  const { reserveVisits } = await import('../server/reservations.js');
  const { transaction } = await import('../server/db.js');
  const { quote } = await import('../shared/catalog.js');
  const now = DateTime.now().setZone('America/Chicago'), today = now.toISODate();
  const users = {}, cookies = {};
  const call = (who, method, path, body) => { let r = request(app)[method](path).set('Origin', process.env.APP_ORIGIN); if (who) r = r.set('Cookie', cookies[who]); return body === undefined ? r : r.send(body); };
  const endpoint = '/api/admin/training-credits';
  let fixtureId = 0;
  async function fixture({ source = 'manual', auto = false, start = now.minus({days:20}), end = now.plus({days:6}), joint = false } = {}) {
    const index = ++fixtureId, user = await User.create({ name: `Credit client ${index}`, role: 'member', email: `credit${index}@example.test`, passwordHash: 'isolated-fixture', dogName: 'Fixture dogs' });
    const b = await Booking.create({ userId: user._id, requestKey: randomUUID(), serviceIds: ['training'], status: 'confirmed', paymentStatus: source === 'grant' ? 'covered' : 'paid', paidAt: source === 'grant' ? undefined : now.minus({days:20}).toJSDate(), dogCount: 2, dogName: 'Fixture dogs', staffId: users.staff._id, staffIds: joint ? [users.staff._id,users.otherStaff._id] : [users.staff._id], termStartsAt: start.toJSDate(), termEndsAt: end.toJSDate(), visits: [{ date: today, time: '10:00', service: 'training' },{ date: today, time: '11:00', service: 'training' }], quote: quote(['training'],[],{dogCount:2}) });
    const term = await Subscription.create({ userId: user._id, stripeId: `${source === 'stripe' ? 'sub_' : source + ':'}${index}`, serviceIds: ['training'], dogCount: 2, source, autoPayDisabled: !auto, status: 'active', bookingId: b._id, validFrom: start.toJSDate(), validUntil: end.toJSDate() });
    await transaction(session => reserveVisits(b._id, b.visits, joint ? [users.staff._id,users.otherStaff._id] : [users.staff._id], session));
    const token = randomBytes(32).toString('hex'); await Session.create({ tokenHash: digest(token), userId:user._id, expiresAt:new Date(Date.now()+3600000) }); cookies[`client${index}`] = `bravo_session=${token}`;
    if (source === 'grant') {
      await MemberAccess.create({ _id:user._id,enabled:true,revision:1,startsAt:term.validFrom,endsAt:term.validUntil,trainingSubscriptionId:term.stripeId,trainingBookingId:b._id,trainingDogCount:2 });
      await Subscription.create({ userId:user._id,stripeId:`grant:${index}:online`,serviceIds:['online'],source:'grant',autoPayDisabled:true,status:'active',validFrom:term.validFrom,validUntil:term.validUntil });
    }
    const body = { clientId:String(user._id), termId:term.stripeId, requestKey:randomUUID(), expectedEnd:term.validUntil.toISOString(), missedDate:today, days:1, reason:'rain', note:'Rain cancellation', cancelVisits:true };
    return { user,b,term,body,client:`client${index}` };
  }
  async function cleanupVisits() { await Slot.deleteMany({}); }
  try {
    await connectDb(); await TrainingDayCredit.init();
    for (const [name,role] of [['owner','owner'],['admin','owner'],['staff','staff'],['otherStaff','staff'],['client','member']]) {
      users[name] = await User.create({ name,role,email:`${name}@example.test`,passwordHash:'isolated-fixture' });
      const token=randomBytes(32).toString('hex');await Session.create({tokenHash:digest(token),userId:users[name]._id,expiresAt:new Date(Date.now()+3600000)});cookies[name]=`bravo_session=${token}`;
    }
    await Settings.updateOne({_id:'schedule'},{$set:{enabled:true,weekdays:[1,2,3,4,5,6,7],hours:['10:00','11:00','13:00'],overrides:[]}});
    await t.test('only authorized roles and assigned staff can issue/read credits',async()=>{
      const f=await fixture();
      for(const who of [null,'client','otherStaff'])await call(who,'post',endpoint,f.body).expect(403);
      await call('client','get',`/api/training-credits?client=${f.user._id}`).expect(403);
      await call('otherStaff','get',`/api/training-credits?client=${f.user._id}`).expect(403);
      assert.equal((await call('otherStaff','get','/api/admin/training-credits/clients').expect(200)).body.clients.length,0);
      assert.ok((await call('staff','get','/api/admin/training-credits/clients').expect(200)).body.clients.some(c=>c._id===String(f.user._id)));
      await request(app).post(endpoint).set('Cookie',cookies.staff).set('Origin','https://untrusted.example').send(f.body).expect(403);
      assert.equal(await TrainingDayCredit.countDocuments(),0);await cleanupVisits();
    });
    await t.test('six to seven, cancel all visits once, keep charges and start unchanged, persist both sides',async()=>{
      const f=await fixture({joint:true}), old=await Booking.findById(f.b._id).lean();
      const r=await call('staff','post',endpoint,f.body).expect(200);assert.equal(r.body.credit.days,1);
      assert.equal(r.body.credit.cancelledVisits.length,2);
      const term=await Subscription.findById(f.term._id), b=await Booking.findById(f.b._id);
      assert.equal(term.validUntil.getTime(),extendCalendarDays(f.term.validUntil,1).getTime());assert.equal(term.validFrom.getTime(),f.term.validFrom.getTime());assert.equal(term.creditedDays,1);
      assert.equal(b.termEndsAt.getTime(),term.validUntil.getTime());assert.equal(b.visits.length,0);assert.equal(b.cancelledVisits.length,2);assert.equal(b.dogCount,2);assert.equal(b.paidAt.getTime(),old.paidAt.getTime());assert.deepEqual(b.quote,old.quote);assert.equal(b.paymentStatus,'paid');assert.equal(await Slot.countDocuments({bookingId:b._id}),0);
      const slotDate = DateTime.fromJSDate(f.term.validUntil, { zone: 'America/Chicago' }).plus({days:1}).toISODate();
      await call(f.client,'post','/api/client-schedule/changes',{bookingId:String(b._id),revision:b.updatedAt.toISOString(),additions:[{date:slotDate,time:'10:00'}],removals:[]}).expect(200);
      assert.ok(await Slot.exists({bookingId:b._id,date:slotDate}));
      const detail=await call(f.client,'get','/api/training-credits').expect(200);assert.equal(detail.body.credits.length,1);assert.equal(detail.body.credits[0].actorName,'staff');assert.equal(detail.body.terms[0].validUntil,term.validUntil.toISOString());assert.equal(detail.body.canCredit,false);
      const schedule=await call(f.client,'get',`/api/client-schedule?month=${today.slice(0,7)}`).expect(200);assert.equal(schedule.body.trainingBookings[0].termEndsAt,term.validUntil.toISOString());assert.equal(schedule.body.terms[0].validUntil,term.validUntil.toISOString());assert.ok((await getEntitlements(f.user._id)).services.includes('training'));
      assert.equal(await Notification.countDocuments({_id:/^day-credit:/,userId:f.user._id}),2);assert.ok(await AuditEvent.exists({action:'training.days-credited',targetId:f.term.stripeId}));
      await call('staff','post',endpoint,f.body).expect(200).expect(r=>assert.equal(r.body.replay,true));
      await call('otherStaff','post',endpoint,{...f.body,requestKey:randomUUID(),expectedEnd:term.validUntil.toISOString()}).expect(409);
      assert.equal((await Subscription.findById(f.term._id)).creditedDays,1);
    });
    await t.test('owners and administrators grant credits; same-day retries cannot double credit',async()=>{
      for(const actor of ['owner','admin']){
        await cleanupVisits();const f=await fixture();
        const responses=await Promise.all([call(actor,'post',endpoint,f.body),call(actor,'post',endpoint,{...f.body,requestKey:randomUUID()})]);
        assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await Subscription.findById(f.term._id)).creditedDays,1);
      }
    });
    await t.test('invalid, fractional, stale, wrong-date and revoked requests have no partial effects',async()=>{
      await cleanupVisits();const f=await fixture();
      for(const change of [{days:-1},{days:0},{days:1.5},{days:32},{missedDate:'2026-02-30'},{missedDate:'2020-01-01'},{reason:'other',note:''}])await call('owner','post',endpoint,{...f.body,...change}).expect(400);
      await call('owner','post',endpoint,{...f.body,expectedEnd:'2020-01-01T00:00:00.000Z'}).expect(409);
      await Subscription.updateOne({_id:f.term._id},{$set:{status:'revoked'}});
      await call('owner','post',endpoint,f.body).expect(404);
      assert.equal(await TrainingDayCredit.countDocuments({userId:f.user._id}),0);assert.equal((await Booking.findById(f.b._id)).visits.length,2);assert.equal((await Subscription.findById(f.term._id)).validUntil.getTime(),f.term.validUntil.getTime());
    });
    await t.test('manual grants align member access but never fabricate payments; resaving preserves credits',async()=>{
      await cleanupVisits();const f=await fixture({source:'grant'});
      await call('admin','post',endpoint,f.body).expect(200);
      let grant=await MemberAccess.findById(f.user._id),term=await Subscription.findById(f.term._id);
      assert.equal(grant.endsAt.getTime(),term.validUntil.getTime());assert.equal(grant.revision,2);assert.equal((await User.findById(f.user._id)).firstPaidAt,undefined);assert.equal((await Booking.findById(f.b._id)).paidAt,undefined);
      assert.equal((await Subscription.findOne({stripeId:`grant:${fixtureId}:online`})).validUntil.getTime(),term.validUntil.getTime());
      await Booking.updateMany({ userId: { $ne: f.user._id } }, { $set: { status: 'cancelled' } });
      const {saveManualTraining}=await import('../server/manual-training.js');
      await transaction(async session=>{const saved=await saveManualTraining({user:f.user,actorId:users.owner._id,term:{validFrom:f.term.validFrom,validUntil:f.term.validUntil},dogCount:2,session,subscriptionId:f.term.stripeId});assert.equal(saved.validUntil.getTime(),term.validUntil.getTime());});
    });
    await t.test('expired terms extend from their old end, not from today',async()=>{
      await cleanupVisits();const f=await fixture({start:now.minus({days:40}),end:now.minus({days:10})});
      await call('owner','post',endpoint,{...f.body,missedDate:now.minus({days:12}).toISODate(),cancelVisits:false}).expect(200);
      assert.equal((await Subscription.findById(f.term._id)).validUntil.getTime(),extendCalendarDays(f.term.validUntil,1).getTime());assert.deepEqual((await getEntitlements(f.user._id)).services,[]);
    });
    await t.test('Stripe rebilling and checkout overlap are blocked without touching money',async()=>{
      await cleanupVisits();let f=await fixture({source:'stripe',auto:true});await call('owner','post',endpoint,f.body).expect(409);assert.equal((await Subscription.findById(f.term._id)).creditedDays,0);
      await cleanupVisits();f=await fixture();await BillingLock.create({_id:String(f.user._id),bookingId:'synthetic',expiresAt:new Date(Date.now()+60000)});await call('owner','post',endpoint,f.body).expect(409);await BillingLock.deleteMany({});
      await Subscription.create({userId:f.user._id,stripeId:`renewal:${fixtureId}`,source:'manual',status:'active',serviceIds:['training'],validFrom:f.term.validUntil,validUntil:extendCalendarDays(f.term.validUntil,30),renewalOf:f.term.stripeId});await call('owner','post',endpoint,f.body).expect(409);assert.equal((await Booking.findById(f.b._id)).visits.length,2);
    });
    await t.test('manual-renewal Stripe webhook retains approved extension for same period',async()=>{
      await cleanupVisits();const f=await fixture({source:'stripe'});await User.updateOne({_id:f.user._id},{$set:{stripeCustomerId:'cus_fixture'}});
      await call('owner','post',endpoint,f.body).expect(200);
      const sub={id:f.term.stripeId,metadata:{app:'bravo-k9',userId:String(f.user._id),serviceIds:'["training"]',dogCount:'2'},customer:'cus_fixture',status:'active',cancel_at_period_end:true,current_period_start:Math.floor(f.term.validFrom.getTime()/1000),current_period_end:Math.floor(f.term.validUntil.getTime()/1000),items:{data:[]}};
      // Match Stripe's second-precision original period for this fixture.
      await Subscription.updateOne({_id:f.term._id},{$set:{creditPeriodStart:new Date(sub.current_period_start*1000)}});
      await processStripeEvent({id:'evt_credit_period',type:'customer.subscription.updated',created:Math.floor(Date.now()/1000),data:{object:{id:sub.id}}},{subscriptions:{retrieve:async()=>sub}});
      const saved=await Subscription.findById(f.term._id);assert.equal(saved.validUntil.getTime(),extendCalendarDays(new Date(sub.current_period_end*1000),1).getTime());assert.equal(saved.creditedDays,1);
    });
    await t.test('cancel toggle off leaves visits intact and next distinct credit is cumulative',async()=>{
      await cleanupVisits();const f=await fixture();await call('owner','post',endpoint,{...f.body,cancelVisits:false}).expect(200);
      let term=await Subscription.findById(f.term._id);await call('owner','post',endpoint,{...f.body,requestKey:randomUUID(),expectedEnd:term.validUntil.toISOString(),missedDate:now.minus({days:1}).toISODate(),days:2,cancelVisits:false}).expect(200);
      term=await Subscription.findById(f.term._id);assert.equal(term.creditedDays,3);assert.equal(term.validUntil.getTime(),extendCalendarDays(f.term.validUntil,3).getTime());assert.equal((await Booking.findById(f.b._id)).visits.length,2);
    });
  } finally { await mongoose.disconnect(); await replica.stop(); }
});
