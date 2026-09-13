import express from 'express';
import { bookingTrainerIds, trainerChoice, scheduledTrainerLabel } from '../shared/trainers.js';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DateTime } from 'luxon';
import { z } from 'zod';
import memberApp, { MemberAccess } from './member-app.js';
import { connectDb, transaction } from './db.js';
import { User, Booking, Subscription, DirectMessage, Notification, NotificationRead, PasswordReset, Session, AuditEvent, RateBucket, Settings, Slot } from './models.js';
import { identify, requireUser, requireOwner, requireStaff, sameOrigin, rateLimit, digest, hashPassword, verifyPassword } from './auth.js';
import { quote, serviceSelection, ALL_SERVICES } from '../shared/catalog.js';
import { effectiveServices } from './services.js';
import { membershipNotifications } from './membership-notifications.js';
import { chatFilter } from './chat-state.js';
import { MEMBERSHIP_ZONE } from '../shared/membership-terms.js';
import { monthTerm } from '../shared/membership-terms.js';
import { availability, dateTime, HOURS } from './scheduling.js';
import { checkTrainerVisits } from './trainer-schedules.js';
import { openWeekend, addTrainingVisit } from './weekend-sessions.js';
import { saveScheduleChanges } from './schedule-changes.js';
import { trainerClients, acceptClient } from './trainer-clients.js';
import { stripeClient, processStripeEvent } from './payments.js';

