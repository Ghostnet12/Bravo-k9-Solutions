import { readLessonLibrary } from './lesson-library.js';
import Stripe from 'stripe';
import { Booking, User, Subscription, StripeEvent, BillingLock, Lesson, Settings } from './models.js';
import { connectDb, transaction } from './db.js';
import { ALL_SERVICES, TRAINING_ADDITIONAL_DOG_CENTS, serviceSelection } from '../shared/catalog.js';
import { monthTerm } from '../shared/membership-terms.js';
export function stripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (/^(?:sk|rk)_live_/.test(key)) return 'live';
  if (/^(?:sk|rk)_test_/.test(key)) return 'test';
  return null;
}
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  const mode = stripeMode();
  if (!key || !mode || !process.env.STRIPE_WEBHOOK_SECRET) return null;
  if (mode === 'live' && process.env.STRIPE_LIVE_ENABLED !== 'true') return null;
  if (mode === 'test' && process.env.VERCEL_ENV === 'production' && process.env.STRIPE_TEST_CHECKOUT_ENABLED !== 'true') return null;
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 8000 });
}
export function validatedCheckoutPricing(booking) {
  const pricing = booking.quote;
  if (!pricing?.lines?.length || pricing.currency !== 'usd') throw new Error('This booking needs a fresh server quote before checkout.');
  if (booking.serviceIds.includes('training')) {
    const dogCount = booking.dogCount || 1;
    const expected = 20000 + (dogCount - 1) * TRAINING_ADDITIONAL_DOG_CENTS;
    const recorded = pricing.lines.filter(line => line.id === 'training' || line.id === 'training-additional-dogs').reduce((total, line) => total + line.unitCents * line.quantity, 0);
    if (recorded !== expected) throw Object.assign(new Error('Training pricing changed after this request was saved. Cancel it and create a new request before checkout.'), { status: 409 });
  }
  if (booking.serviceIds.includes('online')) {
    const expected = booking.serviceIds.includes('training') ? 5000 : 7500;
    const online = pricing.lines.filter(line => line.id === 'online');
    if (online.length !== 1 || online[0].quantity !== 1 || online[0].unitCents !== expected) throw Object.assign(new Error('Lesson pricing changed after this request was saved. Cancel it and create a new request before checkout.'), { status: 409 });
  }
  return pricing;
}
export async function checkout(booking, user, stripe) {
  if (booking.status === 'waitlisted') throw Object.assign(new Error('This request is on the trainer waiting list. No payment is due until a spot opens.'), { status: 409 });
  if (!stripe) throw Object.assign(new Error('Card payments are not connected yet. Your request is saved; Bravo will contact you.'), { status: 503 });
  if (booking.status === 'cancelled' || booking.paymentStatus !== 'unpaid') throw new Error('This booking does not need another payment.');
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Object.assign(new Error('Checkout is not configured yet.'), { status: 503 });
  const selected = serviceSelection(booking.serviceIds);
  if (selected.some(s => s.includes.includes('online')) && !(await readLessonLibrary()).open) throw Object.assign(new Error('Online lesson enrollment is closed.'), { status: 409 });
  if (selected.some(s => s.includes.includes('online')) && !(await Lesson.exists({ published: true }))) throw Object.assign(new Error('Online enrollment opens once the lesson library is ready. Please contact Bravo for updates.'), { status: 409 });
  const pricing = validatedCheckoutPricing(booking);
  const subscriptions = await Subscription.find({ userId: user._id, status: { $in: ['active', 'trialing'] }, validUntil: { $gt: new Date() } }).lean();
  const recurring = selected.filter(s => s.interval === 'month').flatMap(s => s.includes);
  if (!booking.renewalOf && subscriptions.some(sub => serviceSelection(sub.serviceIds, ALL_SERVICES).some(s => s.includes.some(i => recurring.includes(i))))) throw Object.assign(new Error('An existing membership overlaps this purchase. Use Renew membership from your account to purchase the next month.'), { status: 409 });
  const lockId = String(user._id), bookingId = String(booking._id);
  // One purchase at a time per customer. Never expire a local lock before Stripe's session expires.
  let lockAcquired = false;
  try {
    await BillingLock.findOneAndUpdate({ _id: lockId, $or: [{ bookingId }, { expiresAt: { $lt: new Date() } }] }, { $set: { bookingId, expiresAt: new Date(Date.now() + 31 * 60 * 1000) } }, { upsert: true });
    lockAcquired = true;
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Recover a lock left by an attempt that failed before Stripe created a session.
    const existingLock = await BillingLock.findById(lockId).lean();
    const lockedBooking = existingLock?.bookingId
      ? await Booking.findById(existingLock.bookingId).select('stripeSessionId checkoutStarting').lean()
      : null;
    if (existingLock && new Date(existingLock.expiresAt).getTime() <= Date.now() + 30 * 60 * 1000 && lockedBooking && !lockedBooking.stripeSessionId && !lockedBooking.checkoutStarting) {
      // Compare-and-swap: never delete a lock and then overwrite another buyer's acquisition.
      const recovered = await BillingLock.findOneAndUpdate({ _id: lockId, bookingId: existingLock.bookingId, expiresAt: existingLock.expiresAt }, { $set: { bookingId, expiresAt: new Date(Date.now() + 31 * 60 * 1000) } });
      lockAcquired = !!recovered;
    }
    if (!lockAcquired) throw Object.assign(new Error('You already have a checkout in progress. Finish or cancel that request first.'), { status: 409 });
  }
  let requestSent = false;
  try {
    if (booking.stripeSessionId) {
      const current = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
      if (current.status === 'open' && current.mode !== 'subscription') return { url: current.url };
      if (current.status === 'open' && current.mode === 'subscription') {
        await stripe.checkout.sessions.expire(current.id);
        throw Object.assign(new Error('This saved checkout used automatic billing and has been closed. Cancel this unpaid request and create a new one with manual renewal.'), { status: 409 });
      }
      if (current.status === 'complete') throw Object.assign(new Error('Payment is being verified. Please refresh your account shortly.'), { status: 409 });
      throw Object.assign(new Error('This checkout expired. Cancel this request and create a new one to pay.'), { status: 409 });
    }
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { app: 'bravo-k9', userId: String(user._id) } }, { idempotencyKey: `bravo-customer-${user._id}` });
      customerId = customer.id;
      await User.updateOne({ _id: user._id }, { $set: { stripeCustomerId: customerId } });
    }
    const metadata = { app: 'bravo-k9', billing: 'manual-month-v1', userId: String(user._id), bookingId, dogCount: String(booking.dogCount || 1), serviceIds: JSON.stringify(booking.serviceIds.filter(id => selected.find(s => s.id === id).interval === 'month')) };
    const params = {
      mode: 'payment', customer: customerId,
      client_reference_id: bookingId, metadata,
      line_items: pricing.lines.filter(l => l.quantity > 0).map(line => ({
        quantity: line.quantity, price_data: { currency: 'usd', unit_amount: line.unitCents, product_data: { name: `Bravo K9 — ${line.name}${line.interval === 'month' ? ' (one month, manual renewal)' : ''}` } },
      })),
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${origin}/account?payment=verifying&booking=${encodeURIComponent(bookingId)}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/account?payment=cancelled&booking=${encodeURIComponent(bookingId)}`,
    };
    // Persist identical parameters before calling Stripe, including the expiry timestamp.
    // A network retry must not change parameters under the same idempotency key.
    await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' }, paymentStatus: 'unpaid', updatedAt: booking.updatedAt, checkoutParams: { $exists: false } }, { $set: { checkoutParams: params, checkoutStarting: true } });
    // Every retry must restore the guard, even when its immutable parameters already exist.
    const guarded = await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' }, paymentStatus: 'unpaid', checkoutParams: { $exists: true } }, { $set: { checkoutStarting: true } });
    if (!guarded.matchedCount) throw Object.assign(new Error('This request changed before checkout began. Refresh your account and try again.'), { status: 409 });
    const attempt = await Booking.findById(booking._id).select('+checkoutParams');
    if (!attempt?.checkoutParams || attempt.status === 'cancelled' || attempt.paymentStatus !== 'unpaid') throw new Error('This booking changed before checkout began.');
    if (attempt.checkoutParams.mode === 'subscription') throw Object.assign(new Error('This saved request uses retired automatic billing. Cancel it and create a fresh request with manual renewal.'), { status: 409 });
    requestSent = true;
    const session = await stripe.checkout.sessions.create(attempt.checkoutParams, { idempotencyKey: `bravo-checkout-${bookingId}` });
    await Booking.updateOne({ _id: booking._id }, { $set: { stripeSessionId: session.id, checkoutUrl: session.url, checkoutExpiresAt: new Date(session.expires_at * 1000), checkoutStarting: false } });
    if (selected.some(s => s.includes.includes('online')) && !(await readLessonLibrary()).open) { await stripe.checkout.sessions.expire(session.id); throw Object.assign(new Error('Online lesson enrollment closed while checkout was opening. No new payment can be started.'), { status: 409 }); }
    return { url: session.url };
  } catch (error) {
    // A timeout can mean Stripe created the session but its response was lost.
    // Keep the guard and identical idempotency key so retrying safely recovers it.
    const uncertain = requestSent && !['StripeInvalidRequestError', 'StripeAuthenticationError', 'StripePermissionError', 'StripeCardError'].includes(error.type);
    if (!uncertain) await Promise.allSettled([
      BillingLock.deleteOne({ _id: lockId, bookingId }),
      Booking.updateOne({ _id: bookingId, stripeSessionId: { $exists: false } }, { $set: { checkoutStarting: false } }),
    ]);
    if (uncertain) throw Object.assign(new Error('Stripe is still confirming this checkout. Retry secure checkout from the same saved request; do not create another booking.'), { status: 409 });
    throw error;
  }
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
      const dogCount = Math.max(1, Math.min(10, Number.parseInt(sub.metadata.dogCount || '1', 10) || 1));
      // Historical subscriptions must keep syncing even after a program retires.
      serviceSelection(ids, ALL_SERVICES);
      const user = await User.findById(sub.metadata.userId).session(session);
      if (!user || user.stripeCustomerId !== (typeof sub.customer === 'string' ? sub.customer : sub.customer.id)) throw new Error('Subscription owner mismatch.');
      const previous = await Subscription.findOne({ stripeId: sub.id }).session(session);
      if (!previous || (previous.lastEventAt || 0) <= event.created) {
        const periods = sub.items.data.map(item => item.current_period_end).filter(Boolean);
        const until = sub.current_period_end || (periods.length ? Math.min(...periods) : 0);
        const starts = sub.items.data.map(item => item.current_period_start).filter(Boolean);
        const from = sub.current_period_start || (starts.length ? Math.max(...starts) : sub.start_date);
        // Preserve staff-issued days when Stripe repeats the original paid end date.
        const paidEnd = new Date(until * 1000);
        const effectiveEnd = previous?.creditedUntil > paidEnd ? previous.creditedUntil : paidEnd;
        await Subscription.updateOne({ stripeId: sub.id }, { $set: { userId: user._id, serviceIds: ids, dogCount, status: sub.status, validFrom: new Date(from * 1000), validUntil: effectiveEnd, autoPayDisabled: !!sub.cancel_at_period_end || sub.status === 'canceled', source: 'stripe', lastEventAt: event.created } }, { upsert: true, session });
      }
    }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && object.metadata?.app === 'bravo-k9' && object.payment_status === 'paid') {
      const booking = await Booking.findById(object.metadata.bookingId).session(session);
      if (!booking || String(booking.userId) !== object.metadata.userId) throw new Error('Booking owner mismatch.');
      if (object.currency !== 'usd' || object.amount_total !== booking.quote.dueNowCents) throw new Error('Checkout amount mismatch.');
      const user = await User.findById(booking.userId).session(session);
      if (!user?.stripeCustomerId || user.stripeCustomerId !== (typeof object.customer === 'string' ? object.customer : object.customer?.id) || object.client_reference_id !== String(booking._id)) throw new Error('Checkout customer mismatch.');
      if (booking.stripeSessionId && booking.stripeSessionId !== object.id) throw new Error('Checkout session mismatch.');
      // A late, distinct completion event must never undo a refund already recorded.
      if (booking.refundId || booking.paymentStatus === 'refunded') return;
      const paidAt = new Date(event.created * 1000);
      await User.updateOne({ _id: booking.userId }, { $min: { firstPaidAt: paidAt } }, { session });
      await Booking.updateOne({ _id: booking._id }, { $min: { paidAt } }, { session });

      if (object.mode === 'payment' && object.metadata.billing === 'manual-month-v1' && booking.quote.monthlyCents > 0 && booking.status !== 'cancelled') {
        const ids = serviceSelection(booking.serviceIds).filter(service => service.interval === 'month').map(service => service.id);
        let start = new Date(event.created * 1000);
        if (booking.renewalOf) {
          // A simultaneous day credit must finish before the next month is dated.
          await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
          const previous = await Subscription.findOne({ stripeId: booking.renewalOf, userId: booking.userId }).session(session);
          if (!previous) throw new Error('Renewal membership not found.');
          if (previous.validUntil > start) start = previous.validUntil;
        }
        const term = monthTerm(start);
        const saved = await Subscription.findOneAndUpdate({ stripeId: `manual:${booking._id}` }, { $setOnInsert: { userId: booking.userId, serviceIds: ids, dogCount: booking.dogCount, status: 'active', source: 'manual', autoPayDisabled: true, bookingId: booking._id, renewalOf: booking.renewalOf, ...term } }, { upsert: true, returnDocument: 'after', session });
        await Booking.updateOne({ _id: booking._id }, { $set: { termStartsAt: saved.validFrom, termEndsAt: saved.validUntil } }, { session });
      }
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
  if (!stripe) throw Object.assign(new Error('Refunds are temporarily unavailable.'), { status: 503 });
  if (booking.paymentStatus === 'refunded') throw Object.assign(new Error('This booking already has a refund recorded.'), { status: 409 });
  if (!['paid', 'review'].includes(booking.paymentStatus) || !booking.stripeSessionId) throw new Error('Only a verified payment can be refunded.');
  const reserved = await Booking.updateOne({ _id: booking._id, paymentStatus: { $in: ['paid', 'review'] }, $or: [{ refundId: { $exists: false } }, { refundId: booking.refundId || 'pending' }] }, { $set: { refundId: booking.refundId || 'pending', refundedBy: owner._id } });
  if (!reserved.matchedCount) throw Object.assign(new Error('This refund changed. Refresh the desk.'), { status: 409 });
  let requestSent = false;
  try {
    const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
    let intent = booking.stripePaymentIntentId || (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id);
    if (!intent && session.invoice) {
      // Current Stripe APIs map invoices to intents through Invoice Payments.
      const payments = await stripe.invoicePayments.list({ invoice: typeof session.invoice === 'string' ? session.invoice : session.invoice.id, status: 'paid', limit: 100 });
      const candidates = payments.data.filter(payment => payment.payment?.type === 'payment_intent');
      if (!payments.has_more && candidates.length === 1) intent = typeof candidates[0].payment.payment_intent === 'string' ? candidates[0].payment.payment_intent : candidates[0].payment.payment_intent?.id;
    }
    if (!intent) throw new Error('Stripe has no refundable payment attached to this booking. Review the transaction in Stripe.');
    const amountCents = Number(booking.quote?.dueNowCents || session.amount_total);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('The verified refund amount is unavailable.');
    requestSent = true;
    const refund = booking.refundId && booking.refundId !== 'pending'
      ? await stripe.refunds.retrieve(booking.refundId)
      : await stripe.refunds.create({ payment_intent: intent, amount: amountCents, metadata: { app: 'bravo-k9', bookingId: String(booking._id) } }, { idempotencyKey: `bravo-refund-${booking._id}` });
    if (refund.amount !== amountCents || refund.currency !== 'usd') throw new Error('Refund verification mismatch. Review the transaction in Stripe.');
    if (refund.status === 'succeeded' && booking.quote?.monthlyCents > 0) await Subscription.updateOne({ stripeId: `manual:${booking._id}` }, { $set: { status: 'refunded' } });
    await Booking.updateOne({ _id: booking._id, paymentStatus: { $ne: 'refunded' }, refundId: { $in: ['pending', refund.id] } }, { $set: { refundId: refund.id, refundStatus: refund.status, refundAmountCents: amountCents, ...(refund.status === 'succeeded' ? { refundedAt: new Date() } : {}), paymentStatus: refund.status === 'succeeded' ? 'refunded' : 'review' } });
    return { ok: true, refundId: refund.id, amountCents, message: `${refund.status === 'succeeded' ? 'Refund succeeded through Stripe.' : `Stripe refund status: ${refund.status}. Check its status again before taking further action.`} Any subscription remains active until separately changed in billing.` };
  } catch (error) {
    // Keep ambiguous requests recoverable with the same immutable idempotency key.
    if (!requestSent) await Booking.updateOne({ _id: booking._id, refundId: 'pending' }, { $unset: { refundId: 1, refundedBy: 1 } });
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
