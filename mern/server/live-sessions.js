import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { LiveSession, LivePeer, User, Booking, AuditEvent, Notification } from './models.js';
import { transaction } from './db.js';
import { lockStaffAuthorization } from './staff-authorization.js';
import { requireUser, requireStaff, rateLimit } from './auth.js';
import { assignedTrainerIds } from '../shared/trainers.js';
import { liveConfigured, LIVE_PEER_LEASE_MS, LIVE_ICE_SERVERS, validateDescription } from './live-media.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = z.string().uuid();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const cutoff = () => new Date(Date.now() - 75000);
const manages = (user, session) => user?.role === 'owner' || String(user?._id) === String(session.trainerId);
const visibility = user => ({ $or: [{ audience: 'public' }, ...(user ? [{ clientId: user._id }, { trainerId: user._id }, ...(user.role === 'owner' ? [{ audience: 'client' }] : [])] : [])] });
export const liveSummary = session => ({ id: session._id, trainerName: session.trainerName, dogName: session.dogName,
  audience: session.audience, status: session.status, startedAt: session.startedAt || null, lastSeenAt: session.lastSeenAt });

async function activeTrainer(session) {
  return User.exists({ _id: session.trainerId, role: { $in: ['staff', 'owner'] }, blocked: false, removedAt: null,
    credentialVersion: session.credentialVersion || { $in: [0, null] } });
}
async function closeSession(session) {
  await LiveSession.updateOne({ _id: session._id, open: true }, { $set: { open: false, status: 'ended', endedAt: new Date() }, $inc: { signalingRevision: 1 } });
  await LivePeer.deleteMany({ sessionId: session._id });
}
async function accessible(req, { publishing = false, allowEnded = false } = {}) {
  const session = await LiveSession.findOne({ _id: id.parse(req.params.id), ...(publishing ? {} : visibility(req.user)) });
  if (!session || (publishing && !manages(req.user, session))) throw fail('Live session not found.', 404);
  if (!allowEnded && (session.transport !== 'direct' || !session.open || session.status === 'ending' || session.lastSeenAt < cutoff())) throw fail('This live session has ended.', 410);
  return session;
}
const ready = (_req, res, next) => liveConfigured() ? next() : res.status(503).json({ error: 'Bravo Live is temporarily disabled.', code: 'LIVE_NOT_CONFIGURED' });
const description = type => z.object({ type: z.literal(type), sdp: z.string().max(40000) }).strict().refine(value => validateDescription(value, type), 'Invalid receive-only WebRTC session description.');
const peerSecret = z.string().regex(/^[a-f0-9]{64}$/);
const hash = value => createHash('sha256').update(value).digest('hex');
const viewerBinding = req => req.user ? { viewerId: req.user._id, credentialVersion: req.user.credentialVersion || 0 } : { viewerId: null };
const lease = () => new Date(Date.now() + LIVE_PEER_LEASE_MS);
async function peersForTrainer(session) {
  const peers = await LivePeer.find({ sessionId: session._id, expiresAt: { $gt: new Date() } }).lean();
  const viewerIds = [...new Set(peers.filter(peer => peer.viewerId).map(peer => String(peer.viewerId)))];
  const viewers = viewerIds.length ? await User.find({ _id: { $in: viewerIds }, blocked: false, removedAt: null })
    .select('_id credentialVersion').lean() : [];
  const versions = new Map(viewers.map(viewer => [String(viewer._id), viewer.credentialVersion || 0]));
  const revoked = peers.filter(peer => peer.viewerId && versions.get(String(peer.viewerId)) !== (peer.credentialVersion || 0));
  if (revoked.length) await LivePeer.deleteMany({ _id: { $in: revoked.map(peer => peer._id) } });
  const revokedIds = new Set(revoked.map(peer => peer._id));
  return peers.filter(peer => !revokedIds.has(peer._id)).map(peer => ({ id: peer._id, offer: peer.offer }));
}

