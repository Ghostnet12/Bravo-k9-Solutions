import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { User, Session, Booking, Slot, Settings, Message, Lesson, BillingLock } from './models.js';
import { hashPassword, verifyPassword, issueSession, identify, requireUser, requireStaff, signOut, publicUser, sameOrigin, rateLimit } from './auth.js';
import { createBooking, getAvailability, getEntitlements, cancelBooking } from './bookings.js';
import { stripeClient, stripeWebhook, checkout } from './payments.js';
import { LESSON_PREVIEWS, privatePath, protectedLesson } from './lessons.js';
import { DEFAULT_SCHEDULE, HOURS, autoSchedule, validateVisits, availability, dateTime } from './scheduling.js';
import { SERVICES, quote } from '../shared/catalog.js';

const app = express();
app.disable('x-powered-by');
// Vercel supplies a trusted proxy hop. Self-hosting defaults to no trusted proxy.
app.set('trust proxy', process.env.VERCEL ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null } } }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhook);
app.use(express.json({ limit: '32kb' }), cookieParser());
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', async (_req, res) => {
  let connected = false, schedule = DEFAULT_SCHEDULE;
  if (process.env.MONGODB_URI) { try { await connectDb(); schedule = await Settings.findById('schedule').lean(); connected = true; } catch { /* Honest setup state; never simulate persistence. */ } }
  res.json({ connected, paymentsReady: connected && !!stripeClient(), schedule, timezone: 'America/Chicago', services: SERVICES });
});
app.get('/api/lessons', async (_req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ lessons: LESSON_PREVIEWS });
  await connectDb();
  const stored = await Lesson.find().lean();
  const merged = new Map(LESSON_PREVIEWS.map(l => [l._id, l]));
  for (const lesson of stored) merged.set(lesson._id, lesson);
  res.json({ lessons: [...merged.values()] });
});
app.use('/api', sameOrigin, async (_req, _res, next) => { await connectDb(); next(); }, identify);
app.use('/api', rateLimit('api', 240, 60000));
const accountInput = z.object({ email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(12).max(128), name: z.string().trim().min(2).max(80) });
app.post('/api/auth/register', rateLimit('register', 5, 3600000), async (req, res) => {
  const input = accountInput.parse(req.body);
  const user = await User.create({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) });
  await issueSession(req, res, user);
  res.status(201).json({ user: publicUser(user) });
});
app.post('/api/auth/login', rateLimit('login', 12, 900000), async (req, res) => {
  const input = accountInput.omit({ name: true }).parse(req.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const valid = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !valid) return res.status(401).json({ error: 'Email or password is incorrect.' });
  await issueSession(req, res, user);
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/logout', async (req, res) => { await signOut(req, res); res.json({ ok: true }); });
app.get('/api/auth/me', async (req, res) => res.json({ user: req.user ? publicUser(req.user) : null, ...(req.user ? await getEntitlements(req.user._id) : { services: [], subscriptions: [] }) }));
app.patch('/api/auth/profile', requireUser, async (req, res) => {
  const fields = z.object({ name: z.string().trim().min(2).max(80), dogName: z.string().trim().max(80), phone: z.string().trim().max(30), address: z.string().trim().max(300) }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.user._id, { $set: fields }, { new: true });
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/password', requireUser, rateLimit('password', 5, 900000), async (req, res) => {
  const fields = z.object({ currentPassword: z.string().max(128), password: z.string().min(12).max(128) }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!await verifyPassword(fields.currentPassword, user.passwordHash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  user.passwordHash = await hashPassword(fields.password); await user.save();
  await Session.deleteMany({ userId: user._id }); await issueSession(req, res, user);
  res.json({ ok: true });
});
app.get('/api/availability', async (req, res) => res.json(await getAvailability(String(req.query.from), String(req.query.to))));
app.post('/api/availability/auto', async (req, res) => {
  const input = z.object({ count: z.number().int().min(1).max(31), startDate: z.string(), startTime: z.string(), endDate: z.string(), endTime: z.string(), preference: z.enum(['any', 'morning', 'afternoon', 'evening']), service: z.enum(['training', 'sitting', 'aggression']) }).parse(req.body);
  const { days } = await getAvailability(input.startDate, input.endDate);
  res.json(autoSchedule(days, input));
});
app.post('/api/quote', (req, res) => { validateVisits(req.body.serviceIds, req.body.visits); res.json(quote(req.body.serviceIds, req.body.visits)); });
app.get('/api/bookings', requireUser, async (req, res) => res.json({ bookings: await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean() }));
app.post('/api/bookings', requireUser, rateLimit('booking', 10, 3600000), async (req, res) => res.status(201).json({ booking: await createBooking(req.user._id, req.body) }));
async function ownedBooking(req) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  const booking = await Booking.findOne({ _id: req.params.id, ...(req.user.role === 'staff' ? {} : { userId: req.user._id }) });
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  return booking;
}
app.post('/api/bookings/:id/cancel', requireUser, async (req, res) => {
  const booking = await ownedBooking(req); await cancelBooking(booking, stripeClient());
  await BillingLock.deleteOne({ _id: String(booking.userId), bookingId: String(booking._id) });
  res.json({ ok: true, message: 'Booking cancelled. This does not refund a payment or cancel a monthly subscription; contact Bravo for billing help.' });
});
app.patch('/api/bookings/:id/visits', requireUser, async (req, res) => {
  const booking = await ownedBooking(req);
  if (booking.status === 'cancelled' || booking.stripeSessionId || booking.checkoutStarting) throw new Error('Contact Bravo to change a cancelled or checkout-linked booking.');
  const visits = z.array(z.object({ date: z.string(), time: z.string(), service: z.string() })).max(62).parse(req.body.visits);
  validateVisits(booking.serviceIds, visits);
  const dates = visits.map(v => v.date).sort();
  if (dates.some(d => dateTime(d).diff(dateTime(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })), 'days').days > 92)) throw new Error('Book within the next 92 days.');
  await transaction(async session => {
    const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { new: true, session }).lean();
    const open = dates.length ? availability({ from: dates[0], to: dates.at(-1), settings }) : [];
    if (visits.some(v => !open.find(d => d.date === v.date)?.slots.includes(v.time))) throw new Error('Selected dates are outside current availability.');
    await Slot.deleteMany({ bookingId: booking._id }, { session });
    if (visits.length) await Slot.insertMany(visits.map(v => ({ _id: `${v.date}|${v.time}`, bookingId: booking._id, date: v.date, time: v.time })), { session });
    const result = await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' }, checkoutStarting: { $ne: true }, stripeSessionId: { $exists: false } }, { $set: { visits, quote: quote(booking.serviceIds, visits), status: 'requested' } }, { session });
    if (!result.matchedCount) throw new Error('This booking changed while you were editing it. Refresh your account.');
  });
  res.json({ ok: true });
});
app.post('/api/bookings/:id/checkout', requireUser, rateLimit('checkout', 20, 3600000), async (req, res) => {
  const booking = await ownedBooking(req);
  if (String(booking.userId) !== String(req.user._id)) return res.status(403).json({ error: 'Only the customer can open their checkout.' });
  res.json(await checkout(booking, req.user, stripeClient()));
});
app.post('/api/billing/portal', requireUser, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe || !req.user.stripeCustomerId) return res.status(503).json({ error: 'No connected billing account yet.' });
  const portal = await stripe.billingPortal.sessions.create({ customer: req.user.stripeCustomerId, return_url: `${process.env.APP_ORIGIN}/account` });
  res.json({ url: portal.url });
});
app.get('/api/community', requireUser, async (_req, res) => {
  const messages = await Message.find({ deleted: false }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ messages: messages.reverse().map(({ _id, authorName, role, kind, body, createdAt }) => ({ _id, authorName, role, kind, body, createdAt })) });
});
app.post('/api/community', requireUser, rateLimit('chat', 10, 60000), async (req, res) => {
  const data = z.object({ body: z.string().trim().min(1).max(700), kind: z.enum(['message', 'announcement', 'alert']).default('message') }).parse(req.body);
  if (data.kind !== 'message' && req.user.role !== 'staff') return res.status(403).json({ error: 'Only Bravo staff can post alerts or announcements.' });
  await Message.create({ ...data, userId: req.user._id, authorName: req.user.name, role: req.user.role });
  res.status(201).json({ ok: true });
});
app.delete('/api/community/:id', requireUser, requireStaff, async (req, res) => { await Message.updateOne({ _id: req.params.id }, { $set: { deleted: true } }); res.json({ ok: true }); });
for (const type of ['video', 'captions', 'transcript']) app.get(`/api/lessons/:id/${type}`, requireUser, (req, res) => protectedLesson(req, res, type));
app.get('/api/admin', requireUser, requireStaff, async (_req, res) => res.json({ settings: await Settings.findById('schedule'), bookings: await Booking.find().sort({ createdAt: -1 }).limit(200).populate({ path: 'userId', model: User, select: 'name email' }), blocks: await Slot.find({ bookingId: { $exists: false } }).sort({ _id: 1 }).limit(200) }));
app.put('/api/admin/schedule', requireUser, requireStaff, async (req, res) => {
  const settings = z.object({ enabled: z.boolean(), weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7), hours: z.array(z.enum(HOURS)).min(1).max(13) }).parse(req.body);
  await Settings.updateOne({ _id: 'schedule' }, { $set: settings, $inc: { revision: 1 } }); res.json({ ok: true });
});
app.post('/api/admin/blocks', requireUser, requireStaff, async (req, res) => {
  const data = z.object({ date: z.string(), time: z.enum(HOURS), reason: z.string().trim().min(1).max(200) }).parse(req.body);
  dateTime(data.date, data.time);
  await Slot.create({ _id: `${data.date}|${data.time}`, ...data }); res.status(201).json({ ok: true });
});
app.delete('/api/admin/blocks/:id', requireUser, requireStaff, async (req, res) => { await Slot.deleteOne({ _id: req.params.id, bookingId: { $exists: false } }); res.json({ ok: true }); });
app.patch('/api/admin/bookings/:id', requireUser, requireStaff, async (req, res) => {
  const booking = await ownedBooking(req);
  const status = z.enum(['confirmed', 'cancelled']).parse(req.body.status);
  if (status === 'cancelled') await cancelBooking(booking, stripeClient());
  else if (booking.status === 'cancelled') throw new Error('A cancelled booking cannot be confirmed.');
  else { booking.status = status; await booking.save(); }
  res.json({ ok: true });
});
app.put('/api/admin/lessons/:id', requireUser, requireStaff, async (req, res) => {
  const data = z.object({ title: z.string().min(1).max(120), category: z.string().min(1).max(40), instructor: z.string().min(1).max(80), image: z.string().regex(/^\/images\/[a-z0-9-]+\.webp$/), videoFile: z.string(), captionFile: z.string(), transcript: z.string().min(1).max(20000), published: z.boolean() }).parse(req.body);
  if (!/^[a-z0-9-]{1,80}$/.test(req.params.id)) throw new Error('Use a simple lesson slug.');
  if (data.published) { await access(privatePath(data.videoFile)); await access(privatePath(data.captionFile)); }
  await Lesson.updateOne({ _id: req.params.id }, { $set: data }, { upsert: true }); res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
const clientDir = fileURLToPath(new URL('../client/dist/', import.meta.url));
app.use(express.static(clientDir, { maxAge: '1h', index: false }));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDir, 'index.html'), { maxAge: 0 }));
app.use((error, _req, res, _next) => {
  const status = error instanceof z.ZodError ? 400 : error.status || (error.code === 11000 ? 409 : error.name === 'CastError' ? 400 : 400);
  let message = error instanceof z.ZodError ? error.issues[0]?.message : error.message;
  if (error.code === 11000) message = 'That account or time slot already exists. Sign in or choose another opening.';
  if (status >= 500 || ['MongoServerError', 'MongoNetworkError'].includes(error.name)) message = 'The service is temporarily unavailable. Please try again or call Bravo.';
  res.status(status).json({ error: message || 'The request could not be completed.' });
});
export default app;
