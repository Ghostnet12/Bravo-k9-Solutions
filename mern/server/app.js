import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { User, Session, Booking, Slot, Settings, ServiceSetting, Message, Review, AuditEvent, DirectMessage, CommunityGroup, GroupMessage, Lesson, BillingLock, MediaUpload, MediaChunk } from './models.js';
import { hashPassword, verifyPassword, issueSession, identify, requireUser, requireStaff, requireOwner, signOut, publicUser, sameOrigin, rateLimit } from './auth.js';
import { createBooking, getAvailability, getEntitlements, cancelBooking } from './bookings.js';
import { stripeClient, stripeWebhook, checkout, refundBooking } from './payments.js';
import { sendUploadedMedia, CHUNK_SIZE, MEDIA_LIMITS, mediaBytes, validMediaHeader } from './media.js';
import { LESSON_PREVIEWS, privatePath, protectedLesson } from './lessons.js';
import { DEFAULT_SCHEDULE, HOURS, autoSchedule, validateVisits, availability, dateTime } from './scheduling.js';
import { PAGE_METADATA } from '../shared/page-metadata.js';
import { SERVICES, quote } from '../shared/catalog.js';
import { effectiveServices } from './services.js';

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
  const paymentsReady = connected && !!stripeClient();
  const services = connected ? await effectiveServices({ includeDisabled: true }) : SERVICES.map(service => ({ ...service, enabled: true }));
  res.json({ connected, connectionIssue, paymentsReady, paymentsPaused: !paymentsReady, workspaceVersion: 'owner-staff-3', schedule, timezone: 'America/Chicago', services });
});
app.get('/api/lessons', async (_req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ lessons: LESSON_PREVIEWS });
  await connectDb();
  const stored = await Lesson.find({ published: true }).select('title category instructor image published').lean();
  const merged = new Map(LESSON_PREVIEWS.map(l => [l._id, l]));
  for (const lesson of stored) merged.set(lesson._id, lesson);
  res.json({ lessons: [...merged.values()] });
});
app.get('/api/team', async (_req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ team: [] });
  await connectDb();
  const team = await User.find({ role: { $in: ['owner', 'staff'] }, blocked: { $ne: true } }).select('name role phone title bio showPhone').sort({ role: 1, name: 1 }).lean();
  res.json({ team: team.map(user => ({ id: String(user._id), name: user.name, role: user.role, title: user.title || (user.role === 'owner' ? 'Owner & Lead Trainer' : 'Bravo Trainer'), bio: user.bio || '', phone: user.showPhone ? user.phone : '' })) });
});
app.use('/api', sameOrigin, async (_req, _res, next) => { await connectDb(); next(); }, identify);
app.use('/api', rateLimit('api', 240, 60000));
app.get('/api/lessons/:id/image', async (req, res) => {
  const lesson = await Lesson.findOne({ _id: req.params.id, ...(['staff', 'owner'].includes(req.user?.role) ? {} : { published: true }) }).lean();
  if (!lesson?.imageUpload) return res.status(404).end();
  return sendUploadedMedia(lesson.imageUpload, req, res, 'image');
});
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
  if (!user || !valid || user.blocked) return res.status(401).json({ error: 'Sign-in is unavailable. Check your details or contact Bravo.' });
  await issueSession(req, res, user);
  res.json({ user: publicUser(user) });
});
app.post('/api/auth/logout', async (req, res) => { await signOut(req, res); res.json({ ok: true }); });
app.get('/api/auth/me', async (req, res) => res.json({ user: req.user ? publicUser(req.user) : null, ...(req.user ? await getEntitlements(req.user._id) : { services: [], subscriptions: [] }) }));
app.patch('/api/auth/profile', requireUser, async (req, res) => {
  const fields = z.object({ name: z.string().trim().min(2).max(80), dogName: z.string().trim().max(80), phone: z.string().trim().max(30), address: z.string().trim().max(300), title: z.string().trim().max(80).optional(), bio: z.string().trim().max(500).optional(), showPhone: z.boolean().optional() }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.user._id, { $set: fields }, { returnDocument: 'after' });
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
  const input = z.object({ count: z.number().int().min(1).max(31), startDate: z.string(), startTime: z.string(), endDate: z.string(), endTime: z.string(), preference: z.enum(['any', 'morning', 'afternoon', 'evening']), service: z.enum(['training', 'walking', 'aggression']) }).parse(req.body);
  const { days } = await getAvailability(input.startDate, input.endDate);
  res.json(autoSchedule(days, input));
});
app.post('/api/quote', async (req, res) => {
  const input = z.object({ serviceIds: z.array(z.string()).min(1).max(4), visits: z.array(z.object({ date: z.string(), time: z.string(), service: z.string() })).max(62), dogCount: z.number().int().min(1).max(10).default(1) }).parse(req.body);
  const catalog = await effectiveServices(); validateVisits(input.serviceIds, input.visits, catalog); res.json(quote(input.serviceIds, input.visits, { dogCount: input.dogCount }, catalog));
});
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
    const settings = await Settings.findOneAndUpdate({ _id: 'schedule' }, { $inc: { revision: 1 } }, { returnDocument: 'after', session }).lean();
    const open = dates.length ? availability({ from: dates[0], to: dates.at(-1), settings }) : [];
    if (visits.some(v => !open.find(d => d.date === v.date)?.slots.includes(v.time))) throw new Error('Selected dates are outside current availability.');
    await Slot.deleteMany({ bookingId: booking._id }, { session });
    if (visits.length) await Slot.insertMany(visits.map(v => ({ _id: `${v.date}|${v.time}`, bookingId: booking._id, date: v.date, time: v.time })), { session });
    const result = await Booking.updateOne({ _id: booking._id, status: { $ne: 'cancelled' }, checkoutStarting: { $ne: true }, stripeSessionId: { $exists: false } }, { $set: { visits, quote: quote(booking.serviceIds, visits, { dogCount: booking.dogCount || 1 }), status: 'requested' } }, { session });
    if (!result.matchedCount) throw new Error('This booking changed while you were editing it. Refresh your account.');
  });
  res.json({ ok: true });
});
const paymentsUnavailable = res => res.status(503).json({ error: 'Online checkout and refunds are paused while Bravo completes payment setup. Contact the owner for billing help.' });
app.post('/api/bookings/:id/checkout', requireUser, rateLimit('checkout', 20, 3600000), async (req, res) => {
  const stripe = stripeClient(); if (!stripe) return paymentsUnavailable(res);
  const booking = await ownedBooking(req);
  if (String(booking.userId) !== String(req.user._id)) return res.status(403).json({ error: 'Only the customer can open their checkout.' });
  res.json(await checkout(booking, req.user, stripe));
});
app.post('/api/billing/portal', requireUser, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe || !req.user.stripeCustomerId) return paymentsUnavailable(res);
  const portal = await stripe.billingPortal.sessions.create({ customer: req.user.stripeCustomerId, return_url: `${process.env.APP_ORIGIN}/account` });
  res.json({ url: portal.url });
});
app.get('/api/reviews', async (_req, res) => {
  const reviews = await Review.find({ hidden: false }).select('authorName rating body createdAt updatedAt').sort({ createdAt: -1 }).limit(100).lean();
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  res.json({ reviews, average: Number(average.toFixed(1)), count: reviews.length });
});
app.get('/api/reviews/mine', requireUser, async (req, res) => res.json({ review: await Review.findOne({ userId: req.user._id }).select('rating body hidden createdAt updatedAt').lean() }));
app.put('/api/reviews/mine', requireUser, rateLimit('review', 6, 3600000), async (req, res) => {
  const data = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().min(10).max(1200) }).parse(req.body);
  const review = await Review.findOneAndUpdate({ userId: req.user._id }, { $set: { ...data, authorName: req.user.name, hidden: false }, $unset: { moderatedAt: 1, moderatedBy: 1 } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  res.json({ review });
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
app.delete('/api/community/:id', requireUser, requireOwner, async (req, res) => { await Message.updateOne({ _id: req.params.id }, { $set: { deleted: true } }); res.json({ ok: true }); });
app.get('/api/direct', requireUser, async (req, res) => {
  const memberId = ['staff', 'owner'].includes(req.user.role) && req.query.memberId ? String(req.query.memberId) : String(req.user._id);
  const messages = await DirectMessage.find({ memberId, deleted: false }).sort({ createdAt: -1, _id: -1 }).limit(200).lean();
  res.json({ messages: messages.reverse().map(({ _id, senderName, senderRole, recipientName, body, createdAt }) => ({ _id, senderName, senderRole, recipientName, body, createdAt })) });
});
app.post('/api/direct', requireUser, rateLimit('direct', 20, 60000), async (req, res) => {
  if (req.user.mutedUntil && req.user.mutedUntil > new Date()) return res.status(403).json({ error: 'Messaging is temporarily paused for this account.' });
  const data = z.object({ memberId: z.string().regex(/^[a-f\d]{24}$/i).optional(), recipientId: z.string().regex(/^[a-f\d]{24}$/i).optional(), body: z.string().trim().min(1).max(1200) }).parse(req.body);
  const memberId = ['staff', 'owner'].includes(req.user.role) && data.memberId ? data.memberId : String(req.user._id);
  if (!await User.exists({ _id: memberId, blocked: { $ne: true } })) return res.status(404).json({ error: 'Account not available.' });
  const recipient = data.recipientId ? await User.findOne({ _id: data.recipientId, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } }).select('name') : null;
  if (data.recipientId && !recipient) throw new Error('This trainer is no longer available. Choose the Bravo team.');
  await DirectMessage.create({ memberId, senderId: req.user._id, senderName: req.user.name, senderRole: req.user.role, recipientId: recipient?._id, recipientName: recipient?.name, body: data.body });
  res.status(201).json({ ok: true });
});
app.get('/api/groups', requireUser, async (req, res) => {
  const groups = await CommunityGroup.find({ ...(req.user.role === 'owner' ? {} : { members: req.user._id }), archived: false }).lean();
  const people = await User.find({ blocked: { $ne: true } }).select('name role').sort({ name: 1 }).limit(300).lean();
  res.json({ groups: groups.map(group => ({ ...group, _id: String(group._id), ownerId: String(group.ownerId), members: group.members.map(String) })), people: people.map(person => ({ id: String(person._id), name: person.name, role: person.role })) });
});
app.post('/api/groups', requireUser, rateLimit('groups', 8, 3600000), async (req, res) => {
  if (req.user.mutedUntil > new Date()) return res.status(403).json({ error: 'Group creation is paused while this account is muted.' });
  const data = z.object({ name: z.string().trim().min(2).max(60), members: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(30).default([]) }).parse(req.body);
  const members = [...new Set([String(req.user._id), ...data.members])];
  if (await User.countDocuments({ _id: { $in: members }, blocked: { $ne: true } }) !== members.length) throw new Error('Choose active Bravo accounts for your group.');
  const group = await CommunityGroup.create({ name: data.name, ownerId: req.user._id, members }); res.status(201).json({ group });
});
app.patch('/api/groups/:id', requireUser, async (req, res) => {
  const group = await CommunityGroup.findById(req.params.id);
  if (!group || group.archived || (String(group.ownerId) !== String(req.user._id) && req.user.role !== 'owner')) return res.status(404).json({ error: 'Group not found.' });
  if (req.user.mutedUntil > new Date()) return res.status(403).json({ error: 'Group changes are paused while this account is muted.' });
  const data = z.object({ members: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(30) }).parse(req.body);
  const members = [...new Set([String(group.ownerId), ...data.members])];
  const active = await User.find({ _id: { $in: members }, blocked: { $ne: true } }).select('_id').lean();
  group.members = active.map(person => person._id); await group.save(); res.json({ ok: true });
});
app.get('/api/groups/:id/messages', requireUser, async (req, res) => {
  const group = await CommunityGroup.findOne({ _id: req.params.id, ...(req.user.role === 'owner' ? {} : { members: req.user._id }), archived: false });
  if (!group) return res.status(404).json({ error: 'Group not found.' });
  const messages = await GroupMessage.find({ groupId: group._id, deleted: false }).sort({ createdAt: -1, _id: -1 }).limit(200).select('authorName role body createdAt').lean(); res.json({ messages: messages.reverse() });
});
app.post('/api/groups/:id/messages', requireUser, rateLimit('group-chat', 20, 60000), async (req, res) => {
  if (req.user.mutedUntil && req.user.mutedUntil > new Date()) return res.status(403).json({ error: 'Posting is temporarily paused for this account.' });
  const group = await CommunityGroup.findOne({ _id: req.params.id, ...(req.user.role === 'owner' ? {} : { members: req.user._id }), archived: false }); if (!group) return res.status(404).json({ error: 'Group not found.' });
  const { body } = z.object({ body: z.string().trim().min(1).max(700) }).parse(req.body);
  await GroupMessage.create({ groupId: group._id, userId: req.user._id, authorName: req.user.name, role: req.user.role, body }); res.status(201).json({ ok: true });
});
app.delete('/api/groups/:id/messages/:messageId', requireUser, requireOwner, async (req, res) => {
  await GroupMessage.updateOne({ _id: req.params.messageId, groupId: req.params.id }, { $set: { deleted: true } }); res.json({ ok: true });
});
for (const type of ['video', 'captions', 'transcript']) app.get(`/api/lessons/:id/${type}`, requireUser, (req, res) => protectedLesson(req, res, type));
app.get('/api/admin', requireUser, requireStaff, async (req, res) => {
  const [settings, bookings, blocks, inbox] = await Promise.all([Settings.findById('schedule'), Booking.find().sort({ createdAt: -1 }).limit(200).populate({ path: 'userId', model: User, select: 'name email' }), Slot.find({ bookingId: { $exists: false } }).sort({ _id: 1 }).limit(200), DirectMessage.aggregate([{ $sort: { createdAt: -1 } }, { $group: { _id: '$memberId', lastMessage: { $first: '$body' }, updatedAt: { $first: '$createdAt' } } }, { $limit: 100 }])]);
  const names = await User.find({ _id: { $in: inbox.map(thread => thread._id) } }).select('name').lean(); const nameMap = new Map(names.map(person => [String(person._id), person.name]));
  const team = await User.find({ role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } }).select('name role').sort({ name: 1 }).lean();
  res.json({ settings, bookings, blocks, team, inbox: inbox.map(thread => ({ ...thread, memberName: nameMap.get(String(thread._id)) || 'Client' })), role: req.user.role });
});
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const searchPattern = value => new RegExp(String(value || '').trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
app.get('/api/admin/clients', requireUser, requireStaff, async (req, res) => {
  const pattern = searchPattern(req.query.q);
  const clients = await User.find({ blocked: { $ne: true }, $or: [{ name: pattern }, { email: pattern }] }).select('name email dogName phone address').sort({ name: 1 }).limit(30).lean();
  res.json({ clients });
});
async function validStaff(id) {
  if (id && !await User.exists({ _id: id, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } })) throw new Error('Choose an active trainer.');
}
app.post('/api/admin/bookings', requireUser, requireStaff, rateLimit('staff-booking', 30, 3600000), async (req, res) => {
  const { userId, staffId } = z.object({ userId: objectId, staffId: objectId.nullable().default(null) }).parse(req.body);
  if (!await User.exists({ _id: userId, blocked: { $ne: true } })) return res.status(404).json({ error: 'Client not found.' });
  await validStaff(staffId);
  res.status(201).json({ booking: await createBooking(userId, req.body, { staffId, createdBy: req.user._id }) });
});
app.patch('/api/admin/bookings/:id/assignment', requireUser, requireStaff, async (req, res) => {
  const booking = await ownedBooking(req);
  const { staffId } = z.object({ staffId: objectId.nullable() }).parse(req.body);
  if (booking.status === 'cancelled') throw new Error('A cancelled visit cannot be reassigned.');
  await validStaff(staffId); booking.staffId = staffId; await booking.save(); res.json({ ok: true });
});
app.get('/api/admin/bookings/:id', requireUser, requireStaff, async (req, res) => res.json({ booking: await ownedBooking(req) }));
app.get('/api/admin/users', requireUser, requireOwner, async (req, res) => {
  const q = String(req.query.q || '').trim(); const filter = q ? { $or: [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] } : {};
  const users = await User.find(filter).select('name email role phone title bio showPhone mutedUntil blocked').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ users: users.map(user => ({ ...user, _id: String(user._id) })) });
});
app.patch('/api/admin/users/:id', requireUser, requireOwner, async (req, res) => {
  const target = await User.findById(objectId.parse(req.params.id));
  if (!target) return res.status(404).json({ error: 'Account not found.' });
  if (target.role === 'owner' && (req.body.role || req.body.blocked || req.body.mutedUntil)) throw new Error('Owner access cannot be removed or muted here.');
  if (String(req.params.id) === String(req.user._id) && (req.body.role && req.body.role !== 'owner' || req.body.blocked === true)) throw new Error('The owner account cannot remove its own access.');
  const fields = z.object({ role: z.enum(['member', 'staff']).optional(), name: z.string().trim().min(2).max(80).optional(), phone: z.string().trim().max(30).optional(), title: z.string().trim().max(80).optional(), bio: z.string().trim().max(500).optional(), showPhone: z.boolean().optional(), blocked: z.boolean().optional(), mutedUntil: z.union([z.string().datetime(), z.null()]).optional() }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: fields }, { returnDocument: 'after' }); if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (fields.blocked) await Session.deleteMany({ userId: user._id }); res.json({ user: publicUser(user) });
});
app.get('/api/admin/reviews', requireUser, requireOwner, async (_req, res) => res.json({ reviews: await Review.find().sort({ createdAt: -1 }).limit(200).lean() }));
app.get('/api/admin/services', requireUser, requireOwner, async (_req, res) => res.json({ services: await effectiveServices({ includeDisabled: true }) }));
app.patch('/api/admin/services/:id', requireUser, requireOwner, async (req, res) => {
  const service = SERVICES.find(item => item.id === req.params.id); if (!service) return res.status(404).json({ error: 'Service not found.' });
  const fields = z.object({ cents: z.number().int().min(0).max(1000000), enabled: z.boolean() }).parse(req.body);
  if (service.id === 'training' && fields.cents !== 20000) throw new Error('The primary training price is fixed at $200/month by the current business directive.');
  const setting = await ServiceSetting.findOneAndUpdate({ _id: service.id }, { $set: { ...fields, updatedBy: req.user._id } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  await AuditEvent.create({ actorId: req.user._id, action: 'service.updated', targetType: 'service', targetId: service.id, details: fields });
  res.json({ service: { ...service, cents: setting.cents, enabled: setting.enabled } });
});
app.patch('/api/admin/reviews/:id', requireUser, requireOwner, async (req, res) => {
  const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
  const review = await Review.findByIdAndUpdate(objectId.parse(req.params.id), { $set: { hidden, moderatedAt: new Date(), moderatedBy: req.user._id } }, { returnDocument: 'after' });
  if (!review) return res.status(404).json({ error: 'Review not found.' });
  await AuditEvent.create({ actorId: req.user._id, action: hidden ? 'review.hidden' : 'review.restored', targetType: 'review', targetId: String(review._id) });
  res.json({ ok: true });
});
app.post('/api/admin/bookings/:id/refund', requireUser, requireOwner, rateLimit('refund', 8, 3600000), async (req, res) => {
  const stripe = stripeClient(); if (!stripe) return paymentsUnavailable(res);
  const booking = await ownedBooking(req);
  const result = await refundBooking(booking, req.user, stripe);
  await AuditEvent.create({ actorId: req.user._id, action: 'payment.refunded', targetType: 'booking', targetId: String(booking._id), details: { amountCents: result.amountCents, refundId: result.refundId } });
  res.json(result);
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
  const uploads = await MediaUpload.find({ completed: true, _id: { $in: stored.flatMap(lesson => [lesson.videoUpload, lesson.captionUpload, lesson.imageUpload].filter(Boolean)) } }).select('lessonId kind filename size').lean();
  const media = uploads.reduce((map, upload) => { (map[upload.lessonId] ||= {})[upload.kind] = { filename: upload.filename, size: upload.size }; return map; }, {});
  res.json({ lessons: [...lessons.values()].map(lesson => ({ ...lesson, media: media[lesson._id] || {} })) });
});
app.post('/api/admin/media/start', requireUser, requireStaff, async (req, res) => {
  const data = z.object({ lessonId: z.string().regex(/^[a-z0-9-]{1,80}$/), kind: z.enum(['video', 'captions', 'image']), filename: z.string().trim().min(1).max(160), contentType: z.string().max(100), size: z.number().int().positive().max(80 * 1024 * 1024), chunks: z.number().int().positive().max(220) }).parse(req.body);
  const allowed = data.kind === 'video' ? ['video/mp4', 'video/webm'] : data.kind === 'captions' ? ['text/vtt', 'text/plain'] : ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(data.contentType)) throw new Error(`Choose a supported ${data.kind} file.`);
  if (data.size > MEDIA_LIMITS[data.kind] || data.chunks !== Math.ceil(data.size / CHUNK_SIZE)) throw new Error('File exceeds the upload limit or has an invalid size.');
  if (await MediaUpload.countDocuments({ uploadedBy: req.user._id, completed: false, expiresAt: { $gt: new Date() } }) >= 10) throw new Error('Too many unfinished uploads. Try again after they expire.');
  if (!await Lesson.exists({ _id: data.lessonId })) throw new Error('Save the lesson draft before uploading media.');
  const upload = await MediaUpload.create({ _id: randomUUID(), ...data, uploadedBy: req.user._id, expiresAt: new Date(Date.now() + 24 * 3600000) }); res.status(201).json({ uploadId: upload._id });
});
app.put('/api/admin/media/:id/chunks/:index', requireUser, requireStaff, rateLimit('media-chunk', 240, 60000), async (req, res) => {
  const { data } = z.object({ data: z.string().min(1).max(560000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).parse(req.body);
  const bytes = Buffer.from(data, 'base64');
  await transaction(async session => {
    // Serialize chunk writes and completion on the same upload record.
    const upload = await MediaUpload.findOneAndUpdate({ _id: req.params.id, uploadedBy: req.user._id, completed: false, expiresAt: { $gt: new Date() } }, { $set: { updatedAt: new Date() } }, { returnDocument: 'after', session });
    if (!upload) throw Object.assign(new Error('Upload not found or expired.'), { status: 404 });
    const index = Number(req.params.index); if (!Number.isInteger(index) || index < 0 || index >= upload.chunks) throw new Error('Invalid upload chunk.');
    if (bytes.length !== Math.min(CHUNK_SIZE, upload.size - index * CHUNK_SIZE)) throw new Error('Upload chunk has an invalid size.');
    if (index === 0 && !validMediaHeader(upload.contentType, bytes)) throw new Error('This file does not match the selected format. Use MP4/WebM video, JPEG/PNG/WebP photos, or WEBVTT captions.');
    await MediaChunk.updateOne({ uploadId: upload._id, index }, { $set: { data: bytes, size: bytes.length, expiresAt: upload.expiresAt } }, { upsert: true, session });
  });
  res.json({ ok: true });
});
app.post('/api/admin/media/:id/complete', requireUser, requireStaff, async (req, res) => {
  let filename;
  await transaction(async session => {
    const upload = await MediaUpload.findOne({ _id: req.params.id, uploadedBy: req.user._id }).session(session);
    if (!upload || (!upload.completed && upload.expiresAt <= new Date())) throw new Error('Upload not found or expired.');
    filename = upload.filename; if (upload.completed) return;
    const chunks = await MediaChunk.find({ uploadId: upload._id }).sort({ index: 1 }).select('index size').session(session).lean();
    if (chunks.length !== upload.chunks || chunks.some((chunk, index) => chunk.index !== index || chunk.size !== Math.min(CHUNK_SIZE, upload.size - index * CHUNK_SIZE))) throw new Error('Upload is incomplete. Retry the file.');
    const first = await MediaChunk.findOne({ uploadId: upload._id, index: 0 }).select('data').session(session).lean();
    if (!first || !validMediaHeader(upload.contentType, mediaBytes(first.data))) throw new Error('Unsupported media contents.');
    const field = upload.kind === 'video' ? 'videoUpload' : upload.kind === 'captions' ? 'captionUpload' : 'imageUpload';
    const lesson = await Lesson.findById(upload.lessonId).session(session);
    if (!lesson) throw new Error('Lesson not found.');
    const oldId = lesson[field]; lesson[field] = upload._id;
    if (upload.kind === 'image') lesson.image = `/api/lessons/${upload.lessonId}/image`;
    else lesson.published = false;
    await lesson.save({ session });
    upload.completed = true; upload.expiresAt = undefined; await upload.save({ session });
    await MediaChunk.updateMany({ uploadId: upload._id }, { $unset: { expiresAt: 1 } }, { session });
    if (oldId) { await MediaUpload.deleteOne({ _id: oldId }, { session }); await MediaChunk.deleteMany({ uploadId: oldId }, { session }); }
  });
  res.json({ ok: true, filename });
});
app.delete('/api/admin/lessons/:id/media/:kind', requireUser, requireStaff, async (req, res) => {
  const kind = z.enum(['video', 'captions', 'image']).parse(req.params.kind), field = kind === 'video' ? 'videoUpload' : kind === 'captions' ? 'captionUpload' : 'imageUpload';
  await transaction(async session => {
    const lesson = await Lesson.findById(req.params.id).session(session); if (!lesson) throw new Error('Lesson not found.'); const uploadId = lesson[field];
    lesson[field] = undefined; if (kind === 'image') lesson.image = '/images/training-education.webp';
    else { lesson.published = false; lesson[kind === 'video' ? 'videoFile' : 'captionFile'] = ''; }
    await lesson.save({ session });
    if (uploadId) { await MediaUpload.deleteOne({ _id: uploadId }, { session }); await MediaChunk.deleteMany({ uploadId }, { session }); }
  });
  res.json({ ok: true });
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
app.get('/dog-sitting', (_req, res) => res.redirect(308, '/portal'));
app.use(express.static(clientDir, { maxAge: '1h', index: false, redirect: false }));
app.get('/{*path}', (req, res) => {
  const known = PAGE_METADATA[req.path];
  if (known?.private) res.set('X-Robots-Tag', 'noindex, nofollow');
  if (!known) res.status(404);
  res.sendFile(path.join(clientDir, known && req.path !== '/' ? req.path.slice(1) + '.html' : 'index.html'), { maxAge: 0 });
});
app.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  const status = error instanceof z.ZodError ? 400 : error.status || (error.code === 11000 ? 409 : error.name === 'CastError' ? 400 : 400);
  let message = error instanceof z.ZodError ? error.issues[0]?.message : error.message;
  if (error.code === 11000) message = 'That account or time slot already exists. Sign in or choose another opening.';
  if (status >= 500 || ['MongoServerError', 'MongoNetworkError'].includes(error.name)) message = 'The service is temporarily unavailable. Please try again or call Bravo.';
  res.status(status).json({ error: message || 'The request could not be completed.' });
});
export default app;