export function liveRoutes(app) {
  app.get('/api/live', async (req, res) => {
    if (!liveConfigured()) return res.json({ sessions: [], serverTime: new Date() });
    const sessions = await LiveSession.find({ transport: 'direct', open: true, status: 'live', lastSeenAt: { $gt: cutoff() }, ...visibility(req.user) }).sort({ startedAt: -1 }).limit(20).lean();
    const allowed = await Promise.all(sessions.map(async session => await activeTrainer(session) ? liveSummary(session) : null));
    res.json({ sessions: allowed.filter(Boolean), serverTime: new Date() });
  });
  app.get('/api/live/studio', requireUser, requireStaff, async (req, res) => {
    const bookings = await Booking.find({ status: { $in: ['requested', 'confirmed'] },
      ...(req.user.role === 'owner' ? {} : { $or: [{ staffId: req.user._id }, { staffIds: req.user._id }] }),
    }).select('dogName userId visits staffId staffIds').populate({ path: 'userId', model: User, select: 'name blocked removedAt' }).sort({ updatedAt: -1 }).limit(150).lean();
    const sessions = await LiveSession.find({ open: true, ...(req.user.role === 'owner' ? {} : { trainerId: req.user._id }) }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({ configured: liveConfigured(), transport: 'direct', viewerLimit: null, serverTime: new Date(),
      bookings: bookings.filter(b => b.userId && !b.userId.blocked && !b.userId.removedAt).map(b => ({ id: String(b._id), dogName: b.dogName,
        clientName: b.userId.name, visits: b.visits })), sessions: sessions.map(s => ({ ...liveSummary(s), mine: String(s.trainerId) === String(req.user._id) })) });
  });
  app.post('/api/live', requireUser, requireStaff, ready, rateLimit('live-create', 12, 3600000), async (req, res) => {
    const data = z.object({ audience: z.enum(['public', 'client']), dogName: z.string().trim().min(1).max(80),
      bookingId: objectId.optional(), publicConsent: z.boolean().default(false) }).strict().parse(req.body);
    if (data.audience === 'public' && !data.publicConsent) throw fail('Confirm permission to show this session publicly.');
    if (data.audience === 'client' && !data.bookingId) throw fail('Choose the client’s saved training request for a private session.');
    const previous = await LiveSession.findOne({ trainerId: req.user._id, open: true });
    if (previous) {
      if (previous.lastSeenAt >= cutoff() && previous.status !== 'ending') throw fail('You already have a session. End it before starting another.', 409);
      await closeSession(previous);
    }
    let session;
    await transaction(async dbSession => {
      await lockStaffAuthorization(req.user, dbSession);
      let booking;
      if (data.bookingId) {
        booking = await Booking.findOne({ _id: data.bookingId, status: { $in: ['requested', 'confirmed'] } }).session(dbSession);
        if (!booking || (req.user.role !== 'owner' && !assignedTrainerIds(booking).includes(String(req.user._id)))) throw fail('Choose one of your assigned training requests.', 404);
        if (!await User.exists({ _id: booking.userId, blocked: false, removedAt: null }).session(dbSession)) throw fail('This client account is not available.', 404);
      }
      const sessionId = randomUUID();
      [session] = await LiveSession.create([{ _id: sessionId, trainerId: req.user._id,
        trainerName: req.user.publicName || req.user.name, credentialVersion: req.user.credentialVersion || 0,
        dogName: booking?.dogName || data.dogName, bookingId: booking?._id, clientId: booking?.userId,
        audience: data.audience, publicConsentAt: data.publicConsent ? new Date() : undefined,
        transport: 'direct', roomName: `bravo-${sessionId}`, publisherIdentity: `trainer-${randomUUID()}`, open: true, status: 'starting', lastSeenAt: new Date(),
      }], { session: dbSession });
      await AuditEvent.create([{ actorId: req.user._id, action: 'live.created', targetType: 'live', targetId: sessionId, details: { audience: data.audience } }], { session: dbSession });
    });
    res.status(201).json({ session: liveSummary(session), transport: 'direct', iceServers: LIVE_ICE_SERVERS, viewerLimit: null });
  });
  app.post('/api/live/:id/heartbeat', requireUser, requireStaff, ready, rateLimit('live-heartbeat', 20, 60000), async (req, res) => {
    const session = await accessible(req, { publishing: true });
    if (String(session.trainerId) !== String(req.user._id)) throw fail('Only the broadcasting trainer can keep this session live.', 403);
    if (!await activeTrainer(session)) { await closeSession(session); throw fail('Your account changed. Start a new session after signing in.', 403); }
    const { cameraReady } = z.object({ cameraReady: z.boolean() }).strict().parse(req.body);
    if (!cameraReady) {
      await LivePeer.deleteMany({ sessionId: session._id });
      await LiveSession.updateOne({ _id: session._id, open: true, status: { $in: ['starting', 'live'] } }, { $set: { status: 'starting' } });
      throw fail('Camera interrupted. Reconnect or end this session.', 409);
    }
    const updated = await LiveSession.findOneAndUpdate({ _id: session._id, open: true, status: { $in: ['starting', 'live'] } },
      { $set: { status: 'live', lastSeenAt: new Date(), startedAt: session.startedAt || new Date() } }, { returnDocument: 'after' });
    if (!updated) throw fail('This session has ended.', 410);
    if (!session.startedAt && session.audience === 'client') await Notification.updateOne({ _id: `live:${session._id}` }, { $setOnInsert: {
      userId: session.clientId, staff: false, body: `${session.trainerName} is live with ${session.dogName}.`, href: `/live?session=${session._id}`, createdAt: new Date(),
    } }, { upsert: true });
    res.json({ session: liveSummary(updated), peers: await peersForTrainer(updated), serverTime: new Date() });
  });
  app.post('/api/live/:id/watch', ready, rateLimit('live-watch', 12, 60000), async (req, res) => {
    const { offer } = z.object({ offer: description('offer') }).strict().parse(req.body);
    const session = await accessible(req);
    if (session.status !== 'live' || !await activeTrainer(session)) throw fail('This session is not broadcasting right now.', 410);
    const token = randomBytes(32).toString('hex'), peerId = randomUUID();
    await transaction(async dbSession => {
      // Serialize joins with session closure. A growing sequence preserves the
      // existing unique slot index without imposing a concurrent viewer cap.
      const locked = await LiveSession.findOneAndUpdate({ _id: session._id, open: true, status: 'live', lastSeenAt: { $gt: cutoff() } },
        { $inc: { signalingRevision: 1 } }, { session: dbSession, returnDocument: 'after' });
      if (!locked) throw fail('This session has ended.', 410);
      await LivePeer.deleteMany({ sessionId: session._id, expiresAt: { $lte: new Date() } }).session(dbSession);
      const slot = locked.signalingRevision;
      await LivePeer.create([{ _id: peerId, sessionId: session._id, slot, tokenHash: hash(token), ...viewerBinding(req), offer, expiresAt: lease() }], { session: dbSession });
    });
    res.json({ session: liveSummary(session), peerId, token });
  });
  app.post('/api/live/:id/peers/:peerId/poll', ready, rateLimit('live-peer-poll', 120, 60000), async (req, res) => {
    const { token } = z.object({ token: peerSecret }).strict().parse(req.body);
    const session = await accessible(req);
    if (session.status !== 'live' || !await activeTrainer(session)) throw fail('This session has ended.', 410);
    const peer = await LivePeer.findOneAndUpdate({ _id: id.parse(req.params.peerId), sessionId: session._id,
      tokenHash: hash(token), ...viewerBinding(req), expiresAt: { $gt: new Date() } }, { $set: { expiresAt: lease() } }, { returnDocument: 'after' });
    if (!peer) throw fail('This viewing connection has ended. Reconnect to watch.', 410);
    res.json({ answer: peer.answer?.sdp ? { type: peer.answer.type, sdp: peer.answer.sdp } : null });
  });
  app.post('/api/live/:id/peers/:peerId/answer', requireUser, requireStaff, ready, rateLimit('live-peer-answer', 30, 60000), async (req, res) => {
    const { answer } = z.object({ answer: description('answer') }).strict().parse(req.body);
    const session = await accessible(req, { publishing: true });
    if (String(session.trainerId) !== String(req.user._id) || !await activeTrainer(session)) throw fail('Only the broadcasting trainer may answer.', 403);
    const filter = { _id: id.parse(req.params.peerId), sessionId: session._id, expiresAt: { $gt: new Date() } };
    const updated = await LivePeer.updateOne({ ...filter, 'answer.sdp': { $exists: false } }, { $set: { answer } });
    // Retrying the same answer is safe after a lost response. Never replace a
    // negotiated fingerprint/description under an existing viewer capability.
    if (!updated.matchedCount && !await LivePeer.exists({ ...filter, 'answer.type': answer.type, 'answer.sdp': answer.sdp })) throw fail('This viewing connection is no longer waiting.', 410);
    res.json({ ok: true });
  });
  app.post('/api/live/:id/peers/:peerId/reject', requireUser, requireStaff, ready, rateLimit('live-peer-reject', 30, 60000), async (req, res) => {
    const session = await accessible(req, { publishing: true });
    if (String(session.trainerId) !== String(req.user._id) || !await activeTrainer(session)) throw fail('Only the broadcasting trainer may close this connection.', 403);
    await LivePeer.deleteOne({ _id: id.parse(req.params.peerId), sessionId: session._id });
    res.json({ ok: true });
  });
  app.post('/api/live/:id/peers/:peerId/leave', ready, rateLimit('live-peer-leave', 30, 60000), async (req, res) => {
    const { token } = z.object({ token: peerSecret }).strict().parse(req.body);
    // Allow cleanup after the session ends, without returning any session data.
    await LivePeer.deleteOne({ _id: id.parse(req.params.peerId), sessionId: id.parse(req.params.id), tokenHash: hash(token), ...viewerBinding(req) });
    res.json({ ok: true });
  });
  app.post('/api/live/:id/end', requireUser, requireStaff, ready, rateLimit('live-end', 20, 60000), async (req, res) => {
    const session = await accessible(req, { publishing: true, allowEnded: true });
    if (session.open) await closeSession(session);
    res.json({ ok: true });
  });
}
