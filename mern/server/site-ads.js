import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { AuditEvent, MediaUpload, MediaChunk, ProofVideo } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { requestError } from './errors.js';
import { CHUNK_SIZE, validMediaHeader, sendUploadedMedia } from './media.js';
import { SITE_IMAGE_MAX_BYTES } from '../shared/site-images.js';
import { cloneDefaultAds, DEFAULT_AD_CAROUSEL, normalizeAdSettings, safeAdLink, SITE_AD_ID } from '../shared/site-ads.js';

export const SiteAdCollection = mongoose.models.BravoSiteAds || mongoose.model('BravoSiteAds', new mongoose.Schema({
  _id: String,
  ads: [mongoose.Schema.Types.Mixed],
  settings: mongoose.Schema.Types.Mixed,
  revision: { type: Number, default: 0 },
  updatedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true }));

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const idInput = z.string().regex(SITE_AD_ID);
const linkInput = z.string().trim().max(1000).refine(value => !value || !!safeAdLink(value), 'Use a secure HTTPS or Bravo website link.');
const imageInput = z.object({
  filename: z.string().trim().min(1).max(160),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(4).max(Math.ceil(SITE_IMAGE_MAX_BYTES / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
const adFields = {
  title: z.string().trim().min(1).max(120),
  alt: z.string().trim().min(1).max(240),
  link: linkInput.default(''),
  enabled: z.boolean().default(true),
  videoId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/).or(z.literal('')).default(''),
};
const addInput = z.object({ expectedRevision: z.number().int().min(0), ...adFields, image: imageInput.optional() }).strict().refine(value => value.image || value.videoId, 'Choose artwork or a published training video.');
const updateInput = z.object({ expectedRevision: z.number().int().min(0), ...adFields, image: imageInput.optional() }).strict();
const revisionInput = z.object({ expectedRevision: z.number().int().min(0) }).strict();
const orderInput = z.object({
  expectedRevision: z.number().int().min(0),
  ids: z.array(idInput),
  settings: z.object({ autoplaySeconds: z.number().int().min(3).max(20) }).strict(),
}).strict();

const connect = async (_req, _res, next) => { await connectDb(); next(); };
const storedAds = row => row ? (Array.isArray(row.ads) ? row.ads : []).map(ad => ({ ...ad })) : cloneDefaultAds();
const publicAd = (ad, video) => ({
  id: ad.id,
  title: ad.title || '',
  alt: ad.alt || '',
  link: safeAdLink(ad.link || ''),
  enabled: ad.enabled !== false,
  videoId: ad.videoId || '', videoSrc: video?.uploadId && !video.deleted ? `/api/proof-videos/${video._id}/video?v=${video.revision}` : '',
  src: ad.uploadId ? `/api/site-ads/${ad.id}/image?v=${ad.imageRevision || 0}` : ad.image || '',
});
const publicCollection = async row => {
  const ads = storedAds(row).filter(ad => SITE_AD_ID.test(ad.id || ''));
  const videos = await ProofVideo.find({ _id: { $in: ads.map(ad => ad.videoId).filter(Boolean) }, deleted: false }).lean();
  return { revision: row?.revision || 0, settings: normalizeAdSettings(row?.settings || DEFAULT_AD_CAROUSEL),
    ads: ads.map(ad => publicAd(ad, videos.find(video => video._id === ad.videoId))) };
};
async function approvedVideo(videoId, session) {
  if (videoId && !await ProofVideo.exists({ _id: videoId, deleted: false, uploadId: { $exists: true } }).session(session)) throw fail('Choose an available published Bravo training video.');
}

async function imageBytes(input) {
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > SITE_IMAGE_MAX_BYTES || !validMediaHeader(input.contentType, bytes)) throw fail('Choose a valid JPEG, PNG or WebP ad image.');
  return bytes;
}
async function storeImage(adId, image, userId, session) {
  const bytes = await imageBytes(image), uploadId = randomUUID();
  const chunks = Array.from({ length: Math.ceil(bytes.length / CHUNK_SIZE) }, (_, index) => {
    const data = bytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    return { uploadId, index, size: data.length, data };
  });
  await MediaUpload.create([{ _id: uploadId, lessonId: `site-ad:${adId}`, kind: 'image', filename: image.filename, contentType: image.contentType, size: bytes.length, chunks: chunks.length, uploadedBy: userId, completed: true }], { session });
  await MediaChunk.insertMany(chunks, { session });
  return uploadId;
}
async function retireImage(adId, uploadId, session) {
  if (!uploadId) return;
  const removed = await MediaUpload.deleteOne({ _id: uploadId, lessonId: `site-ad:${adId}` }, { session });
  if (removed.deletedCount) await MediaChunk.deleteMany({ uploadId }, { session });
}
async function writeCollection(req, operation) {
  await SiteAdCollection.init();
  let response;
  await transaction(async session => {
    const current = await SiteAdCollection.findById('home').session(session);
    if ((current?.revision || 0) !== req.body.expectedRevision) throw fail('Another administrator changed the ad carousel. Close and reopen the editor to refresh it.', 409);
    const ads = storedAds(current);
    const result = await operation({ ads, current, session });
    const row = current || new SiteAdCollection({ _id: 'home' });
    row.ads = result.ads;
    row.settings = result.settings || row.settings || DEFAULT_AD_CAROUSEL;
    row.revision = (current?.revision || 0) + 1;
    row.updatedBy = req.user._id;
    await row.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: result.action, targetType: 'site-ads', targetId: result.targetId || 'home', details: { revision: row.revision, count: row.ads.length } }], { session });
    response = row.toObject();
  });
  return publicCollection(response);
}

