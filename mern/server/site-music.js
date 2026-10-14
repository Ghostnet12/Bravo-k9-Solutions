import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { MediaUpload, MediaChunk, AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { CHUNK_SIZE, mediaBytes, sendUploadedMedia } from './media.js';
import { securityHeaders } from './http-security.js';
import { requestError } from './errors.js';
import { DEFAULT_MUSIC, MUSIC_MAX_BYTES, validAudioHeader } from '../shared/music-playlist.js';
export const MusicPlaylist = mongoose.models.BravoMusicPlaylist || mongoose.model('BravoMusicPlaylist', new mongoose.Schema({ _id: String, enabled: Boolean, startId: String, tracks: [new mongoose.Schema({ id: String, title: String, enabled: Boolean }, { _id: false })], revision: Number }, { timestamps: true }));
export const playlistInput = z.object({ expectedRevision: z.number().int().min(0), enabled: z.boolean(), startId: z.string().max(80), tracks: z.array(z.object({ id: z.string().regex(/^(bravo-original|[a-f0-9-]{36})$/), title: z.string().trim().min(1).max(100), enabled: z.boolean() }).strict()).max(50) }).strict().refine(data => new Set(data.tracks.map(t => t.id)).size === data.tracks.length && (!data.startId || data.tracks.some(t => t.id === data.startId && t.enabled)), 'Select an enabled starting song and use unique tracks.');
const connect = async (_req, _res, next) => { await connectDb(); next(); };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const publicPlaylist = row => row ? { revision: row.revision, enabled: row.enabled, startId: row.startId, tracks: row.tracks.map(t => ({ id: t.id, title: t.title, enabled: t.enabled, src: t.id === 'bravo-original' ? DEFAULT_MUSIC.tracks[0].src : `/api/site-music/tracks/${t.id}` })) } : DEFAULT_MUSIC;
const router = express.Router();
router.use(securityHeaders(), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/', connect, async (_req, res) => res.json(publicPlaylist(await MusicPlaylist.findById('site').lean())));
router.get('/tracks/:id', connect, async (req, res) => {
  // Only playlist audio can be streamed here; never expose lesson media.
  const published = await MusicPlaylist.exists({ _id: 'site', 'tracks.id': req.params.id });
  if (!published) return res.status(404).json({ error: 'Song not found.' });
  return sendUploadedMedia(req.params.id, req, res, 'audio', { cacheControl: 'public, max-age=3600' });
});
router.use(sameOrigin, cookieParser(), connect, identify, requireUser, requireOwner, rateLimit('music-write', 600, 3600000), express.json({ limit: '600kb' }));
router.post('/uploads', async (req, res) => {
  const data = z.object({ filename: z.string().trim().min(1).max(160), contentType: z.enum(['audio/mpeg', 'audio/mp4']), size: z.number().int().min(16).max(MUSIC_MAX_BYTES) }).strict().parse(req.body);
  if (await MediaUpload.countDocuments({ uploadedBy: req.user._id, kind: 'audio', completed: false, expiresAt: { $gt: new Date() } }) >= 10) throw fail('Too many unfinished songs. Please try again after they expire.');
  const upload = await MediaUpload.create({ _id: randomUUID(), ...data, chunks: Math.ceil(data.size / CHUNK_SIZE), uploadedBy: req.user._id, kind: 'audio', expiresAt: new Date(Date.now() + 86400000) });
  res.status(201).json({ id: upload._id, chunkSize: CHUNK_SIZE });
});
router.put('/uploads/:id/chunks/:index', async (req, res) => {
  const { data } = z.object({ data: z.string().min(4).max(Math.ceil(CHUNK_SIZE / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict().parse(req.body);
  const bytes = Buffer.from(data, 'base64');
  await transaction(async session => {
    const upload = await MediaUpload.findOneAndUpdate({ _id: req.params.id, kind: 'audio', uploadedBy: req.user._id, completed: false, expiresAt: { $gt: new Date() } }, { $set: { updatedAt: new Date() } }, { returnDocument: 'after', session });
    if (!upload) throw fail('Upload not found or expired.', 404);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= upload.chunks || bytes.length !== Math.min(CHUNK_SIZE, upload.size - index * CHUNK_SIZE)) throw fail('Invalid audio chunk.');
    if (index === 0 && !validAudioHeader(upload.contentType, bytes)) throw fail('Use a valid MP3 or M4A audio file.');
    await MediaChunk.updateOne({ uploadId: upload._id, index }, { $set: { data: bytes, size: bytes.length, expiresAt: upload.expiresAt } }, { upsert: true, session });
  });
  res.json({ ok: true });
});
router.put('/', async (req, res) => {
  const data = playlistInput.parse(req.body);
  await MusicPlaylist.init();
  let saved;
  await transaction(async session => {
    const current = await MusicPlaylist.findById('site').session(session);
    if ((current?.revision || 0) !== data.expectedRevision) throw fail('Music changed in another editor. Close and reopen to load the latest playlist.', 409);
    for (const track of data.tracks) {
      if (track.id === 'bravo-original') continue;
      const upload = await MediaUpload.findOne({ _id: track.id, kind: 'audio' }).session(session);
      if (!upload) throw fail('A song is unavailable. Upload it again.');
      if (!upload.completed) {
        if (String(upload.uploadedBy) !== String(req.user._id) || upload.expiresAt <= new Date()) throw fail('Upload not found or expired.', 404);
        const chunks = await MediaChunk.find({ uploadId: track.id }).sort({ index: 1 }).select('index size').session(session).lean();
        const first = await MediaChunk.findOne({ uploadId: track.id, index: 0 }).session(session);
        if (chunks.length !== upload.chunks || chunks.some((c, i) => c.index !== i || c.size !== Math.min(CHUNK_SIZE, upload.size - i * CHUNK_SIZE)) || !first || !validAudioHeader(upload.contentType, mediaBytes(first.data))) throw fail('Song upload is incomplete.');
        upload.completed = true; upload.expiresAt = undefined; await upload.save({ session });
        await MediaChunk.updateMany({ uploadId: track.id }, { $unset: { expiresAt: 1 } }, { session });
      }
    }
    const record = current || new MusicPlaylist({ _id: 'site' });
    record.enabled = data.enabled; record.startId = data.startId; record.tracks = data.tracks; record.revision = data.expectedRevision + 1;
    await record.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'site-music.published', targetType: 'site-music', targetId: 'site', details: { revision: record.revision, count: data.tracks.length } }], { session });
    saved = publicPlaylist(record);
  });
  res.json(saved);
});
router.use((error, _req, res, _next) => {
  const transport = requestError(error);
  const status = transport?.status || (error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500);
  res.status(status).json({ error: transport?.message || (status >= 500 ? 'Music is temporarily unavailable. Your draft is still here.' : error instanceof z.ZodError ? 'Check song titles, file format, size, and starting song.' : error.message) });
});
export default router;
