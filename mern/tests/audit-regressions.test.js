// Isolated model/Stripe doubles only: these tests never move money or contact Atlas.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { checkout, refundBooking, processStripeEvent } from '../server/payments.js';
import { Booking, User, Subscription, StripeEvent, BillingLock, Settings, Slot } from '../server/models.js';
import { cancelBooking, getAvailability } from '../server/bookings.js';
import { quote, rescheduledQuote, SERVICES } from '../shared/catalog.js';
import { publicUser } from '../server/auth.js';
import { clientError } from '../server/errors.js';
import { api } from '../client/src/api.js';
import { readFile } from 'node:fs/promises';

const query = value => {
  const chain = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const key of ['lean', 'select', 'session']) chain[key] = () => chain;
  return chain;
};
function fixture() {
  const booking = { _id: '68c20f8f5c734fa0f944ad10', userId: '68c20f8f5c734fa0f944ad11', status: 'requested', paymentStatus: 'unpaid', serviceIds: ['walking'], dogCount: 2, visits: [{ date: '2026-09-21', time: '10:00', service: 'walking' }] };
  booking.quote = quote(booking.serviceIds, booking.visits, { dogCount: 2 });
  return { booking, user: { _id: booking.userId, email: 'fixture@example.test', name: 'Test Customer', stripeCustomerId: 'cus_fixture' } };
}
function checkoutMocks(t, booking) {
  const previous = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'https://bravounleashed.com';
  t.after(() => previous === undefined ? delete process.env.APP_ORIGIN : process.env.APP_ORIGIN = previous);
  t.mock.method(Subscription, 'find', () => query([]));
  t.mock.method(BillingLock, 'findOneAndUpdate', async () => ({}));
  const release = t.mock.method(BillingLock, 'deleteOne', async () => ({}));
  const updates = t.mock.method(Booking, 'updateOne', async (_filter, change) => { Object.assign(booking, change.$set); return { matchedCount: 1, modifiedCount: 1 }; });
  t.mock.method(Booking, 'findById', () => query(booking));
  return { release, updates };
}
test('rescheduling preserves recorded unit prices and recomputes walk quantities', () => {
  const { booking } = fixture();
  booking.quote = quote(['walking'], booking.visits, { dogCount: 2 }, SERVICES.map(service => ({ ...service, cents: 3300 })));
  const result = rescheduledQuote(booking, [...booking.visits, { date: '2026-09-22', time: '11:00', service: 'walking' }]);
  assert.equal(result.lines[0].unitCents, 3300); assert.equal(result.lines[0].quantity, 4); assert.equal(result.dueNowCents, 13200);
  assert.equal(booking.quote.dueNowCents, 6600);
});
test('checkout retry restores cancellation guard and reuses immutable parameters', async t => {
  const { booking, user } = fixture(); checkoutMocks(t, booking);
  const attempts = [];
  const stripe = { checkout: { sessions: { create: async (params, options) => {
    assert.equal(booking.checkoutStarting, true); attempts.push({ params: structuredClone(params), options });
    if (attempts.length === 1) throw Object.assign(new Error('Denied fixture'), { type: 'StripePermissionError' });
    return { id: 'cs_fixture', url: 'https://checkout.stripe.com/fixture', expires_at: 2000000000 };
  } } } };
  // The database double honors insert-only parameter persistence.
  t.mock.method(Booking, 'updateOne', async (filter, change) => {
    if (filter.checkoutParams?.$exists === false && booking.checkoutParams) return { matchedCount: 0 };
    Object.assign(booking, change.$set); return { matchedCount: 1, modifiedCount: 1 };
  });
  await assert.rejects(checkout(booking, user, stripe), /Denied fixture/); assert.equal(booking.checkoutStarting, false);
  await checkout(booking, user, stripe);
  assert.deepEqual(attempts[0], attempts[1]); assert.equal(booking.checkoutStarting, false);
});
test('ambiguous Stripe timeout keeps the reservation protected for safe retry', async t => {
  const { booking, user } = fixture(); const { release } = checkoutMocks(t, booking);
  const stripe = { checkout: { sessions: { create: async () => { throw Object.assign(new Error('Lost response'), { type: 'StripeConnectionError' }); } } } };
  await assert.rejects(checkout(booking, user, stripe), /same saved request/);
  assert.equal(booking.checkoutStarting, true); assert.equal(release.mock.callCount(), 0);
});
test('a fresh checkout lock cannot be stolen while customer creation is starting', async t => {
  const { booking, user } = fixture(); checkoutMocks(t, booking);
  const acquire = t.mock.method(BillingLock, 'findOneAndUpdate', async () => { throw Object.assign(new Error('Existing lock'), { code: 11000 }); });
  t.mock.method(BillingLock, 'findById', () => query({ bookingId: 'another-booking', expiresAt: new Date(Date.now() + 31 * 60 * 1000) }));
  t.mock.method(Booking, 'findById', () => query({ checkoutStarting: false }));
  await assert.rejects(checkout(booking, user, {}), /checkout in progress/); assert.equal(acquire.mock.callCount(), 1);
});
test('production static pages get CSP and frame protections, with enough checkout runtime', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = config.headers.find(rule => rule.source === '/(.*)');
  for (const route of ['/', '/account', '/assets/app.js']) assert.match(route, new RegExp(`^${rule.source}$`));
  const headers = Object.fromEntries(rule.headers.map(header => [header.key, header.value]));
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /script-src 'self'/);
  assert.equal(headers['X-Frame-Options'], 'DENY'); assert.ok(config.functions['api/index.js'].maxDuration >= 60);
});
test('structured business data uses the public domain without stale editable prices', async () => {
  const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.equal(data.url, 'https://bravounleashed.com');
  assert.match(data.image, /^https:\/\/bravounleashed\.com\//);
  assert.equal(data.makesOffer.find(offer => offer.name === 'Dog Walking').price, undefined);
});
test('paid, covered, refunded and review bookings cannot start another checkout', async () => {
  for (const paymentStatus of ['paid', 'covered', 'refunded', 'review']) {
    const { booking, user } = fixture(); booking.paymentStatus = paymentStatus;
    await assert.rejects(checkout(booking, user, {}), /does not need another payment/);
  }
});
test('cancellation uses the freshly read checkout and guards against concurrent changes', async t => {
  const { booking } = fixture();
  t.mock.method(Booking, 'findById', () => query({ ...booking, stripeSessionId: 'cs_new' }));
  t.mock.method(mongoose.connection, 'transaction', async work => work({}));
  const update = t.mock.method(Booking, 'updateOne', async () => ({ matchedCount: 0 }));
  const slots = t.mock.method(Slot, 'deleteMany', async () => ({}));
  let retrieved;
  const stripe = { checkout: { sessions: { retrieve: async id => { retrieved = id; return { id, status: 'complete' }; } } } };
  await assert.rejects(cancelBooking(booking, stripe), /Checkout is starting/);
  assert.equal(retrieved, 'cs_new'); assert.equal(update.mock.calls[0].arguments[0].stripeSessionId, 'cs_new'); assert.equal(slots.mock.callCount(), 0);
});
test('unbounded availability dates fail before a database query', async t => {
  const read = t.mock.method(Settings, 'findById', () => query({}));
  await assert.rejects(getAvailability('2026-01-01', '2099-01-01'), /93 days/); assert.equal(read.mock.callCount(), 0);
});
test('billing availability is independent of active membership, without exposing Stripe IDs', () => {
  const { user } = fixture(); user.role = 'member';
  const result = publicUser(user); assert.equal(result.hasBillingAccount, true); assert.equal(result.stripeCustomerId, undefined);
});
test('scheduler exposes distinct available, selected, and unavailable date states', async () => {
  const source = await readFile(new URL('../client/src/BookingPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /className={state}/); assert.match(source, /Available days and times/);
  assert.match(source, /time >= startTime && time <= endTime/); assert.match(source, /date-time-range/);
  const css = await readFile(new URL('../client/src/professional.css', import.meta.url), 'utf8');
  for (const state of ['available', 'selected', 'unavailable']) assert.match(css, new RegExp(`date-grid button\\.${state}`));
});
test('internal and upstream errors are redacted while input errors stay actionable', () => {
  for (const error of [new TypeError('secret internal variable'), Object.assign(new Error('secret Mongo URI'), { name: 'MongoServerError' }), Object.assign(new Error('secret API key'), { type: 'StripePermissionError' }), Object.assign(new Error('secret object id'), { name: 'CastError' }), Object.assign(new SyntaxError('secret request body'), { type: 'entity.parse.failed' })]) assert.doesNotMatch(clientError(error).message, /secret/);
  assert.equal(clientError(new ReferenceError('internal')).status, 500);
  assert.equal(clientError(Object.assign(new Error('Wait a minute.'), { status: 429 })).message, 'Wait a minute.');
});
test('client reports readable errors for an HTML outage page', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ status: 502, ok: false, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
  await assert.rejects(api('/bookings'), /unexpected response/);
});
test('subscription refunds resolve the modern Invoice Payments mapping', async t => {
  const { booking, user } = fixture(); booking.paymentStatus = 'paid'; booking.stripeSessionId = 'cs_fixture';
  const write = t.mock.method(Booking, 'updateOne', async () => ({ matchedCount: 1, modifiedCount: 1 }));
  let listed, refundInput;
  const stripe = { checkout: { sessions: { retrieve: async () => ({ invoice: 'in_fixture', amount_total: 5000 }) } }, invoicePayments: { list: async params => { listed = params; return { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_fixture' } }], has_more: false }; } }, refunds: { create: async params => { refundInput = params; return { id: 're_fixture', status: 'succeeded', currency: 'usd', amount: 5000 }; } } };
  await refundBooking(booking, user, stripe);
  assert.equal(listed.invoice, 'in_fixture'); assert.equal(refundInput.payment_intent, 'pi_fixture'); assert.equal(refundInput.amount, 5000);
  assert.equal(write.mock.calls.at(-1).arguments[1].$set.paymentStatus, 'refunded');
});
test('a pending refund is not falsely marked refunded and can be checked without another refund', async t => {
  const { booking, user } = fixture(); Object.assign(booking, { paymentStatus: 'review', stripeSessionId: 'cs_fixture', stripePaymentIntentId: 'pi_fixture', refundId: 're_existing' });
  const write = t.mock.method(Booking, 'updateOne', async () => ({ matchedCount: 1, modifiedCount: 1 }));
  const stripe = { checkout: { sessions: { retrieve: async () => ({ payment_intent: 'pi_fixture', amount_total: 5000 }) } }, refunds: { retrieve: async id => ({ id, status: 'pending', currency: 'usd', amount: 5000 }), create: async () => { throw new Error('Must never create a second refund'); } } };
  const result = await refundBooking(booking, user, stripe);
  assert.match(result.message, /pending/); assert.equal(write.mock.calls.at(-1).arguments[1].$set.paymentStatus, 'review'); assert.equal(write.mock.calls.at(-1).arguments[1].$set.refundedAt, undefined);
});
test('webhook rejects mismatched customer/session and preserves refunded state on late completion', async t => {
  const { booking, user } = fixture(); booking.stripeSessionId = 'cs_fixture';
  t.mock.method(mongoose.connection, 'transaction', async work => work({}));
  t.mock.method(StripeEvent, 'exists', async () => false); t.mock.method(StripeEvent, 'create', async () => ({}));
  t.mock.method(Booking, 'findById', () => query(booking)); t.mock.method(User, 'findById', () => query(user));
  const write = t.mock.method(Booking, 'updateOne', async () => ({})); t.mock.method(BillingLock, 'deleteOne', async () => ({}));
  const object = { id: 'cs_fixture', customer: 'cus_other', client_reference_id: String(booking._id), metadata: { app: 'bravo-k9', userId: String(user._id), bookingId: String(booking._id) }, payment_status: 'paid', currency: 'usd', amount_total: 5000 };
  const event = { id: 'evt_fixture', type: 'checkout.session.completed', created: 1, data: { object } };
  await assert.rejects(processStripeEvent(event, {}), /customer mismatch/);
  object.customer = user.stripeCustomerId; object.id = 'cs_wrong'; await assert.rejects(processStripeEvent(event, {}), /session mismatch/);
  object.id = 'cs_fixture'; booking.paymentStatus = 'refunded'; booking.refundId = 're_existing'; await processStripeEvent(event, {});
  assert.equal(write.mock.callCount(), 0);
});

test('accessibility controls support focus management, Escape, and route changes', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../client/src/Accessibility.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/accessibility-layout.css', import.meta.url), 'utf8')
  ]);
  assert.match(source, /useLocation/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /triggerRef\.current\?\.focus/);
  assert.match(source, /aria-labelledby="accessibility-panel-title"/);
  assert.match(source, /location\.pathname, location\.search, location\.hash/);
  assert.match(source, /pointerdown/);
  assert.doesNotMatch(source, /onBlur=/);
  assert.match(source, /Close accessibility options/);
  assert.match(css, /html\.access-large-text\{font-size:125%\}/);
});

test('personal-information fields expose recognized autofill purposes', async () => {
  const [account, booking] = await Promise.all([
    readFile(new URL('../client/src/AccountPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/BookingPage.jsx', import.meta.url), 'utf8')
  ]);
  for (const token of ['name', 'tel', 'street-address']) assert.match(account, new RegExp(`autoComplete="${token}"`));
  assert.match(booking, /autoComplete=\{field === 'phone' \? 'tel' : field === 'address' \? 'street-address' : 'off'\}/);
});

test('ratings have one accessible name and decorative stars stay silent', async () => {
  const source = await readFile(new URL('../client/src/Home.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="review-stars" role="img" aria-label=/);
  assert.match(source, /<span aria-hidden="true">/);
});

test('accessibility statement names the current target, methods, and ongoing review', async () => {
  const source = await readFile(new URL('../client/src/AccessibilityPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /WCAG\) 2\.2, Level AA/);
  assert.match(source, /additional Level AAA practices where practical/);
  assert.match(source, /Measures we take/);
  assert.match(source, /not a government certification/);
});

test('accessibility audit is available to read and download as structured HTML', async () => {
  const [page, report] = await Promise.all([
    readFile(new URL('../client/src/AccessibilityPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/public/reports/bravo-k9-accessibility-audit-2026-09-11.html', import.meta.url), 'utf8')
  ]);
  assert.match(page, /href="\/reports\/bravo-k9-accessibility-audit-2026-09-11\.html"/);
  assert.match(page, /download="Bravo-K9-Accessibility-Audit-2026-09-11\.html"/);
  assert.match(report, /<html lang="en">/);
  assert.match(report, /<main id="main">/);
  assert.match(report, /<caption>/);
  assert.match(report, /not a legal opinion, government certification/);
});

test('sticky controls leave focus clearance and form boundaries meet contrast target', async () => {
  const css = await readFile(new URL('../client/src/accessibility-layout.css', import.meta.url), 'utf8');
  assert.match(css, /scroll-padding-block:7rem 8rem/);
  assert.match(css, /scroll-margin-block:7rem/);
  assert.match(css, /border-color:#8b7b63/);
  assert.match(css, /\.bravo-footer a\{min-height:44px\}/);
});
