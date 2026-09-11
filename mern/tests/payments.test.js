import test from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../server/payments.js';
import { Booking, Subscription, BillingLock } from '../server/models.js';
import { quote } from '../shared/catalog.js';

const query = value => {
  const chain = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const key of ['lean', 'select']) chain[key] = () => chain;
  return chain;
};

test('checkout uses the verified server quote and safe Stripe return flow', async t => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://bravo-k9-mern.vercel.app';
  t.after(() => previousOrigin === undefined ? delete process.env.APP_ORIGIN : process.env.APP_ORIGIN = previousOrigin);

  const booking = {
    _id: '68c20f8f5c734fa0f944ad10', userId: '68c20f8f5c734fa0f944ad11', status: 'requested', paymentStatus: 'unpaid',
    serviceIds: ['training', 'walking'], dogCount: 2,
    visits: [{ date: '2026-09-21', time: '10:00', service: 'walking' }],
  };
  booking.quote = quote(booking.serviceIds, booking.visits, { dogCount: booking.dogCount });
  const user = { _id: booking.userId, email: 'client@example.test', name: 'Bravo Client', stripeCustomerId: 'cus_test_bravo' };
  let persistedParams;
  t.mock.method(Subscription, 'find', () => query([]));
  t.mock.method(BillingLock, 'findOneAndUpdate', async () => ({}));
  t.mock.method(Booking, 'updateOne', async (_filter, change) => { if (change.$set?.checkoutParams) persistedParams = change.$set.checkoutParams; return { matchedCount: 1, modifiedCount: 1 }; });
  t.mock.method(Booking, 'findById', () => query({ ...booking, checkoutParams: persistedParams }));
  let received;
  const stripe = { checkout: { sessions: { create: async (params, options) => { received = { params, options }; return { id: 'cs_test_bravo', url: 'https://checkout.stripe.test/session', expires_at: 1789999999 }; } } } };

  const result = await checkout(booking, user, stripe);
  assert.equal(result.url, 'https://checkout.stripe.test/session');
  assert.equal(received.params.mode, 'subscription');
  assert.equal(received.params.customer, user.stripeCustomerId);
  assert.equal(received.params.line_items[0].price_data.unit_amount, 20000);
  assert.equal(received.params.line_items[0].price_data.recurring.interval, 'month');
  assert.equal(received.params.line_items[1].price_data.unit_amount, 10000);
  assert.equal(received.params.line_items[1].quantity, 1);
  assert.equal(received.params.line_items[1].price_data.recurring.interval, 'month');
  assert.equal(received.params.line_items[2].price_data.unit_amount, 2500);
  assert.equal(received.params.line_items[2].quantity, 2);
  assert.equal(received.params.subscription_data.metadata.dogCount, '2');
  assert.equal(received.params.line_items.reduce((total, line) => total + line.price_data.unit_amount * line.quantity, 0), booking.quote.dueNowCents);
  assert.equal(received.params.payment_method_types, undefined);
  assert.match(received.params.success_url, /payment=verifying&booking=68c20f8f5c734fa0f944ad10&session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.match(received.params.cancel_url, /payment=cancelled&booking=68c20f8f5c734fa0f944ad10$/);
  assert.equal(received.options.idempotencyKey, `bravo-checkout-${booking._id}`);
});
