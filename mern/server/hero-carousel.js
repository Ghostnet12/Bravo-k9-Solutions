import express from 'express';
import cookieParser from 'cookie-parser';
import { securityHeaders } from './http-security.js';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { HeroCarousel, AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { DEFAULT_HERO_CAROUSEL, isHeroMediaKey } from '../shared/hero-carousel.js';
const router = express.Router();
const visible = row => row ? { revision: row.revision, intervalSeconds: row.intervalSeconds, photos: row.photos } : DEFAULT_HERO_CAROUSEL;
router.use(securityHeaders(), (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', async (_req, res) => {
  if (!process.env.MONGODB_URI) return res.json({ carousel: DEFAULT_HERO_CAROUSEL });
  await connectDb(); res.json({ carousel: visible(await HeroCarousel.findById('home').lean()) });
});
router.put('/', sameOrigin, cookieParser(), async (_req, _res, next) => { await connectDb(); next(); }, identify, requireUser, requireOwner, rateLimit('hero-carousel-edit', 60, 3600000), express.json({ limit: '16kb' }), async (req, res) => {
  const data = z.object({ expectedRevision: z.number().int().min(0), intervalSeconds: z.number().int().min(2).max(60), photos: z.array(z.string().refine(isHeroMediaKey)).max(100).refine(photos => new Set(photos).size === photos.length) }).strict().parse(req.body);
  await HeroCarousel.init(); let saved;
  await transaction(async session => {
    const current = await HeroCarousel.findById('home').session(session);
    if ((current?.revision || 0) !== data.expectedRevision) throw Object.assign(new Error('The photo carousel changed. Reload before saving.'), { status: 409 });
    const row = current || new HeroCarousel({ _id: 'home' });
    row.photos = data.photos; row.intervalSeconds = data.intervalSeconds; row.revision = data.expectedRevision + 1; row.updatedBy = req.user._id;
    await row.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'hero-carousel.published', targetType: 'hero-carousel', targetId: 'home', details: { revision: row.revision, photoCount: data.photos.length + 1 } }], { session });
    saved = visible(row);
  });
  res.json({ carousel: saved });
});
router.use((error, _req, res, _next) => res.status(error instanceof z.ZodError ? 400 : error.status || 500).json({ error: error instanceof z.ZodError ? 'Choose 2–60 seconds and valid, unique photos or videos (up to 100 additional items).' : error.status === 409 ? error.message : 'Unable to load or save the photo carousel. Please try again.' }));
export default router;