const app = express();
app.disable('x-powered-by'); app.set('trust proxy', process.env.VERCEL ? 1 : false);
const session = [helmet(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, cookieParser(), async (_req, _res, next) => { await connectDb(); next(); }, identify, rateLimit('api', 240, 60000)];
const write = [sameOrigin, express.json({ limit: '8kb' })];
const id = z.string().regex(/^[a-f\d]{24}$/i);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const staff = user => ['staff', 'owner'].includes(user.role);
const audience = user => staff(user) ? { $or: [{ staff: true }, { staff: false, userId: user._id }] } : { staff: false, userId: user._id };

app.get('/api/client-schedule', ...session, requireUser, async (req, res) => {
  const input = z.object({ client: id.optional(), month: z.string().regex(/^\d{4}-\d{2}$/), format: z.enum(['pdf']).optional() }).parse(req.query);
  const client = input.client || String(req.user._id);
  if (client !== String(req.user._id) && !staff(req.user)) throw fail('You can only view your own schedule.', 403);
  const start = DateTime.fromISO(`${input.month}-01`, { zone: MEMBERSHIP_ZONE });
  if (!start.isValid) throw fail('Choose a valid month.');
  const person = await User.findById(client).select('name firstPaidAt').lean();
  if (!person) throw fail('Client not found.', 404);
  const records = await Booking.find({ userId: client, $or: [{ 'visits.date': { $gte: start.toISODate(), $lt: start.plus({ months: 1 }).toISODate() } }, { 'cancelledVisits.date': { $gte: start.toISODate(), $lt: start.plus({ months: 1 }).toISODate() } }] }).select('visits cancelledVisits paidAt dogName dogCount serviceIds trainingFocus status paymentStatus staffId staffIds requestedStaffId requestedStaffIds trainerAcceptedIds trainerAcceptanceRequired trainerAcceptedAt termStartsAt termEndsAt').populate({path:'staffId',model:User,select:'name'}).populate({path:'staffIds',model:User,select:'name'}).sort({ createdAt: 1 }).lean();
  const visits = records.flatMap(record => [...record.visits, ...(record.cancelledVisits || []).map(v => ({ ...v, cancelled: true }))].filter(visit => visit.date.startsWith(input.month)).map(visit => ({ ...visit, bookingId: String(record._id), dogName: record.dogName, dogCount: record.dogCount, status: visit.cancelled ? 'cancelled' : record.status, staffId: record.staffId?._id || null, staffIds: bookingTrainerIds(record), trainerChoice: trainerChoice(record), paymentStatus: record.paymentStatus, trainer: scheduledTrainerLabel(record), trainingFocus: record.trainingFocus }))).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const terms = await Subscription.find({ userId: client }).select('stripeId serviceIds dogCount validFrom validUntil status autoPayDisabled renewalDeclined source').sort({ validUntil: -1 }).limit(100).lean();
  const first = await Booking.findOne({ userId: client, status: { $ne: 'cancelled' }, paymentStatus: { $in: ['paid', 'covered'] }, 'visits.0': { $exists: true } }).sort({ 'visits.date': 1 }).select('visits').lean();
  const paidTerms = terms.filter(t => t.source !== 'grant' && t.validFrom).sort((a,b) => a.validFrom - b.validFrom);
  const firstPayment = await Booking.findOne({ userId: client, paidAt: { $exists: true } }).sort({ paidAt: 1 }).select('paidAt').lean();
  const schedule = { firstPaidAt: person.firstPaidAt || firstPayment?.paidAt || paidTerms[0]?.validFrom || null, client: { id: client, name: person.name }, month: input.month, visits, terms, firstTrainingDay: first?.visits.map(visit => visit.date).sort()[0] || null };
  if (input.format === 'pdf') {
    const { schedulePdf } = await import('./schedule-pdf.js');
    const bytes = await schedulePdf(schedule);
    res.set('Content-Disposition', `attachment; filename="bravo-schedule-${input.month}.pdf"`);
    return res.type('application/pdf').send(bytes);
  }
  schedule.trainingBookings = await Booking.find({ userId:client, serviceIds: {$in:ALL_SERVICES.filter(s=>s.includes.includes('training')).map(s=>s.id)}, status:{$in:['requested','confirmed']},paymentStatus:{$in:['paid','covered']} }).select('dogName dogCount trainingFocus staffId staffIds requestedStaffId requestedStaffIds trainerAcceptedIds trainerAcceptanceRequired trainerAcceptedAt visits updatedAt').lean();
  res.json(schedule);
});
app.get('/api/admin/trainers/:id/clients', ...session, requireStaff, trainerClients);
app.post('/api/admin/bookings/:id/accept-client', ...session, requireStaff, ...write, acceptClient);
app.post('/api/admin/weekend-sessions', ...session, requireStaff, ...write, openWeekend);
app.post('/api/admin/training-visits', ...session, requireStaff, ...write, addTrainingVisit);
app.post('/api/client-schedule/changes', ...session, requireUser, sameOrigin, express.json({limit:'20kb'}), rateLimit('visit-change',30,3600000), saveScheduleChanges);
app.post('/api/client-schedule/visit', ...session, requireUser, ...write, rateLimit('visit-change', 30, 3600000), async (req, res) => {
  const visit = z.object({ date: z.string(), time: z.enum(HOURS), service: z.string() }).strict();
  const input = z.object({ bookingId: id, action: z.enum(['change', 'cancel', 'note']), original: visit, replacement: visit.optional(), note: z.string().trim().min(1).max(1200) }).strict().parse(req.body);
  await transaction(async session => {
    const booking = await Booking.findById(input.bookingId).session(session);
    if (!booking || (String(booking.userId) !== String(req.user._id) && !staff(req.user))) throw fail('Schedule not found.', 404);
    if (req.user.mutedUntil && req.user.mutedUntil > new Date()) throw fail('Messaging is temporarily paused for this account.', 403);
    const same = v => v.date === input.original.date && v.time === input.original.time && v.service === input.original.service;
    if (!booking.visits.some(same)) throw fail('This visit changed. Refresh your schedule.', 409);
    if (input.action !== 'note') {
      if (!['requested', 'confirmed'].includes(booking.status) || !['paid', 'covered'].includes(booking.paymentStatus)) throw fail('Contact Bravo to change this unpaid or inactive request.', 409);
      if (dateTime(input.original.date, input.original.time).toJSDate() <= new Date()) throw fail('Past visits cannot be changed.', 400);
      const team = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
      if (input.action === 'change') {
        const next = input.replacement;
        if (!next || next.service !== input.original.service) throw fail('Choose a replacement for the same service.', 400);
        if (same(next)) throw fail('Choose a different day or time.', 400);
        const when = dateTime(next.date, next.time);
        if (when.diff(DateTime.now(), 'days').days > 92) throw fail('Choose a date within 92 days.', 400);
        if (!availability({ from: next.date, to: next.date, settings: team })[0].slots.includes(next.time)) throw fail('This time is not available.', 409);
        await checkTrainerVisits(bookingTrainerIds(booking), [next], team, session);
        if (next.service === 'training') {
          const terms = await Subscription.find({ userId: booking.userId, status: { $in: ['active', 'trialing', 'canceled'] }, serviceIds: { $in: ALL_SERVICES.filter(s => s.includes.includes('training')).map(s => s.id) } }).session(session).lean();
          if (!terms.some(t => t.validFrom && when.toJSDate() >= t.validFrom && when.toJSDate() < t.validUntil)) throw fail('Choose a date within your paid membership month.', 400);
        }
        if (booking.visits.some(v => v.date === next.date && v.time === next.time)) throw fail('You already have a visit at that time.', 409);
        if (await Slot.exists({ _id: `${next.date}|${next.time}` }).session(session)) throw fail('This time was just taken. Choose another.', 409);
        await Slot.create([{ _id: `${next.date}|${next.time}`, date: next.date, time: next.time, bookingId: booking._id }], { session });
        booking.visits = booking.visits.map(v => same(v) ? next : v);
        booking.status = 'requested';
      } else {
        booking.cancelledVisits.push(input.original);
        booking.visits = booking.visits.filter(v => !same(v));
      }
      await Slot.deleteOne({ _id: `${input.original.date}|${input.original.time}`, bookingId: booking._id }, { session });
      await booking.save({ session });
    }
    const action = input.action === 'note' ? 'Note about' : input.action === 'cancel' ? 'Cancelled' : 'Requested a change to';
    const body = `${req.user.name}: ${action} ${input.original.date} at ${input.original.time}${input.action === 'change' ? ` → ${input.replacement.date} at ${input.replacement.time}` : ''}. ${input.note}`;
    await Notification.create([{ _id: `visit:${randomBytes(16).toString('hex')}`, staff: true, body, href: `/schedule?client=${booking.userId}&month=${(input.replacement?.date || input.original.date).slice(0,7)}` }], { session });
    if (staff(req.user)) await Notification.create([{_id:`visit-client:${randomBytes(16).toString('hex')}`,staff:false,userId:booking.userId,body,href:`/schedule?month=${(input.replacement?.date||input.original.date).slice(0,7)}`}],{session});
    await DirectMessage.create([{ memberId: booking.userId, senderId: req.user._id, senderName: req.user.name, senderRole: req.user.role, body }], { session });
    await AuditEvent.create([{ actorId: req.user._id, action: `visit.${input.action}`, targetType: 'booking', targetId: String(booking._id), details: { original: input.original, replacement: input.replacement } }], { session });
  });
  res.json({ ok: true, message: 'Saved. The whole Bravo team has been notified. Payments and membership end dates are unchanged.' });
});

app.get('/api/membership-terms', ...session, requireUser, async (req, res) => {
  res.json({ terms: await Subscription.find({ userId: req.user._id }).select('stripeId serviceIds dogCount validFrom validUntil status autoPayDisabled renewalDeclined renewalOf source').sort({ validUntil: -1 }).limit(100).lean() });
});
app.post('/api/membership-terms/renew', ...session, requireUser, ...write, rateLimit('renewal', 20, 3600000), async (req, res) => {
  const input = z.object({ termId: z.string().max(150), requestKey: z.string().uuid() }).strict().parse(req.body);
  const term = await Subscription.findOne({ stripeId: input.termId, userId: req.user._id }).lean();
  if (!term || !['active', 'trialing', 'canceled'].includes(term.status)) throw fail('Choose an eligible membership.', 404);
  if (new Date(term.validUntil) > new Date(Date.now() + 7 * 86400000)) throw fail('Renewal opens seven days before this month ends.');
  if (term.source === 'grant') throw fail('This month was activated by Bravo. Contact the team to extend your Member access.');
  if (term.stripeId.startsWith('sub_') && !term.autoPayDisabled) throw fail('Bravo must switch this existing plan to manual renewal first. Contact the team before paying again.', 409);
  if (await Subscription.exists({ userId: req.user._id, renewalOf: term.stripeId, status: 'active' })) throw fail('This month has already been renewed. Refresh your account.', 409);
  const catalog = await effectiveServices();
  const ids = serviceSelection(term.serviceIds, catalog).filter(item => item.interval === 'month').map(item => item.id);
  if (!ids.length) throw fail('Contact Bravo to choose a current training plan.');
  const existing = await Booking.findOne({ userId: req.user._id, renewalOf: term.stripeId, status: { $ne: 'cancelled' }, paymentStatus: { $in: ['unpaid', 'paid'] } });
  if (existing) return res.json({ booking: existing });
  // A term-key is deterministic so simultaneous taps cannot create two renewals.
  const booking = await Booking.findOneAndUpdate({ userId: req.user._id, requestKey: `renew:${term.stripeId}` }, { $setOnInsert: { renewalOf: term.stripeId, serviceIds: ids, dogCount: term.dogCount || 1, dogName: req.user.dogName || 'Training membership', phone: req.user.phone, visits: [], quote: quote(ids, [], { dogCount: term.dogCount || 1 }, catalog), status: 'requested', paymentStatus: 'unpaid' } }, { upsert: true, returnDocument: 'after' });
  if (booking.status === 'cancelled') throw fail('Contact Bravo to reopen this cancelled renewal request.', 409);
  res.json({ booking });
});
app.post('/api/membership-terms/decline', ...session, requireUser, ...write, async (req, res) => {
  const { termId } = z.object({ termId: z.string().max(150) }).strict().parse(req.body);
  const term = await Subscription.findOneAndUpdate({ stripeId: termId, userId: req.user._id, autoPayDisabled: true }, { $set: { renewalDeclined: true } });
  if (!term) throw fail('This plan needs staff assistance before ending automatic billing.', 409);
  await Notification.updateOne({ _id: `declined:${termId}` }, { $setOnInsert: { userId: req.user._id, staff: true, body: `${req.user.name} chose not to renew their membership. Paid access remains through its end date.`, href: `/schedule?client=${req.user._id}` } }, { upsert: true });
  res.json({ ok: true });
});
app.get('/api/notifications', ...session, requireUser, async (req, res) => {
  // Authenticated visits repair missed reminders; cron covers signed-out periods.
  const key = `membership-notifications:${Math.floor(Date.now() / 300000)}`;
  let lease;
  try { lease = await RateBucket.updateOne({ _id: key }, { $setOnInsert: { count: 1, expiresAt: new Date(Date.now() + 600000) } }, { upsert: true }); } catch (error) { if (error.code !== 11000) throw error; }
  if (lease?.upsertedCount) { try { await membershipNotifications(); } catch { await RateBucket.deleteOne({ _id: key }); } }

  const reads = await NotificationRead.find({ userId: req.user._id }).lean();
  const readIds = new Set(reads.map(row => row.notificationId));
  const notices = await Notification.find({...audience(req.user),_id:{$nin:[...readIds]}}).sort({ createdAt: -1 }).limit(100).lean();
  const messages = staff(req.user) ? await DirectMessage.find({ senderRole: 'member', deleted: false, ...await chatFilter(req.user, 'inbox'), _id: { $nin: reads.filter(row => row.messageId).map(row => row.messageId) } }).sort({ createdAt: -1 }).limit(100).select('memberId senderName createdAt').lean() : [];
  res.json({ items: [...messages.map(message => ({ id: `message:${message._id}`, body: `New client message from ${message.senderName}`, href: `/admin?tab=messages&client=${message.memberId}`, unread: true })), ...notices.map(item => ({ id: item._id, body: item.body, href: item.href, unread: !readIds.has(item._id) }))] });
});
app.post('/api/notifications/read', ...session, requireUser, ...write, async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().max(240)).max(200) }).strict().parse(req.body);
  const notifications = await Notification.find({ ...audience(req.user), _id: { $in: ids } }).select('_id').lean();
  const messageIds = ids.filter(key => /^message:[a-f\d]{24}$/i.test(key)).map(key => key.slice(8));
  const messages = staff(req.user) ? await DirectMessage.find({ _id: { $in: messageIds }, senderRole: 'member', deleted: false }).select('_id').lean() : [];
  for (const item of [...notifications.map(row => ({ notificationId: row._id })), ...messages.map(row => ({ messageId: row._id, notificationId: `message:${row._id}` }))]) await NotificationRead.updateOne({ _id: `${req.user._id}:${item.notificationId}` }, { $setOnInsert: { userId: req.user._id, ...item } }, { upsert: true });
  res.json({ ok: true });
});
app.post('/api/admin/recovery/:id', ...session, requireUser, requireOwner, ...write, rateLimit('recovery', 6, 3600000), async (req, res) => {
  const targetId = id.parse(req.params.id);
  const { currentPassword } = z.object({ currentPassword: z.string().min(1).max(128) }).strict().parse(req.body);
  const actor = await User.findById(req.user._id).select('+passwordHash');
  if (!actor || actor.blocked || actor.role !== 'owner' || !await verifyPassword(currentPassword, actor.passwordHash)) throw fail('Confirm your administrator password.', 403);
  const target = await User.findOne({ _id: targetId, role: 'member', blocked: false }).select('name');
  if (!target) throw fail('Choose an unblocked client account.', 404);
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60000);
  await transaction(async dbSession => {
    await PasswordReset.deleteMany({ userId: targetId }, { session: dbSession });
    await PasswordReset.create([{ _id: digest(token), userId: targetId, expiresAt }], { session: dbSession });
    await AuditEvent.create([{ actorId: actor._id, action: 'password.recovery-issued', targetType: 'user', targetId }], { session: dbSession });
  });
  res.json({ url: `${process.env.APP_ORIGIN}/reset-password#${token}`, expiresAt });
});
app.post('/api/auth/recover', ...session, ...write, rateLimit('recovery-complete', 10, 3600000), async (req, res) => {
  const input = z.object({ token: z.string().regex(/^[a-f\d]{64}$/), password: z.string().min(12).max(128) }).strict().parse(req.body);
  const passwordHash = await hashPassword(input.password);
  await transaction(async dbSession => {
    const reset = await PasswordReset.findOneAndDelete({ _id: digest(input.token), expiresAt: { $gt: new Date() } }, { session: dbSession });
    if (!reset) throw fail('This recovery link is invalid or expired. Ask Bravo for a new link.', 400);
    const result = await User.updateOne({ _id: reset.userId, role: 'member', blocked: false }, { $set: { passwordHash } }, { session: dbSession });
    if (!result.matchedCount) throw fail('Contact Bravo for account assistance.', 403);
    await Session.deleteMany({ userId: reset.userId }, { session: dbSession });
    await AuditEvent.create([{ actorId: reset.userId, action: 'password.recovered', targetType: 'user', targetId: String(reset.userId) }], { session: dbSession });
  });
  res.json({ ok: true });
});
app.get('/api/cron/memberships', async (req, res) => {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const supplied = Buffer.from(req.get('authorization') || '');
  if (!expected || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'Unauthorized' });
  await connectDb();
  res.set('Cache-Control', 'no-store').json({ ok: true, created: await membershipNotifications() });
});
// Explicit owner control also lets the team complete migration using the site's
// existing Stripe integration, without exposing any API credentials.
app.post('/api/admin/manual-renewal', ...session, requireUser, requireOwner, ...write, rateLimit('billing-migration', 4, 3600000), async (req, res) => {
  z.object({ confirm: z.literal(true) }).strict().parse(req.body);
  const stripe = stripeClient();
  if (!stripe) throw fail('Stripe is not connected.', 503);
  let changed = 0;
  for await (const sub of stripe.subscriptions.list({ limit: 100 })) {
    if (sub.metadata?.app !== 'bravo-k9' || !['active', 'trialing'].includes(sub.status)) continue;
    const owner = await User.findOne({ _id: sub.metadata.userId, stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id });
    if (!owner) continue;
    const current = sub.cancel_at_period_end ? sub : await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true }, { idempotencyKey: `bravo-manual-renewal-v1:${sub.id}` });
    await processStripeEvent({ id: `manual-renewal:${sub.id}`, type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000), data: { object: current } }, stripe);
    changed++;
  }
  // Existing indefinite lesson grants get a full month of transition access.
  // Keep the original activation date rather than inventing a first visit.
  const grants = await MemberAccess.find({ enabled: true, endsAt: { $exists: false } }).lean();
  for (const grant of grants) await transaction(async dbSession => {
    const end = monthTerm().validUntil;
    const result = await MemberAccess.updateOne({ _id: grant._id, enabled: true, endsAt: { $exists: false } }, { $set: { startsAt: grant.createdAt || new Date(), endsAt: end }, $inc: { revision: 1 } }, { session: dbSession });
    if (result.modifiedCount) await Subscription.updateOne({ stripeId: `grant:${grant._id}:migration` }, { $setOnInsert: { userId: grant._id, serviceIds: ['online'], source: 'grant', autoPayDisabled: true, status: 'active', validFrom: grant.createdAt || new Date(), validUntil: end } }, { upsert: true, session: dbSession });
  });
  await AuditEvent.create({ actorId: req.user._id, action: 'billing.manual-renewal', details: { changed } });
  res.json({ changed, message: `${changed} Bravo plans now end at their paid period end. No refunds or new charges were created.` });
});
app.get('/api/admin/membership-status', ...session, requireUser, requireOwner, async (_req, res) => {
  res.json({ remindersConfigured: !!process.env.CRON_SECRET, automaticPlans: await Subscription.countDocuments({ stripeId: /^sub_/, status: { $in: ['active', 'trialing'] }, autoPayDisabled: { $ne: true }, validUntil: { $gt: new Date() } }) });
});
app.use(memberApp);
app.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  const status = error instanceof z.ZodError ? 400 : Number(error.status) || 500;
  res.status(status).json({ error: error instanceof z.ZodError ? 'Check the form fields and try again.' : status >= 500 ? 'This operation could not be completed. Please try again.' : error.message });
});
export default app;
