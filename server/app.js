import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { User, Session, Booking, Slot, Settings, Message, DirectMessage, CommunityGroup, GroupMessage, Lesson, BillingLock, MediaUpload, MediaChunk } from './models.js';
import { hashPassword, verifyPassword, issueSession, identify, requireUser, requireStaff, requireOwner, signOut, publicUser, sameOrigin, rateLimit } from './auth.js';
import { createBooking, getAvailability, getEntitlements, cancelBooking } from './bookings.js';
import { stripeClient, stripeWebhook, checkout } from './payments.js';
import { LESSON_PREVIEWS, privatePath, protectedLesson } from './lessons.js';
import { DEFAULT_SCHEDULE, HOURS, autoSchedule, validateVisits, availability, dateTime } from './scheduling.js';
import { PAGE_METADATA } from '../shared/page-metadata.js';
import { SERVICES, quote } from '../shared/catalog.js';

const app = express();
app.disable('x-powered-by');
// Vercel supplies a trusted proxy hop. Self-hosting defaults to no trusted proxy.
app.set('trust proxy', process.env.VERCEL ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null } } }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhook);
app.use(express.json({ limit: '700kb' }), cookieParser());
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', async (_req, res) => {
  let connected = false, connectionIssue = null, schedule = DEFAULT_SCHEDULE;
  try {
    await connectDb();
    schedule = await Settings.findById('schedule').lean();
    connected = true;
  } catch (error) {
    // Fixed diagnostic categories only; never return driver errors or env values.
    connectionIssue = error.databaseIssue || 'unavailable';
  }
  res.json({ connected, connectionIssue, paymentsReady: connected && !!stripeClient(), schedule, timezone: 'America/Chicago', services: SERVICES });
});
app.get('/api/lessons', async (_req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ lessons: LESSON_PREVIEWS });
  await connectDb();
  const stored = await Lesson.find({ published: true }).lean();
  const merged = new Map(LESSON_PREVIEWS.map(l => [l._id, l]));
  for (const lesson of stored) merged.set(lesson._id, lesson);
  res.json({ lessons: [...merged.values()] });
});
async function sendUploadedMedia(uploadId, req, res, publicImage = false) {
  const upload = await MediaUpload.findOne({ _id: uploadId, completed: true }).lean();
  if (!upload || (publicImage && upload.kind !== 'image')) return res.status(404).json({ error: 'Media not found.' });
  const chunks = await MediaChunk.find({ uploadId }).sort({ index: 1 }).select('data').lean();
  const buffer = Buffer.concat(chunks.map(chunk => chunk.data.buffer ? Buffer.from(chunk.data.buffer) : Buffer.from(chunk.data)));
  const range = req.headers.range;
  res.set({ 'Content-Type': upload.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': publicImage ? 'public, max-age=3600' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  if (!range) { res.set('Content-Length', String(buffer.length)); return res.send(buffer); }
  const match = /^bytes=(\d+)-(\d*)$/.exec(range); if (!match) return res.status(416).end();
  const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
  if (start > end || start >= buffer.length) return res.status(416).end();
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${buffer.length}`, 'Content-Length': String(end - start + 1) }).send(buffer.subarray(start, end + 1));
}
app.get('/api/lessons/:id/image', async (req, res) => { await connectDb(); const lesson = await Lesson.findById(req.params.id).lean(); if (!lesson?.imageUpload) return res.status(404).end(); return sendUploadedMedia(lesson.imageUpload, req, res, true); });
app.get('/api/team', async (_req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ team: [] });
  await connectDb();
  const team = await User.find({ role: { $in: ['owner', 'staff'] }, blocked: false }).select('name role phone title bio showPhone').sort({ role: 1, name: 1 }).lean();
  res.json({ team: team.map(user => ({ id: String(user._id), name: user.name, role: user.role, title: user.title || (user.role === 'owner' ? 'Owner & Lead Trainer' : 'Bravo Trainer'), bio: user.bio || '', phone: user.showPhone ? user.phone : '' })) });
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
  const fields = z.object({ name: z.string().trim().min(2).max(80), dogName: z.string().trim().max(80), phone: z.string().trim().max(30), address: z.string().trim().max(300), title: z.string().trim().max(80).optional(), bio: z.string().trim().max(500).optional(), showPhone: z.boolean().optional() }).parse(req.body);
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
  const input = z.object({ count: z.number().int().min(1).max(31), startDate: z.string(), startTime: z.string(), endDate: z.string(), endTime: z.string(), preference: z.enum(['any', 'morning', 'afternoon', 'evening']), service: z.enum(['training', 'aggression']) }).parse(req.body);
  const { days } = await getAvailability(input.startDate, input.endDate);
  res.json(autoSchedule(days, input));
});
app.post('/api/quote', (req, res) => { validateVisits(req.body.serviceIds, req.body.visits); res.json(quote(req.body.serviceIds, req.body.visits)); });
app.get('/api/bookings', requireUser, async (req, res) => res.json({ bookings: await Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean() }));
app.post('/api/bookings', requireUser, rateLimit('booking', 10, 3600000), async (req, res) => res.status(201).json({ booking: await createBooking(req.user._id, req.body) }));
async function ownedBooking(req) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  const booking = await Booking.findOne({ _id: req.params.id, ...(['staff', 'owner'].includes(req.user.role) ? {} : { userId: req.user._id }) });
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
  if (req.user.mutedUntil && req.user.mutedUntil > new Date()) return res.status(403).json({ error: `Posting is paused until ${req.user.mutedUntil.toLocaleString()}.` });
  const data = z.object({ body: z.string().trim().min(1).max(700), kind: z.enum(['message', 'announcement', 'alert']).default('message') }).parse(req.body);
  if (data.kind !== 'message' && !['staff', 'owner'].includes(req.user.role)) return res.status(403).json({ error: 'Only the Bravo team can post alerts or announcements.' });
  await Message.create({ ...data, userId: req.user._id, authorName: req.user.name, role: req.user.role });
  res.status(201).json({ ok: true });
});
app.delete('/api/community/:id', requireUser, requireStaff, async (req, res) => { await Message.updateOne({ _id: req.params.id }, { $set: { deleted: true } }); res.json({ ok: true }); });
app.get('/api/direct', requireUser, async (req, res) => {
  const memberId = ['staff', 'owner'].includes(req.user.role) && req.query.memberId ? String(req.query.memberId) : String(req.user._id);
  const messages = await DirectMessage.find({ memberId, deleted: false }).sort({ createdAt: 1 }).limit(200).lean();
  res.json({ messages: messages.map(({ _id, senderName, senderRole, body, createdAt }) => ({ _id, senderName, senderRole, body, createdAt })) });
});
app.post('/api/direct', requireUser, rateLimit('direct', 20, 60000), async (req, res) => {
  if (req.user.mutedUntil && req.user.mutedUntil > new Date()) return res.status(403).json({ error: 'Messaging is temporarily paused for this account.' });
  const data = z.object({ memberId: z.string().regex(/^[a-f\d]{24}$/i).optional(), body: z.string().trim().min(1).max(1200) }).parse(req.body);
  const memberId = ['staff', 'owner'].includes(req.user.role) && data.memberId ? data.memberId : String(req.user._id);
  await DirectMessage.create({ memberId, senderId: req.user._id, senderName: req.user.name, senderRole: req.user.role, body: data.body });
  res.status(201).json({ ok: true });
});
app.get('/api/groups', requireUser, async (req, res) => {
  const groups = await CommunityGroup.find({ ...(req.user.role === 'owner' ? {} : { members: req.user._id }), archived: false }).lean();
  const people = await User.find({ blocked: false }).select('name role').sort({ name: 1 }).limit(300).lean();
  res.json({ groups: groups.map(group => ({ ...group, _id: String(group._id), ownerId: String(group.ownerId), members: group.members.map(String) })), people: people.map(person => ({ id: String(person._id), name: person.name, role: person.role })) });
});
app.post('/api/groups', requireUser, rateLimit('groups', 8, 3600000), async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2).max(60), members: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(30).default([]) }).parse(req.body);
  const members = [...new Set([String(req.user._id), ...data.members])];
  const group = await CommunityGroup.create({ name: data.name, ownerId: req.user._id, members }); res.status(201).json({ group });
});
app.patch('/api/groups/:id', requireUser, async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || (String(group.ownerId) !== String(req.user._id) && !['staff', 'owner'].includes(req.user.role))) return res.status(404).json({ error: 'Group not found.' });
  const data = z.object({ members: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(30) }).parse(req.body);
  group.members = [...new Set([String(group.ownerId), ...data.members])]; await group.save(); res.json({ ok: true });
});
app.get('/api/groups/:id/messages', requireUser, async (req, res) => {
  const group = await CommunityGroup.findOne({ _id: req.params.id, ...(req.user.role === 'owner' ? {} : { members: req.user._id }), archived: false });
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const messages = await GroupMessage.find({ groupId: group._id, deleted: false }).sort({ createdAt: 1 }).limit(200).lean(); res.json({ messages });
});
app.post('/api/groups/:id/messages', requireUser, rateLimit('group-chat', 20, 60000), async (req, res) => {
  if (req.user.mutedUntil && req.user.mutedUntil > new Date()) return res.status(403).json({ error: 'Posting is temporarily paused for this account.' });
  const group = await CommunityGroup.findOne({ _id: req.params.id, members: req.user._id, archived: false }); if (!group) return res.status(404).json({ error: 'Group not found.' });
  const { body } = z.object({ body: z.string().trim().min(1).max(700) }).parse(req.body);
  await GroupMessage.create({ groupId: group._id, userId: req.user._id, authorName: req.user.name, role: req.user.role, body }); res.status(201).json({ ok: true });
});
for (const type of ['video', 'captions', 'transcript']) app.get(`/api/lessons/:id/${type}`, requireUser, (req, res) => protectedLesson(req, res, type));
app.get('/api/admin', requireUser, requireStaff, async (req, res) => {
  const [settings, bookings, blocks, inbox] = await Promise.all([Settings.findById('schedule'), Booking.find().sort({ createdAt: -1 }).limit(200).populate({ path: 'userId', model: User, select: 'name email' }), Slot.find({ bookingId: { $exists: false } }).sort({ _id: 1 }).limit(200), DirectMessage.aggregate([{ $sort: { createdAt: -1 } }, { $group: { _id: '$memberId', lastMessage: { $first: '$body' }, updatedAt: { $first: '$createdAt' } } }, { $limit: 100 }])]);
  const names = await User.find({ _id: { $in: inbox.map(thread => thread._id) } }).select('name').lean(); const nameMap = new Map(names.map(person => [String(person._id), person.name]));
  res.json({ settings, bookings, blocks, inbox: inbox.map(thread => ({ ...thread, memberName: nameMap.get(String(thread._id)) || 'Client' })), role: req.user.role });
});
app.get('/api/admin/bookings/:id', requireUser, requireStaff, async (req, res) => res.json({ booking: await ownedBooking(req) }));
app.get('/api/admin/users', requireUser, requireOwner, async (req, res) => {
  const q = String(req.query.q || '').trim(); const filter = q ? { $or: [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] } : {};
  const users = await User.find(filter).select('name email role phone title bio showPhone mutedUntil blocked').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ users: users.map(user => ({ ...user, _id: String(user._id) })) });
});
app.patch('/api/admin/users/:id', requireUser, requireOwner, async (req, res) => {
  if (String(req.params.id) === String(req.user._id) && (req.body.role && req.body.role !== 'owner' || req.body.blocked === true)) throw new Error('The owner account cannot remove its own access.');
  const fields = z.object({ role: z.enum(['member', 'staff']).optional(), name: z.string().trim().min(2).max(80).optional(), phone: z.string().trim().max(30).optional(), title: z.string().trim().max(80).optional(), bio: z.string().trim().max(500).optional(), showPhone: z.boolean().optional(), blocked: z.boolean().optional(), mutedUntil: z.union([z.string().datetime(), z.null()]).optional() }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true }); if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (fields.blocked) await Session.deleteMany({ userId: user._id }); res.json({ user: publicUser(user) });
});
app.post('/api/admin/bookings/:id/refund', requireUser, requireOwner, async (req, res) => {
  const booking = await ownedBooking(req), stripe = stripeClient(); if (!stripe) return res.status(503).json({ error: 'Refunds will be available after Stripe is connected.' });
  if (booking.paymentStatus !== 'paid' || !booking.stripeSessionId) throw new Error('This booking has no refundable Stripe payment.');
  const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId); if (!session.payment_intent) throw new Error('No refundable payment was found.');
  await stripe.refunds.create({ payment_intent: session.payment_intent, metadata: { bookingId: String(booking._id), issuedBy: String(req.user._id) } }); booking.paymentStatus = 'refunded'; await booking.save(); res.json({ ok: true });
});
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
app.get('/api/admin/lessons', requireUser, requireStaff, async (_req, res) => {
  const stored = await Lesson.find().select('+videoFile +captionFile +transcript').lean();
  const lessons = new Map(LESSON_PREVIEWS.map(l => [l._id, { ...l, videoFile: '', captionFile: '', transcript: '' }]));
  for (const lesson of stored) lessons.set(lesson._id, lesson);
  const uploads = await MediaUpload.find({ completed: true }).select('lessonId kind filename size').lean();
  const media = uploads.reduce((map, upload) => { (map[upload.lessonId] ||= {})[upload.kind] = { filename: upload.filename, size: upload.size }; return map; }, {});
  res.json({ lessons: [...lessons.values()].map(lesson => ({ ...lesson, media: media[lesson._id] || {} })) });
});
app.post('/api/admin/media/start', requireUser, requireStaff, async (req, res) => {
  const data = z.object({ lessonId: z.string().regex(/^[a-z0-9-]{1,80}$/), kind: z.enum(['video', 'captions', 'image']), filename: z.string().trim().min(1).max(160), contentType: z.string().max(100), size: z.number().int().positive().max(80 * 1024 * 1024), chunks: z.number().int().positive().max(220) }).parse(req.body);
  const allowed = data.kind === 'video' ? ['video/mp4', 'video/webm'] : data.kind === 'captions' ? ['text/vtt', 'text/plain'] : ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(data.contentType)) throw new Error(`Choose a supported ${data.kind} file.`);
  if (!await Lesson.exists({ _id: data.lessonId })) throw new Error('Save the lesson draft before uploading media.');
  const upload = await MediaUpload.create({ _id: randomUUID(), ...data, uploadedBy: req.user._id, expiresAt: new Date(Date.now() + 24 * 3600000) }); res.status(201).json({ uploadId: upload._id });
});
app.put('/api/admin/media/:id/chunks/:index', requireUser, requireStaff, rateLimit('media-chunk', 240, 60000), async (req, res) => {
  const upload = await MediaUpload.findOne({ _id: req.params.id, uploadedBy: req.user._id, completed: false }); if (!upload) return res.status(404).json({ error: 'Upload not found.' });
  const index = Number(req.params.index); if (!Number.isInteger(index) || index < 0 || index >= upload.chunks) throw new Error('Invalid upload chunk.');
  const { data } = z.object({ data: z.string().min(1).max(560000) }).parse(req.body); const bytes = Buffer.from(data, 'base64'); if (!bytes.length || bytes.length > 400 * 1024) throw new Error('Upload chunk is too large.');
  await MediaChunk.updateOne({ uploadId: upload._id, index }, { $set: { data: bytes } }, { upsert: true }); res.json({ ok: true });
});
app.post('/api/admin/media/:id/complete', requireUser, requireStaff, async (req, res) => {
  const upload = await MediaUpload.findOne({ _id: req.params.id, uploadedBy: req.user._id, completed: false }); if (!upload) return res.status(404).json({ error: 'Upload not found.' });
  const chunks = await MediaChunk.find({ uploadId: upload._id }).sort({ index: 1 }).select('index data').lean();
  if (chunks.length !== upload.chunks || chunks.some((chunk, index) => chunk.index !== index) || chunks.reduce((sum, chunk) => sum + (chunk.data?.length || chunk.data?.buffer?.length || 0), 0) !== upload.size) throw new Error('Upload is incomplete. Retry the file.');
  upload.completed = true; upload.expiresAt = undefined; await upload.save();
  const field = upload.kind === 'video' ? 'videoUpload' : upload.kind === 'captions' ? 'captionUpload' : 'imageUpload';
  const lesson = await Lesson.findById(upload.lessonId); const oldId = lesson?.[field]; await Lesson.updateOne({ _id: upload.lessonId }, { $set: { [field]: upload._id, ...(upload.kind === 'image' ? { image: `/api/lessons/${upload.lessonId}/image` } : {}) } });
  if (oldId) { await MediaUpload.deleteOne({ _id: oldId }); await MediaChunk.deleteMany({ uploadId: oldId }); }
  res.json({ ok: true, filename: upload.filename });
});
app.delete('/api/admin/lessons/:id/media/:kind', requireUser, requireStaff, async (req, res) => {
  const kind = z.enum(['video', 'captions', 'image']).parse(req.params.kind), field = kind === 'video' ? 'videoUpload' : kind === 'captions' ? 'captionUpload' : 'imageUpload';
  const lesson = await Lesson.findById(req.params.id); if (!lesson) return res.status(404).json({ error: 'Lesson not found.' }); const uploadId = lesson[field];
  lesson[field] = undefined; if (kind === 'image') lesson.image = '/images/training-education.webp'; if (kind !== 'image') lesson.published = false; await lesson.save();
  if (uploadId) { await MediaUpload.deleteOne({ _id: uploadId }); await MediaChunk.deleteMany({ uploadId }); } res.json({ ok: true });
});
app.put('/api/admin/lessons/:id', requireUser, requireStaff, async (req, res) => {
  const data = z.object({ title: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(40), instructor: z.string().trim().min(1).max(80), image: z.string().regex(/^\/(images\/[a-z0-9-]+\.webp|api\/lessons\/[a-z0-9-]+\/image)$/), videoFile: z.string().max(160).optional().default(''), captionFile: z.string().max(160).optional().default(''), transcript: z.string().max(20000), published: z.boolean() }).parse(req.body);
  if (!/^[a-z0-9-]{1,80}$/.test(req.params.id)) throw new Error('Use a simple lesson slug.');
  if (data.published) {
    if (!data.transcript.trim()) throw new Error('Add a transcript before publishing.');
    const current = await Lesson.findById(req.params.id).select('+videoFile +captionFile');
    const storedUploads = current?.videoUpload && current?.captionUpload;
    if (!storedUploads && (!/\.(mp4|webm)$/.test(data.videoFile) || !/\.vtt$/.test(data.captionFile))) throw new Error('Upload a video and English VTT captions before publishing.');
    if (!storedUploads) { try { await access(privatePath(data.videoFile)); await access(privatePath(data.captionFile)); } catch { throw new Error('Upload a video and English captions before publishing.'); } }
  }
  await Lesson.updateOne({ _id: req.params.id }, { $set: data }, { upsert: true }); res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
const clientDir = fileURLToPath(new URL('../client/dist/', import.meta.url));
app.use(express.static(clientDir, { maxAge: '1h', index: false, redirect: false }));
app.get('/{*path}', (req, res) => {
  const known = PAGE_METADATA[req.path];
  if (known?.private) res.set('X-Robots-Tag', 'noindex, nofollow');
  if (!known) res.status(404);
  res.sendFile(path.join(clientDir, known && req.path !== '/' ? req.path.slice(1) + '.html' : 'index.html'), { maxAge: 0 });
});
app.use((error, _req, res, _next) => {
  const status = error instanceof z.ZodError ? 400 : error.status || (error.code === 11000 ? 409 : error.name === 'CastError' ? 400 : 400);
  let message = error instanceof z.ZodError ? error.issues[0]?.message : error.message;
  if (error.code === 11000) message = 'That account or time slot already exists. Sign in or choose another opening.';
  if (status >= 500 || ['MongoServerError', 'MongoNetworkError'].includes(error.name)) message = 'The service is temporarily unavailable. Please try again or call Bravo.';
  res.status(status).json({ error: message || 'The request could not be completed.' });
});
export default app;
