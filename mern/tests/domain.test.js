import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { quote, serviceSelection, TRAINING_FOCUSES } from '../shared/catalog.js';
import { availability, autoSchedule, dateTime, validateVisits, HOURS, dateRange } from '../server/scheduling.js';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { privatePath } from '../server/lessons.js';
import { stripeClient, validatedCheckoutPricing } from '../server/payments.js';
import { bookingCoveredByEntitlements } from '../server/bookings.js';
test('Bravo pricing stays exact and recurring charges are separated', () => {
  assert.equal(quote(['training', 'online']).monthlyCents, 25000);
  const twoDogTraining = quote(['training'], [], { dogCount: 2 });
  assert.equal(twoDogTraining.monthlyCents, 30000);
  assert.deepEqual(twoDogTraining.lines.map(line => [line.id, line.unitCents, line.quantity]), [['training', 20000, 1], ['training-additional-dogs', 10000, 1]]);
  const threeDogTraining = quote(['training'], [], { dogCount: 3 });
  assert.equal(threeDogTraining.monthlyCents, 40000);
  assert.equal(threeDogTraining.lines[1].quantity, 2);
  const q = quote(['aggression', 'online']);
  assert.equal(q.monthlyCents, 7500); assert.equal(q.oneTimeCents, 40000);
  const walking = quote(['walking'], [{ date: '2026-10-10', time: '09:00', service: 'walking' }, { date: '2026-10-11', time: '10:00', service: 'walking' }], { dogCount: 3 });
  assert.equal(walking.oneTimeCents, 15000); assert.equal(walking.lines[0].quantity, 6); assert.equal(walking.lines[0].durationMinutes, 30);
});
test('duplicate programs, unknown services, and conflicting selections are rejected', () => {
  for (const ids of [[], ['training','training'], ['free'], ['sitting'], ['complete'], ['all-access'], ['training','aggression']]) assert.throws(() => serviceSelection(ids));
  assert.doesNotThrow(() => serviceSelection(['walking']));
});
test('professional training exposes the complete focus menu with stable unique values', () => {
  const names = TRAINING_FOCUSES.map(focus => focus.name);
  for (const expected of ['Basic obedience', 'Advanced obedience', 'Job-specific working-dog training', 'Service dog training', 'Law-enforcement K9 training', 'Search-and-rescue training', 'Executive protection training']) assert.ok(names.includes(expected));
  assert.equal(new Set(TRAINING_FOCUSES.map(focus => focus.id)).size, TRAINING_FOCUSES.length);
});
test('training coverage never silently extends to unpaid additional dogs', () => {
  const oneDog = { services: ['training'], serviceDogCounts: { training: 1 } };
  assert.equal(bookingCoveredByEntitlements(['training'], 1, oneDog), true);
  assert.equal(bookingCoveredByEntitlements(['training'], 2, oneDog), false);
  assert.equal(bookingCoveredByEntitlements(['training'], 3, { services: ['training'], serviceDogCounts: { training: 3 } }), true);
  assert.equal(bookingCoveredByEntitlements(['walking'], 1, { services: ['walking'], serviceDogCounts: { walking: 1 } }), false);
});
test('checkout rejects a saved training quote that predates the additional-dog rule', () => {
  assert.throws(() => validatedCheckoutPricing({ serviceIds: ['training'], dogCount: 2, quote: { currency: 'usd', lines: [{ id: 'training', unitCents: 20000, quantity: 1 }] } }), /pricing changed/);
  assert.doesNotThrow(() => validatedCheckoutPricing({ serviceIds: ['training'], dogCount: 2, quote: quote(['training'], [], { dogCount: 2 }) }));
});
test('dates use Aberdeen timezone and reject impossible dates', () => {
  assert.throws(() => dateTime('2026-02-30')); assert.throws(() => dateTime('2026-10-02','24:00'));
  assert.equal(dateTime('2026-07-01','09:00').toUTC().hour, 14);
  assert.equal(dateTime('2026-12-01','09:00').toUTC().hour, 15);
  assert.equal(HOURS.length, 13); assert.equal(HOURS.at(-1), '21:00');
  assert.throws(() => dateRange('2026-01-01','2026-05-01'));
});
test('availability excludes past slots, weekends, occupied slots and disabled scheduling', () => {
  const settings = { weekdays: [1,2,3,4,5], hours: HOURS, enabled: true };
  const days = availability({ from: '2026-09-09', to: '2026-09-13', settings, occupied: ['2026-09-09|15:00'], now: DateTime.fromISO('2026-09-09T14:30', { zone: 'America/Chicago' }) });
  assert.ok(!days[0].slots.includes('14:00')); assert.ok(!days[0].slots.includes('15:00')); assert.ok(days[0].slots.includes('16:00'));
  assert.equal(days.at(-1).slots.length, 0);
  assert.ok(availability({ from: '2026-09-09', to: '2026-09-09' }).every(d => !d.slots.length));
});
test('trip auto scheduler honors cutoffs, both boundary dates, count and preference', () => {
  const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${10+i}`, slots: HOURS }));
  const result = autoSchedule(days, { count: 5, startDate:'2026-10-10', startTime:'16:00', endDate:'2026-10-16', endTime:'11:00', preference:'evening', service:'training' });
  assert.equal(result.visits.length,5); assert.equal(result.visits[0].time,'17:00'); assert.equal(result.visits.at(-1).date,'2026-10-16'); assert.ok(result.visits.at(-1).time <= '11:00');
  assert.equal(result.uncoveredDates.length,2); assert.equal(result.boundaryWarning,false);
  assert.throws(() => autoSchedule(days.slice(0,2), { count:5, startDate:'2026-10-10', endDate:'2026-10-16' }), /Only 2/);
});
test('visits must cover every selected hands-on service and cannot overlap', () => {
  assert.throws(() => validateVisits(['aggression'], []), /aggression/);
  assert.throws(() => validateVisits(['training'], [{ date:'2026-10-10', time:'09:00', service:'training' },{ date:'2026-10-10', time:'09:00', service:'training' }]), /same time slot/);
  assert.doesNotThrow(() => validateVisits(['online'], []));
});
test('password storage is salted and never plaintext', async () => {
  const p = 'a-very-long-test-password'; const first = await hashPassword(p), second = await hashPassword(p);
  assert.notEqual(first,second); assert.ok(await verifyPassword(p,first)); assert.equal(await verifyPassword('wrong',first),false);
});
test('private media cannot use path traversal or public URLs', () => {
  for(const file of ['../secrets.mp4','https://example.com/a.mp4','/etc/password','nested/file.mp4']) assert.throws(() => privatePath(file));
});
test('live Stripe keys require an explicit launch switch', () => {
  const old = { key:process.env.STRIPE_SECRET_KEY, secret:process.env.STRIPE_WEBHOOK_SECRET, enabled:process.env.STRIPE_LIVE_ENABLED, vercel:process.env.VERCEL_ENV, testEnabled:process.env.STRIPE_TEST_CHECKOUT_ENABLED };
  process.env.STRIPE_SECRET_KEY='sk_live_not_real'; process.env.STRIPE_WEBHOOK_SECRET='whsec_not_real'; delete process.env.STRIPE_LIVE_ENABLED;
  assert.equal(stripeClient(),null);
  process.env.STRIPE_SECRET_KEY='rk_live_not_real';
  assert.equal(stripeClient(),null);
  process.env.STRIPE_SECRET_KEY='sk_test_not_real'; process.env.VERCEL_ENV='production'; delete process.env.STRIPE_TEST_CHECKOUT_ENABLED;
  assert.equal(stripeClient(),null);
  process.env.STRIPE_TEST_CHECKOUT_ENABLED='true';
  assert.ok(stripeClient());
  for(const [key,value] of Object.entries({STRIPE_SECRET_KEY:old.key,STRIPE_WEBHOOK_SECRET:old.secret,STRIPE_LIVE_ENABLED:old.enabled,VERCEL_ENV:old.vercel,STRIPE_TEST_CHECKOUT_ENABLED:old.testEnabled})) value === undefined ? delete process.env[key] : process.env[key]=value;
});
