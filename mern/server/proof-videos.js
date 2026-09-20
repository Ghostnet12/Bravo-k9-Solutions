import express from 'express';
import { requestError } from './errors.js';
import { securityHeaders } from './http-security.js';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { ProofVideo, ProofCarousel, MediaUpload, MediaChunk, AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { CHUNK_SIZE, MEDIA_LIMITS, validMediaHeader, mediaBytes, sendUploadedMedia } from './media.js';
import { DEFAULT_PROOF_VIDEOS, PROOF_PAGE_SIZE, PROOF_VIDEO_TYPES, compareProofVideos, normalizeFacebookReelUrl } from '../shared/proof-videos.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const idInput = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);
const revision = z.number().int().min(0);
const editInput = z.object({
  expectedRevision: revision, mutationId: z.uuid(), title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000), fit: z.enum(['contain', 'cover']), uploadId: z.uuid().optional(),
  facebookUrl: z.string().max(2048).refine(value => !!normalizeFacebookReelUrl(value)).transform(normalizeFacebookReelUrl).optional(),
  posterData: z.string().max(256 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).optional(),
}).strict().refine(input => !(input.uploadId && input.facebookUrl) && !(input.facebookUrl && input.posterData));
const uploadInput = z.object({ filename: z.string().trim().min(1).max(160), contentType: z.enum(PROOF_VIDEO_TYPES), size: z.number().int().min(1).max(MEDIA_LIMITS.video), chunks: z.number().int().min(1).max(Math.ceil(MEDIA_LIMITS.video / CHUNK_SIZE)) }).strict();
const chunkInput = z.object({ data: z.string().min(4).max(Math.ceil(CHUNK_SIZE / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict();
export function createProofVideoRouter({ VideoModel = ProofVideo, defaults = DEFAULT_PROOF_VIDEOS, apiPath = '/api/proof-videos', mediaScope = 'proof', withSettings = true } = {}) {
const defaultFor = id => defaults.find(clip => clip.id === id);
const scope = id => `${mediaScope}:${id}`;
const publicClip = row => {
  const original = defaultFor(row._id);
  const facebookUrl = row.uploadId ? null : normalizeFacebookReelUrl(row.facebookUrl || original?.facebookUrl);
  return { id: row._id, title: row.title, description: row.description, order: row.order, revision: row.revision,
    fit: row.fit || 'contain', src: row.uploadId ? `${apiPath}/${row._id}/video?v=${row.revision}` : null,
    poster: row.uploadId ? row.hasPoster ? `${apiPath}/${row._id}/poster?v=${row.revision}` : null : facebookUrl === original?.facebookUrl ? original.poster : null, facebookUrl };
};
const publicCarousel = row => ({ intervalSeconds: Math.max(2, row?.intervalSeconds ?? 8), revision: row?.revision ?? 0 });
const after = (clip, cursor) => !cursor || compareProofVideos(clip, cursor) > 0;
const router = express.Router();
router.use(securityHeaders(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
// Unconfigured previews retain the existing public proof, just as the rest of
// the homepage keeps its static content. Never mask a configured database error.
router.get('/', (_req, res, next) => !process.env.MONGODB_URI ? res.json({ clips: defaults, nextCursor: null, carousel: publicCarousel(null) }) : next());
router.use(async (_req, _res, next) => { await connectDb(); next(); });
router.param('id', (_req, _res, next, id) => { idInput.parse(id); next(); });
router.get('/', async (req, res) => {
  let cursor = null;
  if (req.query.after) {
    try {
      if (typeof req.query.after !== 'string' || req.query.after.length > 300) throw fail('Invalid cursor.');
      cursor = z.object({ id: idInput, order: z.number().int().min(0) }).parse(JSON.parse(Buffer.from(req.query.after, 'base64url').toString()));
    } catch { throw fail('Reload the videos to continue.'); }
  }
  const ids = defaults.map(clip => clip.id);
  const savedDefaults = await VideoModel.find({ _id: { $in: ids } }).lean();
  const resolvedDefaults = defaults.flatMap(clip => {
    const row = savedDefaults.find(row => row._id === clip.id);
    return row ? row.deleted ? [] : [publicClip(row)] : [clip];
  });
  const filter = { _id: { $nin: ids }, deleted: false, ...(cursor ? { $or: [{ order: { $gt: cursor.order } }, { order: cursor.order, _id: { $gt: cursor.id, $nin: ids } }] } : {}) };
  const added = await VideoModel.find(filter).sort({ order: 1, _id: 1 }).limit(PROOF_PAGE_SIZE + 1).lean();
  const clips = [...resolvedDefaults, ...added.map(publicClip)].filter(clip => after(clip, cursor)).sort(compareProofVideos);
  const page = clips.slice(0, PROOF_PAGE_SIZE), last = page.at(-1);
  res.json({ carousel: publicCarousel(await ProofCarousel.findById('home').lean()), clips: page, nextCursor: clips.length > PROOF_PAGE_SIZE ? Buffer.from(JSON.stringify({ id: last.id, order: last.order })).toString('base64url') : null });
});
router.get('/:id/video', async (req, res) => {
  const clip = await VideoModel.findOne({ _id: req.params.id, deleted: false }).lean();
  if (!clip?.uploadId) return res.status(404).json({ error: 'Video not found.' });
  // A public card must never become a route to a private lesson upload.
  if (!await MediaUpload.exists({ _id: clip.uploadId, lessonId: scope(clip._id), kind: 'video', completed: true })) return res.status(404).end();
  return sendUploadedMedia(clip.uploadId, req, res, 'video');
});
router.get('/:id/poster', async (req, res) => {
  const clip = await VideoModel.findOne({ _id: req.params.id, deleted: false }).select('+poster').lean();
  if (!clip?.poster) return res.status(404).end();
  res.type('image/jpeg').send(mediaBytes(clip.poster));
});

// Reuse the photo editor's real Owner/Administrator permission checks.
router.use(sameOrigin, cookieParser(), identify, requireUser, requireOwner);
if (!withSettings) router.all('/settings', (_req, res) => res.status(404).json({ error: 'Settings belong to the hero carousel.' }));
if (withSettings) router.put('/settings', rateLimit('proof-carousel-edit', 60, 3600000), express.json({ limit: '2kb' }), async (req, res) => {
  const data = z.object({ expectedRevision: revision, intervalSeconds: z.number().int().min(2).max(60) }).strict().parse(req.body);
  await ProofCarousel.init();
  let saved;
  await transaction(async session => {
    const current = await ProofCarousel.findById('home').session(session);
    if ((current?.revision || 0) !== data.expectedRevision) throw fail('Carousel timing changed. Reload the page before saving.', 409);
    const record = current || new ProofCarousel({ _id: 'home' });
    record.intervalSeconds = data.intervalSeconds; record.revision = data.expectedRevision + 1; record.updatedBy = req.user._id;
    await record.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'proof-carousel.published', targetType: 'proof-carousel', targetId: 'home', details: { revision: record.revision, intervalSeconds: record.intervalSeconds } }], { session });
    saved = publicCarousel(record);
  });
  res.json({ carousel: saved });
});
router.post('/:id/uploads', rateLimit('proof-upload-start', 120, 3600000), express.json({ limit: '8kb' }), async (req, res) => {
  const input = uploadInput.parse(req.body);
  if (input.chunks !== Math.ceil(input.size / CHUNK_SIZE)) throw fail('Invalid video size.');
  if (await MediaUpload.countDocuments({ uploadedBy: req.user._id, completed: false, expiresAt: { $gt: new Date() } }) >= 10) throw fail('Too many unfinished uploads. Try again after they expire.');
  const upload = await MediaUpload.create({ _id: randomUUID(), ...input, kind: 'video', lessonId: scope(req.params.id), uploadedBy: req.user._id, expiresAt: new Date(Date.now() + 24 * 3600000) });
  res.status(201).json({ uploadId: upload._id });
});
router.put('/:id/uploads/:uploadId/chunks/:index', rateLimit('proof-upload-chunk', 600, 60000), express.json({ limit: '560kb' }), async (req, res) => {
  const uploadId = z.uuid().parse(req.params.uploadId), bytes = Buffer.from(chunkInput.parse(req.body).data, 'base64');
  await transaction(async session => {
    const upload = await MediaUpload.findOneAndUpdate({ _id: uploadId, lessonId: scope(req.params.id), uploadedBy: req.user._id, completed: false, expiresAt: { $gt: new Date() } }, { $set: { updatedAt: new Date() } }, { returnDocument: 'after', session });
    if (!upload) throw fail('Upload expired. Choose the video again.', 404);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= upload.chunks || bytes.length !== Math.min(CHUNK_SIZE, upload.size - index * CHUNK_SIZE)) throw fail('Invalid video chunk. Retry the upload.');
    if (index === 0 && !validMediaHeader(upload.contentType, bytes)) throw fail('Choose an MP4, MOV or WebM video.');
    await MediaChunk.updateOne({ uploadId, index }, { $set: { data: bytes, size: bytes.length, expiresAt: upload.expiresAt } }, { upsert: true, session });
  });
  res.json({ saved: true });
});
router.put('/:id', rateLimit('proof-video-edit', 240, 3600000), express.json({ limit: '300kb' }), async (req, res) => {
  const input = editInput.parse(req.body), id = req.params.id;
  await VideoModel.init();
  let result;
  await transaction(async session => {
    let row = await VideoModel.findById(id).session(session);
    if (row?.lastMutation === input.mutationId && String(row.updatedBy) === String(req.user._id)) { result = publicClip(row); return; }
    if (row?.deleted || (row?.revision || 0) !== input.expectedRevision) throw fail('This video changed. Close and reopen the editor to get the latest version.', 409);
    const original = defaultFor(id);
    if (!row && !original && !input.uploadId && !input.facebookUrl) throw fail('Choose a video or paste a Facebook Reel URL before publishing.');
    const oldUploadId = row?.uploadId;
    if (input.uploadId) {
      const upload = await MediaUpload.findOneAndUpdate({ _id: input.uploadId, lessonId: scope(id), kind: 'video', uploadedBy: req.user._id, completed: false, expiresAt: { $gt: new Date() } }, { $set: { updatedAt: new Date() } }, { returnDocument: 'after', session });
      if (!upload) throw fail('Upload unavailable. Choose the video again.');
      const chunks = await MediaChunk.find({ uploadId: upload._id }).sort({ index: 1 }).select('index size').session(session).lean();
      if (chunks.length !== upload.chunks || chunks.some((chunk, index) => chunk.index !== index || chunk.size !== Math.min(CHUNK_SIZE, upload.size - index * CHUNK_SIZE))) throw fail('The video upload is incomplete. Retry publishing.');
      const first = await MediaChunk.findOne({ uploadId: upload._id, index: 0 }).select('data').session(session).lean();
      if (!first || !validMediaHeader(upload.contentType, mediaBytes(first.data))) throw fail('Unsupported video contents.');
      upload.completed = true; upload.expiresAt = undefined; await upload.save({ session });
      await MediaChunk.updateMany({ uploadId: upload._id }, { $unset: { expiresAt: 1 } }, { session });
    }
    row ||= new VideoModel({ _id: id, order: original?.order ?? Date.now() });
    row.title = input.title; row.description = input.description; row.fit = input.fit;
    if (input.uploadId) {
      row.uploadId = input.uploadId; row.facebookUrl = undefined; row.poster = undefined; row.hasPoster = false;
      if (input.posterData) {
        const poster = Buffer.from(input.posterData, 'base64');
        if (!validMediaHeader('image/jpeg', poster)) throw fail('Invalid video preview. Choose the video again.');
        row.poster = poster; row.hasPoster = true;
      }
    } else if (input.facebookUrl) {
      row.facebookUrl = input.facebookUrl; row.uploadId = undefined; row.poster = undefined; row.hasPoster = false;
    } else if (input.posterData) {
      if (!row.uploadId) throw fail('A thumbnail requires an uploaded video.');
      const poster = Buffer.from(input.posterData, 'base64');
      if (!validMediaHeader('image/jpeg', poster)) throw fail('Invalid video preview.');
      row.poster = poster; row.hasPoster = true;
    }
    row.revision = input.expectedRevision + 1; row.updatedBy = req.user._id; row.lastMutation = input.mutationId;
    await row.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: input.uploadId || input.facebookUrl ? `${mediaScope}-video.published` : `${mediaScope}-video.edited`, targetType: `${mediaScope}-video`, targetId: id, details: { revision: row.revision } }], { session });
    if (oldUploadId && oldUploadId !== row.uploadId) {
      const removed = await MediaUpload.deleteOne({ _id: oldUploadId, lessonId: scope(id) }, { session });
      if (removed.deletedCount) await MediaChunk.deleteMany({ uploadId: oldUploadId }, { session });
    }
    result = publicClip(row);
  });
  res.json({ clip: result });
});
router.delete('/:id', rateLimit('proof-video-edit', 240, 3600000), express.json({ limit: '2kb' }), async (req, res) => {
  const input = z.object({ expectedRevision: revision }).strict().parse(req.body), id = req.params.id;
  await transaction(async session => {
    let row = await VideoModel.findById(id).session(session);
    if (row?.deleted) return;
    const original = defaultFor(id);
    if (!row && !original) throw fail('Video not found.', 404);
    if ((row?.revision || 0) !== input.expectedRevision) throw fail('This video changed. Close and reopen the editor.', 409);
    row ||= new VideoModel({ _id: id, order: original.order });
    row.deleted = true; row.revision = input.expectedRevision + 1; row.updatedBy = req.user._id; row.lastMutation = undefined;
    if (row.uploadId) {
      const removed = await MediaUpload.deleteOne({ _id: row.uploadId, lessonId: scope(id) }, { session });
      if (removed.deletedCount) await MediaChunk.deleteMany({ uploadId: row.uploadId }, { session });
      row.uploadId = undefined; row.poster = undefined; row.hasPoster = false;
    }
    await row.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: `${mediaScope}-video.removed`, targetType: `${mediaScope}-video`, targetId: id }], { session });
  });
  res.json({ removed: true });
});
router.use((_req, res) => res.status(404).json({ error: 'Video endpoint not found.' }));
router.use((error, req, res, _next) => {
  if (res.headersSent) return res.end();
  const transport = requestError(error);
  if (transport) return res.status(transport.status).json({ error: transport.message });
  const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500;
  res.status(status).json({ error: error instanceof z.ZodError ? (req.path === '/settings' ? 'Choose a whole number from 2 to 60 seconds.' : 'Check the video size, title and description, then try again.') : status === 409 ? (req.path === '/settings' ? 'Carousel timing changed. Reload the page before saving.' : 'This video changed. Close and reopen the editor before saving.') : status >= 500 ? req.method === 'GET' ? 'Videos are temporarily unavailable. Please try again.' : 'Unable to confirm this update. Refresh to check before retrying.' : error.message });
});
return router;
}
export default createProofVideoRouter();
