import Stripe from 'stripe';
import { Booking, User, Subscription, StripeEvent, BillingLock, Lesson } from './models.js';
import { connectDb, transaction } from './db.js';
import { ALL_SERVICES, serviceSelection } from '../shared/catalog.js';
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !process.env.STRIPE_WEBHOOK_SECRET || (key.startsWith('sk_live_') && process.env.STRIPE_LIVE_ENABLED !== 'true')) return null;
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 12000 });
}
export async function checkout(booking, user, stripe) {
  if (!stripe) throw Object.assign(new Error('Card payments are not connected yet. Your request is saved; Bravo will contact you.'), { status: 503 });
  if (booking.status === 'cancelled' || ['paid', 'covered'].includes(booking.paymentStatus)) throw new Error('This booking does not need another payment.');
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Object.assign(new Error('Checkout is not configured yet.'), { status: 503 });
  const selected = serviceSelection(booking.serviceIds);
  if (selected.some(s => s.includes.includes('online')) && !(await Lesson.exists({ published: true }))) throw Object.assign(new Error('Online enrollment opens once the lesson library is ready. Please contact Bravo for updates.'), { status: 409 });
  const subscriptions = await Subscription.find({ userId: user._id, status: { $nin: ['canceled', 'incomplete_expired'] } }).lean();
  const recurring = selected.filter(s => s.interval === 'month').flatMap(s => s.includes);
  if (subscriptions.some(sub => serviceSelection(sub.serviceIds, ALL_SERVICES).some(s => s.includes.some(i => recurring.includes(i))))) throw Object.assign(new Error('An existing membership overlaps this purchase. Manage it in Billing or contact Bravo before changing plans.'), { status: 409 });
  const lockId = String(user._id), bookingId = String(booking._id);
  // One purchase at a time per customer. Never expire a local lock before Stripe's session expires.
  try {
    await BillingLock.findOneAndUpdate({ _id: lockId, $or: [{ bookingId }, { expiresAt: { $lt: new Date() } }] }, { $set: { bookingId, expiresAt: new Date(Date.now() + 31 * 60 * 1000) } }, { upsert: true });
  } catch (error) {
    if (error.code === 11000) throw Object.assign(new Error('You already have a checkout in progress. Finish or cancel that request first.'), { status: 409 });
    throw error;
  }
  if (booking.stripeSessionId) {
    const current = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
    if (current.status === 'open') return { url: current.url };
    if (current.status === 'complete') throw Object.assign(new Error('Payment is being verified. Please refresh your account shortly.'), { status: 409 });
    throw Object.assign(new Error('This checkout expired. Cancel this request and create a new one to pay.'), { status: 409 });
  }
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { app: 'bravo-k9', userId: String(user._id) } }, { idempotencyKey: `bravo-customer-${user._id}` });
    customerId = customer.id;
    await User.updateOne({ _id: user._id }, { $set: { stripeCustomerId: customerId } });
  }
  const pricing = booking.quote;
  if (!pricing?.lines?.length || pricing.currency !== 'usd') throw new Error('This booking needs a fresh server quote before checkout.');
  const metadata = { app: 'bravo-k9', userId: String(user._id), bookingId, serviceIds: JSON.stringify(booking.serviceIds.filter(id => selected.find(s => s.id === id).interval === 'month')) };
  const params = {
    mode: pricing.monthlyCents ? 'subscription' : 'payment', customer: customerId,
    client_reference_id: bookingId, metadata,
    line_items: pricing.lines.filter(l => l.quantity > 0).map(line => ({
      quantity: line.quantity, price_data: { currency: 'usd', unit_amount: line.unitCents, product_data: { name: `Bravo K9 — ${line.name}` }, ...(line.interval === 'month' ? { recurring: { interval: 'month' } } : {}) },
    })),
    ...(pricing.monthlyCents ? { subscription_data: { metadata } } : {}),
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${origin}/account?payment=verifying&booking=${encodeURIComponent(bookingId)}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/account?payment=cancelled&booking=${encodeURIComponent(bookingId)}`,
  };
  // Persist identical parameters before calling Stripe, including the expiry timestamp.
  // A network retry must not change parameters under the same idempotency key.
  await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' }, checkoutParams: { $exists: false } }, { $set: { checkoutParams: params, checkoutStarting: true } });
  const attempt = await Booking.findById(booking._id).select('+checkoutParams');
  if (!attempt?.checkoutParams || attempt.status === 'cancelled') throw new Error('This booking was cancelled before checkout began.');
  const session = await stripe.checkout.sessions.create(attempt.checkoutParams, { idempotencyKey: `bravo-checkout-${bookingId}` });
  await Booking.updateOne({ _id: booking._id }, { $set: { stripeSessionId: session.id, checkoutUrl: session.url, checkoutExpiresAt: new Date(session.expires_at * 1000), checkoutStarting: false } });
  return { url: session.url };
}
function subscriptionId(object) {
  const value = object.subscription || object.parent?.subscription_details?.subscription;
  return typeof value === 'string' ? value : value?.id;
}
export async function processStripeEvent(event, stripe) {
  if (await StripeEvent.exists({ _id: event.id })) return;
  const object = event.data.object;
  let sub;
  const subId = event.type.startsWith('customer.subscription.') ? object.id : subscriptionId(object);
  if (subId) sub = await stripe.subscriptions.retrieve(subId);
  await transaction(async session => {
    // Event insertion and fulfillment commit together, so failed processing can be retried safely.
    await StripeEvent.create([{ _id: event.id, type: event.type, processedAt: new Date() }], { session });
    if (sub?.metadata?.app === 'bravo-k9') {
      const ids = JSON.parse(sub.metadata.serviceIds || '[]');
      // Historical subscriptions must keep syncing even after a program retires.
      serviceSelection(ids, ALL_SERVICES);
      const user = await User.findById(sub.metadata.userId).session(session);
      if (!user || user.stripeCustomerId !== (typeof sub.customer === 'string' ? sub.customer : sub.customer.id)) throw new Error('Subscription owner mismatch.');
      const previous = await Subscription.findOne({ stripeId: sub.id }).session(session);
      if (!previous || (previous.lastEventAt || 0) <= event.created) {
        const periods = sub.items.data.map(item => item.current_period_end).filter(Boolean);
        const until = sub.current_period_end || (periods.length ? Math.min(...periods) : 0);
        await Subscription.updateOne({ stripeId: sub.id }, { $set: { userId: user._id, serviceIds: ids, status: sub.status, validUntil: new Date(until * 1000), lastEventAt: event.created } }, { upsert: true, session });
      }
    }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && object.metadata?.app === 'bravo-k9' && object.payment_status === 'paid') {
      const booking = await Booking.findById(object.metadata.bookingId).session(session);
      if (!booking || String(booking.userId) !== object.metadata.userId) throw new Error('Booking owner mismatch.');
      if (object.currency !== 'usd' || object.amount_total !== booking.quote.dueNowCents) throw new Error('Checkout amount mismatch.');
      await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: booking.status === 'cancelled' ? 'review' : 'paid', stripeSessionId: object.id, stripePaymentIntentId: typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id, checkoutStarting: false } }, { session });
      await BillingLock.deleteOne({ _id: object.metadata.userId, bookingId: String(booking._id) }, { session });
    }
    if (event.type === 'checkout.session.expired' && object.metadata?.app === 'bravo-k9') {
      await BillingLock.deleteOne({ _id: object.metadata.userId, bookingId: object.metadata.bookingId }, { session });
    }
    if (event.type === 'checkout.session.async_payment_failed' && object.metadata?.app === 'bravo-k9') {
      await Booking.updateOne({ _id: object.metadata.bookingId, userId: object.metadata.userId, paymentStatus: 'unpaid' }, { $set: { checkoutStarting: false } }, { session });
      await BillingLock.deleteOne({ _id: object.metadata.userId, bookingId: object.metadata.bookingId }, { session });
    }
  }).catch(async error => { if (error.code !== 11000 || !await StripeEvent.exists({ _id: event.id })) throw error; });
}
export async function refundBooking(booking, owner, stripe) {
  if (booking.paymentStatus === 'refunded' || booking.refundId) throw Object.assign(new Error('This booking already has a refund recorded.'), { status: 409 });
  if (booking.paymentStatus !== 'paid' || !booking.stripeSessionId) throw new Error('Only a verified paid booking can be refunded.');
  const reserved = await Booking.updateOne({ _id: booking._id, paymentStatus: 'paid', refundId: { $exists: false } }, { $set: { refundId: 'pending', refundedBy: owner._id } });
  if (!reserved.modifiedCount) throw Object.assign(new Error('A refund is already in progress or completed.'), { status: 409 });
  try {
    const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId, { expand: ['payment_intent', 'invoice.payment_intent'] });
    const intent = booking.stripePaymentIntentId || (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id) || (typeof session.invoice?.payment_intent === 'string' ? session.invoice.payment_intent : session.invoice?.payment_intent?.id);
    if (!intent) throw new Error('Stripe has no refundable payment attached to this booking. Review the transaction in Stripe.');
    const amountCents = Number(booking.quote?.dueNowCents || session.amount_total);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('The verified refund amount is unavailable.');
    const refund = await stripe.refunds.create({ payment_intent: intent, amount: amountCents, metadata: { app: 'bravo-k9', bookingId: String(booking._id), ownerId: String(owner._id) } }, { idempotencyKey: `bravo-refund-${booking._id}` });
    await Booking.updateOne({ _id: booking._id, refundId: 'pending' }, { $set: { refundId: refund.id, refundAmountCents: amountCents, refundedAt: new Date(), paymentStatus: 'refunded' } });
    return { ok: true, refundId: refund.id, amountCents, message: 'Refund submitted through Stripe. Any subscription remains active until separately changed in billing.' };
  } catch (error) {
    await Booking.updateOne({ _id: booking._id, refundId: 'pending' }, { $unset: { refundId: 1, refundedBy: 1 } });
    throw error;
  }
}
export async function stripeWebhook(req, res) {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).json({ error: 'Invalid webhook signature.' }); }
  try { await connectDb(); await processStripeEvent(event, stripe); return res.json({ received: true }); }
  catch { return res.status(500).json({ error: 'Payment synchronization failed; retry delivery.' }); }
}
