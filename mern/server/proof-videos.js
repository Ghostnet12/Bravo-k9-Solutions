import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { ProofVideo, MediaUpload, MediaChunk, AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { CHUNK_SIZE, MEDIA_LIMITS, validMediaHeader, mediaBytes, sendUploadedMedia } from './media.js';
import { DEFAULT_PROOF_VIDEOS, PROOF_PAGE_SIZE, PROOF_VIDEO_TYPES, compareProofVideos } from '../shared/proof-videos.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const idInput = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);
const revision = z.number().int().min(0);
const editInput = z.object({
  expectedRevision: revision, mutationId: z.uuid(), title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000), fit: z.enum(['contain', 'cover']), uploadId: z.uuid().optional(),
  posterData: z.string().max(256 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).optional(),
}).strict();
const uploadInput = z.object({ filename: z.string().trim().min(1).max(160), contentType: z.enum(PROOF_VIDEO_TYPES), size: z.number().int().min(1).max(MEDIA_LIMITS.video), chunks: z.number().int().min(1).max(Math.ceil(MEDIA_LIMITS.video / CHUNK_SIZE)) }).strict();
const chunkInput = z.object({ data: z.string().min(4).max(Math.ceil(CHUNK_SIZE / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict();
const defaultFor = id => DEFAULT_PROOF_VIDEOS.find(clip => clip.id === id);
const scope = id => `proof:${id}`;
const publicClip = row => {
  const original = defaultFor(row._id);
  return { id: row._id, title: row.title, description: row.description, order: row.order, revision: row.revision,
    fit: row.fit || 'contain', src: row.uploadId ? `/api/proof-videos/${row._id}/video?v=${row.revision}` : null,
    poster: row.uploadId ? row.hasPoster ? `/api/proof-videos/${row._id}/poster?v=${row.revision}` : null : original?.poster || null, facebookUrl: row.uploadId ? null : original?.facebookUrl || null };
};
const after = (clip, cursor) => !cursor || compareProofVideos(clip, cursor) > 0;
const router = express.Router();
router.use(helmet(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
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
  const ids = DEFAULT_PROOF_VIDEOS.map(clip => clip.id);
  const savedDefaults = await ProofVideo.find({ _id: { $in: ids } }).lean();
  const defaults = DEFAULT_PROOF_VIDEOS.flatMap(clip => {
    const row = savedDefaults.find(row => row._id === clip.id);
    return row ? row.deleted ? [] : [publicClip(row)] : [clip];
  });
  const filter = { _id: { $nin: ids }, deleted: false, ...(cursor ? { $or: [{ order: { $gt: cursor.order } }, { order: cursor.order, _id: { $gt: cursor.id, $nin: ids } }] } : {}) };
  const added = await ProofVideo.find(filter).sort({ order: 1, _id: 1 }).limit(PROOF_PAGE_SIZE + 1).lean();
  const clips = [...defaults, ...added.map(publicClip)].filter(clip => after(clip, cursor)).sort(compareProofVideos);
  const page = clips.slice(0, PROOF_PAGE_SIZE), last = page.at(-1);
  res.json({ clips: page, nextCursor: clips.length > PROOF_PAGE_SIZE ? Buffer.from(JSON.stringify({ id: last.id, order: last.order })).toString('base64url') : null });
});
router.get('/:id/video', async (req, res) => {
  const clip = await ProofVideo.findOne({ _id: req.params.id, deleted: false }).lean();
  if (!clip?.uploadId) return res.status(404).json({ error: 'Video not found.' });
  // A public card must never become a route to a private lesson upload.
  if (!await MediaUpload.exists({ _id: clip.uploadId, lessonId: scope(clip._id), kind: 'video', completed: true })) return res.status(404).end();
  return sendUploadedMedia(clip.uploadId, req, res, 'video');
});
router.get('/:id/poster', async (req, res) => {
  const clip = await ProofVideo.findOne({ _id: req.params.id, deleted: false }).select('+poster').lean();
  if (!clip?.poster) return res.status(404).end();
  res.type('image/jpeg').send(mediaBytes(clip.poster));
});

// Reuse the photo editor's real Owner/Administrator permission checks.
router.use(sameOrigin, cookieParser(), identify, requireUser, requireOwner);
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
  let result;
  await transaction(async session => {
    let row = await ProofVideo.findById(id).session(session);
    if (row?.lastMutation === input.mutationId && String(row.updatedBy) === String(req.user._id)) { result = publicClip(row); return; }
    if (row?.deleted || (row?.revision || 0) !== input.expectedRevision) throw fail('This video changed. Close and reopen the editor to get the latest version.', 409);
    const original = defaultFor(id);
    if (!row && !original && !input.uploadId) throw fail('Choose a video before publishing.');
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
    row ||= new ProofVideo({ _id: id, order: original?.order ?? Date.now() });
    row.title = input.title; row.description = input.description; row.fit = input.fit;
    if (input.uploadId) {
      row.uploadId = input.uploadId; row.poster = undefined; row.hasPoster = false;
      if (input.posterData) {
        const poster = Buffer.from(input.posterData, 'base64');
        if (!validMediaHeader('image/jpeg', poster)) throw fail('Invalid video preview. Choose the video again.');
        row.poster = poster; row.hasPoster = true;
      }
    } else if (input.posterData) throw fail('A thumbnail requires a replacement video.');
    row.revision = input.expectedRevision + 1; row.updatedBy = req.user._id; row.lastMutation = input.mutationId;
    await row.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: input.uploadId ? 'proof-video.published' : 'proof-video.edited', targetType: 'proof-video', targetId: id, details: { revision: row.revision } }], { session });
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
    let row = await ProofVideo.findById(id).session(session);
    if (row?.deleted) return;
    const original = defaultFor(id);
    if (!row && !original) throw fail('Video not found.', 404);
    if ((row?.revision || 0) !== input.expectedRevision) throw fail('This video changed. Close and reopen the editor.', 409);
    row ||= new ProofVideo({ _id: id, order: original.order });
    row.deleted = true; row.revision = input.expectedRevision + 1; row.updatedBy = req.user._id; row.lastMutation = undefined;
    if (row.uploadId) {
      const removed = await MediaUpload.deleteOne({ _id: row.uploadId, lessonId: scope(id) }, { session });
      if (removed.deletedCount) await MediaChunk.deleteMany({ uploadId: row.uploadId }, { session });
      row.uploadId = undefined; row.poster = undefined; row.hasPoster = false;
    }
    await row.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'proof-video.removed', targetType: 'proof-video', targetId: id }], { session });
  });
  res.json({ removed: true });
});
router.use((_req, res) => res.status(404).json({ error: 'Video endpoint not found.' }));
router.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500;
  res.status(status).json({ error: error instanceof z.ZodError ? 'Check the video size, title and description, then try again.' : status === 409 ? 'This video changed. Close and reopen the editor before saving.' : status >= 500 ? 'Unable to confirm this update. Refresh to check before retrying.' : error.message });
});
export default router;
