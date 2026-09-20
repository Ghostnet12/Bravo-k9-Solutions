// Isolated disposable replica set. Never reads or modifies a production database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../server/app.js';
import { User, Settings, Booking, Slot, Lesson, Subscription, StripeEvent } from '../server/models.js';
import { processStripeEvent } from '../server/payments.js';
const origin = 'http://localhost:5173';
test('persistent accounts, conflict protection, ownership, staff tools, and billing events', { timeout: 180000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.5' } });
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB = 'bravo_disposable_test'; process.env.APP_ORIGIN = origin;
  t.after(async () => { await mongoose.disconnect(); await replica.stop(); });
  const alice = request.agent(app), bob = request.agent(app);
  const post = (agent,url,body) => agent.post(url).set('Origin',origin).send(body);
  let aliceId;
  await t.test('real registration and session cookies; injected role ignored', async () => {
    const a = await post(alice,'/api/auth/register',{ name:'Alice Test', email:'alice@example.test', password:'test-long-password-123', role:'staff' }).expect(201);
    aliceId=a.body.user.id; assert.equal(a.body.user.role,'member'); assert.ok(a.headers['set-cookie'][0].includes('HttpOnly'));
    await post(bob,'/api/auth/register',{ name:'Bob Test', email:'bob@example.test', password:'test-long-password-456' }).expect(201);
    await alice.get('/api/auth/me').expect(200);
    await post(alice,'/api/community',{body:'Fake staff alert',kind:'alert'}).expect(403);
    await alice.get('/api/admin').expect(403);
  });
  await (await import('../server/models.js')).LessonLibrary.create({ _id: 'library', open: true });
  await Settings.updateOne({_id:'schedule'},{$set:{enabled:true,weekdays:[1,2,3,4,5,6,7]}});
  const date = DateTime.now().setZone('America/Chicago').plus({days:2}).toISODate();
  const payload = () => ({requestKey:randomUUID(),serviceIds:['training'],visits:[{date,time:'09:00',service:'training'}],dogName:'Test Dog',phone:'6055550100',address:'123 Test Street',notes:''});
  let booking;
  await t.test('simultaneous reservations cannot double book; same request retries safely', async () => {
    const body=payload(); const responses=await Promise.all([post(alice,'/api/bookings',body),post(bob,'/api/bookings',payload())]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]); assert.equal(await Slot.countDocuments({date: date, time: '09:00'}),1);
    const owner = responses[0].status === 201 ? alice : bob; booking=responses.find(r=>r.status===201).body.booking;
    const retry=await post(owner,'/api/bookings',{...payload(),requestKey:booking.requestKey}).expect(201); assert.equal(retry.body.booking._id,booking._id);
    const stranger=owner===alice?bob:alice; await post(stranger,`/api/bookings/${booking._id}/cancel`,{}).expect(404);
    await post(owner,`/api/bookings/${booking._id}/cancel`,{}).expect(200); assert.equal(await Slot.countDocuments({date: date, time: '09:00'}),0);
  });
  await t.test('messages persist without leaking account email', async () => {
    await post(alice,'/api/community',{body:'A real saved message',kind:'message'}).expect(201);
    const read=await bob.get('/api/community').expect(200); assert.equal(read.body.messages[0].body,'A real saved message'); assert.equal(read.body.messages[0].authorEmail,undefined);
  });
  await t.test('staff assignment is server-controlled and blocks occupied slots', async () => {
    await User.updateOne({_id:aliceId},{$set:{role:'staff'}}); await alice.get('/api/admin').expect(200);
    await post(alice,'/api/admin/blocks',{date,time:'10:00',reason:'Travel time'}).expect(201);
    const res=await bob.get(`/api/availability?from=${date}&to=${date}`).expect(200); assert.ok(!res.body.days[0].slots.includes('10:00'));
    await post(alice,'/api/community',{body:'Official test alert',kind:'alert'}).expect(201);
  });
  await t.test('member video checks happen on the server', async () => {
    await Lesson.create({_id:'test-lesson',title:'Test',published:true,videoFile:'test.mp4',captionFile:'test.vtt',transcript:'Private transcript.'});
    await bob.get('/api/lessons/test-lesson/transcript').expect(403);
    const catalog=await bob.get('/api/lessons').expect(200); assert.equal(catalog.body.lessons.find(l=>l._id==='test-lesson').videoFile,undefined);
  });
  await t.test('Stripe event fulfillment is idempotent and canceled subscriptions revoke access', async () => {
    const bobUser=await User.findOne({email:'bob@example.test'}); await User.updateOne({_id:bobUser._id},{$set:{stripeCustomerId:'cus_test_bob'}});
    const online=await post(bob,'/api/bookings',{...payload(),visits:[],serviceIds:['online']}).expect(201);
    const sub={id:'sub_test',customer:'cus_test_bob',status:'active',metadata:{app:'bravo-k9',userId:String(bobUser._id),serviceIds:'["online"]'},items:{data:[{current_period_end:Math.floor(Date.now()/1000)+86400}]}};
    const stripe={subscriptions:{retrieve:async()=>sub}};
    const event={id:'evt_paid_test',type:'checkout.session.completed',created:1000,data:{object:{id:'cs_test',customer:'cus_test_bob',client_reference_id:online.body.booking._id,subscription:sub.id,payment_status:'paid',currency:'usd',amount_total:7500,metadata:{app:'bravo-k9',userId:String(bobUser._id),bookingId:online.body.booking._id}}}};
    await processStripeEvent(event,stripe); await processStripeEvent(event,stripe);
    assert.equal(await StripeEvent.countDocuments({_id:event.id}),1); assert.equal((await Booking.findById(online.body.booking._id)).paymentStatus,'paid');
    const privateRead=await bob.get('/api/lessons/test-lesson/transcript').expect(200); assert.equal(privateRead.body.transcript,'Private transcript.');
    sub.status='canceled'; await processStripeEvent({id:'evt_cancelled_test',type:'customer.subscription.deleted',created:1001,data:{object:{id:sub.id}}},stripe);
    await bob.get('/api/lessons/test-lesson/transcript').expect(403); assert.equal((await Subscription.findOne({stripeId:sub.id})).status,'canceled');
  });
});
