import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import legacyApp from './app.js';
import { connectDb, transaction } from './db.js';
import { MediaUpload, MediaChunk, AuditEvent } from './models.js';
import { identify, requireUser, requireStaff, sameOrigin, rateLimit } from './auth.js';
import { CHUNK_SIZE, validMediaHeader, sendUploadedMedia } from './media.js';
import { SITE_IMAGE_KEY, SITE_IMAGE_MAX_BYTES } from '../shared/site-images.js';

// Keep the existing application and its middleware unchanged. This adapter owns
// only /api/site-images, and reuses the existing sessions, permissions and storage.
const snapshot = new mongoose.Schema({ uploadId: { type: String, default: null }, alt: { type: String, default: '' }, x: { type: Number, default: 50 }, y: { type: Number, default: 50 }, fit: { type: String, default: 'cover' } }, { _id: false });
export const SiteImage = mongoose.models.BravoSiteImage || mongoose.model('BravoSiteImage', new mongoose.Schema({ _id: String, current: snapshot, previous: snapshot, revision: { type: Number, default: 0 }, updatedBy: mongoose.Schema.Types.ObjectId }, { timestamps: true }));
const emptySnapshot = () => ({ uploadId: null, alt: '', x: 50, y: 50, fit: 'cover' });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const revisionInput = z.object({ expectedRevision: z.number().int().min(0) });
const imageInput = revisionInput.extend({ filename: z.string().trim().min(1).max(160), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().min(4).max(Math.ceil(SITE_IMAGE_MAX_BYTES / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), alt: z.string().trim().max(240), x: z.number().min(0).max(100), y: z.number().min(0).max(100), fit: z.enum(['cover', 'contain']) });
function publicImage(image) {
  return { revision: image.revision, src: image.current?.uploadId ? `/api/site-images/${image._id}/image?v=${image.revision}` : null, alt: image.current?.alt || '', x: image.current?.x ?? 50, y: image.current?.y ?? 50, fit: image.current?.fit || 'cover', canUndo: !!image.previous };
}
const router = express.Router();
router.use(helmet(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', async (_req, res) => {
  await connectDb();
  const images = await SiteImage.find().select('_id current revision previous.uploadId').limit(1000).lean();
  res.json({ images: Object.fromEntries(images.map(image => [image._id, publicImage(image)])) });
});
router.param('key', (req, _res, next, key) => { if (!SITE_IMAGE_KEY.test(key)) throw fail('Invalid image location.'); next(); });
router.get('/:key/image', async (req, res) => {
  await connectDb();
  const image = await SiteImage.findById(req.params.key).lean();
  if (!image?.current?.uploadId) return res.status(404).end();
  return sendUploadedMedia(image.current.uploadId, req, res, 'image');
});
// Authenticate BEFORE parsing image bodies. Revoked/blocked accounts are checked
// against the database by identify on every write, never trusted from the browser.
router.use(sameOrigin, cookieParser(), async (_req, _res, next) => { await connectDb(); await SiteImage.init(); next(); }, identify, requireUser, requireStaff, rateLimit('site-image-write', 60, 3600000), express.json({ limit: '4200kb' }));
router.put('/:key', async (req, res) => {
  const input = imageInput.parse(req.body), bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > SITE_IMAGE_MAX_BYTES || !validMediaHeader(input.contentType, bytes)) throw fail('Choose a valid JPEG, PNG or WebP image under 3 MB after optimization.');
  const uploadId = randomUUID(), key = req.params.key;
  let result;
  await transaction(async session => {
    const existing = await SiteImage.findById(key).session(session);
    if ((existing?.revision || 0) !== input.expectedRevision) throw fail('Another staff member changed this image. Close the editor and reopen it before publishing.', 409);
    const previous = existing?.current?.toObject() || emptySnapshot();
    const retiredId = existing?.previous?.uploadId;
    const chunks = Array.from({ length: Math.ceil(bytes.length / CHUNK_SIZE) }, (_, index) => {
      const data = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      return { uploadId, index, size: data.length, data };
    });
    await MediaUpload.create([{ _id: uploadId, lessonId: `site:${key}`, kind: 'image', filename: input.filename, contentType: input.contentType, size: bytes.length, chunks: chunks.length, uploadedBy: req.user._id, completed: true }], { session });
    await MediaChunk.insertMany(chunks, { session });
    const current = { uploadId, alt: input.alt, x: input.x, y: input.y, fit: input.fit };
    const image = existing || new SiteImage({ _id: key });
    image.current = current; image.previous = previous; image.revision = input.expectedRevision + 1; image.updatedBy = req.user._id;
    await image.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'site-image.replaced', targetType: 'site-image', targetId: key, details: { revision: image.revision, uploadId, previousUploadId: previous.uploadId } }], { session });
    // Retain one previous version; prune only the version no longer referenced.
    if (retiredId && ![uploadId, previous.uploadId].includes(retiredId)) {
      await MediaUpload.deleteOne({ _id: retiredId, lessonId: `site:${key}` }, { session });
      await MediaChunk.deleteMany({ uploadId: retiredId }, { session });
    }
    result = publicImage(image);
  });
  res.json({ image: result });
});
router.post('/:key/undo', async (req, res) => {
  const { expectedRevision } = revisionInput.parse(req.body);
  let result;
  await transaction(async session => {
    const image = await SiteImage.findById(req.params.key).session(session);
    if (!image || image.revision !== expectedRevision) throw fail('This image changed. Close the editor and reopen it before restoring.', 409);
    if (!image.previous) throw fail('There is no previous image to restore.');
    const current = image.current.toObject(); image.current = image.previous.toObject(); image.previous = current;
    image.revision += 1; image.updatedBy = req.user._id; await image.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'site-image.restored', targetType: 'site-image', targetId: req.params.key, details: { revision: image.revision } }], { session });
    result = publicImage(image);
  });
  res.json({ image: result });
});
router.use((_req, res) => res.status(404).json({ error: 'Image endpoint not found.' }));
router.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  const status = error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500;
  const message = error instanceof z.ZodError ? 'Check the image format, size and description, then try again.' : status === 409 ? 'This image changed while you were editing. Close and reopen the editor.' : status === 413 ? 'That image is too large. Choose a smaller photo.' : status >= 500 ? 'Unable to confirm the image update. Refresh the page to check before retrying.' : error.message;
  if (status >= 500) console.error('Bravo site-image operation failed', { status });
  res.status(status).json({ error: message });
});
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', process.env.VERCEL ? 1 : false);
app.use('/api/site-images', router);
app.use(legacyApp);
export default app;
