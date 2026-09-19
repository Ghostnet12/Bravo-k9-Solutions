import express from 'express';
import { requestError } from './errors.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import legacyApp from './app.js';
import { connectDb, transaction } from './db.js';
import { MediaUpload, MediaChunk, AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { CHUNK_SIZE, validMediaHeader, sendUploadedMedia } from './media.js';
import { isEditableMediaKey, SITE_IMAGE_MAX_BYTES } from '../shared/site-images.js';
import { createHomepageHandler } from './homepage.js';
import proofVideoRouter from './proof-videos.js';

// Existing collection and image URLs remain compatible with saved portraits.
// Video records store framing only; actual video bytes still use the protected
// lesson upload/playback system, so no new public route can expose paid lessons.
const snapshot = new mongoose.Schema({ uploadId: { type: String, default: null }, alt: { type: String, default: '' }, x: { type: Number, default: 50 }, y: { type: Number, default: 50 }, zoom: { type: Number, default: 1 }, fit: { type: String, default: 'cover' }, framed: Boolean }, { _id: false });
export const SiteImage = mongoose.models.BravoSiteImage || mongoose.model('BravoSiteImage', new mongoose.Schema({ _id: String, current: snapshot, previous: snapshot, revision: { type: Number, default: 0 }, updatedBy: mongoose.Schema.Types.ObjectId }, { timestamps: true }));
const emptySnapshot = () => ({ uploadId: null, alt: '', x: 50, y: 50, zoom: 1, fit: 'cover', framed: false });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const revisionInput = z.object({ expectedRevision: z.number().int().min(0) });
const framingInput = revisionInput.extend({ alt: z.string().trim().max(240), x: z.number().min(0).max(100), y: z.number().min(0).max(100), zoom: z.number().min(1).max(3).default(1), fit: z.enum(['cover', 'contain']) });
const imageInput = framingInput.extend({ filename: z.string().trim().min(1).max(160), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().min(4).max(Math.ceil(SITE_IMAGE_MAX_BYTES / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) });
function publicImage(image) {
  return { revision: image.revision, src: image.current?.uploadId ? `/api/site-images/${image._id}/image?v=${image.revision}` : null, alt: image.current?.alt || '', x: image.current?.x ?? 50, y: image.current?.y ?? 50, zoom: image.current?.zoom ?? 1, fit: image.current?.fit || 'cover', framed: image.current?.framed ?? !!image.current?.uploadId, canUndo: !!image.previous };
}
export const homepageHandler = createHomepageHandler({ loadHero: async () => {
  await connectDb();
  const image = await SiteImage.findById('home-hero').select('_id current revision previous.uploadId').maxTimeMS(2000).lean();
  return image ? publicImage(image) : null;
} });
function mediaError(error, _req, res, _next) {
  if (res.headersSent) return res.end();
  const transport = requestError(error);
  if (transport) return res.status(transport.status).json({ error: transport.message });
  const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500;
  const message = error instanceof z.ZodError ? 'Check the file format, size, zoom and description, then try again.' : status === 409 ? 'This media changed while you were editing. Close and reopen the editor.' : status === 413 ? 'That file is too large. Choose a smaller file.' : status >= 500 ? 'Unable to confirm this update. Refresh to check before retrying.' : error.message;
  if (status >= 500) console.error('Bravo media operation failed', { status });
  res.status(status).json({ error: message });
}
const connect = async (_req, _res, next) => { await connectDb(); next(); };
const router = express.Router();
router.use(helmet(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.param('key', (_req, _res, next, key) => { if (!isEditableMediaKey(key)) throw fail('Only website photos and videos can be edited.', 400); next(); });
router.get('/', connect, async (_req, res) => {
  const images = await SiteImage.find().select('_id current revision previous.uploadId').limit(1000).lean();
  res.json({ images: Object.fromEntries(images.filter(image => isEditableMediaKey(image._id)).map(image => [image._id, publicImage(image)])) });
});
router.get('/:key/image', connect, async (req, res) => {
  if (req.params.key.startsWith('video-')) return res.status(404).end();
  const image = await SiteImage.findById(req.params.key).lean();
  if (!image?.current?.uploadId) return res.status(404).end();
  return sendUploadedMedia(image.current.uploadId, req, res, 'image');
});
// Administrator accounts carry role=owner; ordinary staff are explicitly denied.
// Authenticate before allocating memory to large JSON/base64 bodies.
router.use(sameOrigin, cookieParser(), connect, identify, requireUser, requireOwner, rateLimit('site-image-write', 120, 3600000), express.json({ limit: '4200kb' }));
async function saveEdit(req, input, bytes = null) {
  await SiteImage.init();
  const key = req.params.key, newUploadId = bytes ? randomUUID() : null;
  let result;
  await transaction(async session => {
    const existing = await SiteImage.findById(key).session(session);
    if ((existing?.revision || 0) !== input.expectedRevision) throw fail('Another administrator changed this media.', 409);
    const previous = existing?.current?.toObject() || emptySnapshot();
    const retiredId = existing?.previous?.uploadId;
    if (bytes) {
      const chunks = Array.from({ length: Math.ceil(bytes.length / CHUNK_SIZE) }, (_, index) => {
        const data = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        return { uploadId: newUploadId, index, size: data.length, data };
      });
      await MediaUpload.create([{ _id: newUploadId, lessonId: `site:${key}`, kind: 'image', filename: input.filename, contentType: input.contentType, size: bytes.length, chunks: chunks.length, uploadedBy: req.user._id, completed: true }], { session });
      await MediaChunk.insertMany(chunks, { session });
    }
    const image = existing || new SiteImage({ _id: key });
    image.current = { uploadId: newUploadId || previous.uploadId, alt: input.alt, x: input.x, y: input.y, zoom: input.zoom, fit: input.fit, framed: true };
    image.previous = previous; image.revision = input.expectedRevision + 1; image.updatedBy = req.user._id;
    await image.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: bytes ? 'site-image.replaced' : 'site-media.reframed', targetType: 'site-image', targetId: key, details: { revision: image.revision, uploadId: image.current.uploadId } }], { session });
    if (retiredId && ![image.current.uploadId, previous.uploadId].includes(retiredId)) {
      const removed = await MediaUpload.deleteOne({ _id: retiredId, lessonId: `site:${key}` }, { session });
      if (removed.deletedCount) await MediaChunk.deleteMany({ uploadId: retiredId }, { session });
    }
    result = publicImage(image);
  });
  return result;
}
// A metadata-only save never re-uploads or recompresses the existing file.
router.patch('/:key', async (req, res) => res.json({ image: await saveEdit(req, framingInput.parse(req.body)) }));
router.put('/:key', async (req, res) => {
  if (req.params.key.startsWith('video-')) throw fail('Use the protected lesson video uploader.');
  const input = imageInput.parse(req.body), bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > SITE_IMAGE_MAX_BYTES || !validMediaHeader(input.contentType, bytes)) throw fail('Choose a valid JPEG, PNG or WebP photo.');
  res.json({ image: await saveEdit(req, input, bytes) });
});
router.post('/:key/undo', async (req, res) => {
  const { expectedRevision } = revisionInput.parse(req.body);
  let result;
  await transaction(async session => {
    const image = await SiteImage.findById(req.params.key).session(session);
    if (!image || image.revision !== expectedRevision) throw fail('This media changed.', 409);
    if (!image.previous) throw fail('There is no previous edit to restore.');
    const current = image.current.toObject(); image.current = image.previous.toObject(); image.previous = current;
    image.revision += 1; image.updatedBy = req.user._id; await image.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'site-media.restored', targetType: 'site-image', targetId: req.params.key, details: { revision: image.revision } }], { session });
    result = publicImage(image);
  });
  res.json({ image: result });
});
router.use((_req, res) => res.status(404).json({ error: 'Media endpoint not found.' }));
router.use(mediaError);
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', process.env.VERCEL ? 1 : false);
app.get(['/', '/api/homepage'], helmet({ contentSecurityPolicy: { directives: { mediaSrc: ["'self'", 'blob:'], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null } } }), homepageHandler);
app.use('/api/site-images', router);
app.use('/api/proof-videos', proofVideoRouter);
// Close the old upload/delete/publish routes too, not just the inline editor.
// Staff keep scheduling and other operational tools, but cannot change media
// indirectly through lesson saves or an already-open upload screen.
const studioGuard = express.Router();
studioGuard.use((req, _res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next('router') : next());
studioGuard.use(sameOrigin, cookieParser(), connect, identify, requireUser, requireOwner);
studioGuard.use(mediaError);
app.use(['/api/admin/media', '/api/admin/lessons'], studioGuard);
app.use(legacyApp);
export default app;
