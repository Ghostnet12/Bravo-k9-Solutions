import express from 'express';
import { securityHeaders } from './http-security.js';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { requestError } from './errors.js';
import { readWeather } from './banner-weather.js';
import { DEFAULT_BANNER } from '../shared/site-banner.js';
import { bannerSettingsInput } from './banner-settings.js';

export const SiteBanner = mongoose.models.BravoSiteBanner || mongoose.model('BravoSiteBanner', new mongoose.Schema({ _id: String, alerts: [String], settings: mongoose.Schema.Types.Mixed, revision: { type: Number, default: 0 }, updatedBy: mongoose.Schema.Types.ObjectId }, { timestamps: true }));
const input = z.object({ expectedRevision: z.number().int().min(0), alerts: z.array(z.string().trim().min(1).max(280)).max(30), settings: bannerSettingsInput.optional() }).strict();
const connect = async (_req, _res, next) => { await connectDb(); next(); };
const publicBanner = value => ({ alerts: value?.alerts || [], revision: value?.revision || 0, settings: { ...DEFAULT_BANNER, ...value?.settings } });
const router = express.Router();
router.use(securityHeaders(), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/weather', async (_req, res) => res.json({ weather: await readWeather() }));
router.get('/', connect, async (_req, res) => res.json(publicBanner(await SiteBanner.findById('home').lean())));
router.put('/', sameOrigin, cookieParser(), connect, identify, requireUser, requireOwner, rateLimit('banner-write', 60, 3600000), express.json({ limit: '32kb' }), async (req, res) => {
  const data = input.parse(req.body);
  await SiteBanner.init();
  let saved;
  await transaction(async session => {
    const current = await SiteBanner.findById('home').session(session);
    if ((current?.revision || 0) !== data.expectedRevision) throw Object.assign(new Error('Another administrator updated the alerts. Close and reopen the editor to load their changes.'), { status: 409 });
    const record = current || new SiteBanner({ _id: 'home' });
    record.alerts = data.alerts; record.revision = data.expectedRevision + 1; record.updatedBy = req.user._id;
    if (data.settings) record.settings = data.settings;
    await record.save({ session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'site-banner.published', targetType: 'site-banner', targetId: 'home', details: { revision: record.revision, count: data.alerts.length } }], { session });
    saved = publicBanner(record);
  });
  res.json(saved);
});
router.use((error, _req, res, _next) => {
  const transport = requestError(error);
  const status = transport?.status || (error instanceof z.ZodError ? 400 : error.code === 11000 ? 409 : Number(error.status) || 500);
  res.status(status).json({ error: transport?.message || (status >= 500 ? 'Banner updates are temporarily unavailable. Your draft has not been cleared.' : error instanceof z.ZodError ? 'Use up to 30 alerts, with 1–280 characters each.' : status === 409 ? 'Alerts changed while you were editing. Close and reopen the editor.' : error.message) });
});
export default router;