const router = express.Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', connect, async (_req, res) => res.json(await publicCollection(await SiteAdCollection.findById('home').lean())));
router.get('/:id/image', connect, async (req, res) => {
  if (!SITE_AD_ID.test(req.params.id)) return res.status(404).end();
  const row = await SiteAdCollection.findById('home').lean();
  const ad = storedAds(row).find(item => item.id === req.params.id);
  if (!ad?.uploadId) return res.status(404).end();
  return sendUploadedMedia(ad.uploadId, req, res, 'image');
});

router.use(sameOrigin, cookieParser(), connect, identify, requireUser, requireOwner, rateLimit('site-ad-write', 80, 3600000), express.json({ limit: '4200kb' }));

router.post('/', async (req, res) => {
  const input = addInput.parse(req.body);
  const id = `ad-${randomUUID()}`;
  const saved = await writeCollection(req, async ({ ads, current, session }) => {
    await approvedVideo(input.videoId, session);
    const uploadId = input.image ? await storeImage(id, input.image, req.user._id, session) : undefined;
    return { ads: [...ads, { id, title: input.title, alt: input.alt, link: safeAdLink(input.link), enabled: input.enabled, videoId: input.videoId, uploadId, imageRevision: 1 }], settings: current?.settings, action: 'site-ad.created', targetId: id };
  });
  res.status(201).json(saved);
});

router.put('/:id', async (req, res) => {
  const id = idInput.parse(req.params.id), input = updateInput.parse(req.body);
  const saved = await writeCollection(req, async ({ ads, current, session }) => {
    const index = ads.findIndex(ad => ad.id === id);
    if (index < 0) throw fail('Advertisement not found.', 404);
    const previous = ads[index];
    await approvedVideo(input.videoId, session);
    let uploadId = previous.uploadId, imageRevision = previous.imageRevision || 0;
    if (input.image) {
      uploadId = await storeImage(id, input.image, req.user._id, session);
      imageRevision += 1;
      await retireImage(id, previous.uploadId, session);
    }
    const next = [...ads];
    next[index] = { ...previous, title: input.title, alt: input.alt, link: safeAdLink(input.link), enabled: input.enabled, videoId: input.videoId, uploadId, imageRevision };
    return { ads: next, settings: current?.settings, action: 'site-ad.updated', targetId: id };
  });
  res.json(saved);
});

router.put('/', async (req, res) => {
  const input = orderInput.parse(req.body);
  const saved = await writeCollection(req, async ({ ads }) => {
    const existing = new Set(ads.map(ad => ad.id));
    if (input.ids.length !== ads.length || new Set(input.ids).size !== input.ids.length || input.ids.some(id => !existing.has(id))) throw fail('The ad list changed. Reopen the editor before reordering.');
    const byId = new Map(ads.map(ad => [ad.id, ad]));
    return { ads: input.ids.map(id => byId.get(id)), settings: normalizeAdSettings(input.settings), action: 'site-ads.reordered' };
  });
  res.json(saved);
});

router.delete('/:id', async (req, res) => {
  const id = idInput.parse(req.params.id);
  revisionInput.parse(req.body);
  const saved = await writeCollection(req, async ({ ads, current, session }) => {
    const ad = ads.find(item => item.id === id);
    if (!ad) throw fail('Advertisement not found.', 404);
    await retireImage(id, ad.uploadId, session);
    return { ads: ads.filter(item => item.id !== id), settings: current?.settings, action: 'site-ad.deleted', targetId: id };
  });
  res.json(saved);
});

router.use((error, _req, res, _next) => {
  const known = requestError(error);
  const status = known?.status || (error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500);
  const message = known?.message || (error instanceof z.ZodError ? 'Check the ad title, link, image and carousel settings.' : status >= 500 ? 'The ad carousel could not be updated. Your current published ads are unchanged.' : error.message);
  res.status(status).json({ error: message });
});

export default router;
