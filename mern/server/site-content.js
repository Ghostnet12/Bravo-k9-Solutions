import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { requestError } from './errors.js';
import { safeContentLink } from '../shared/site-content.js';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const contentInput = z.object({
  text: z.string().max(8000).optional(), link:z.string().max(1000).refine(safeContentLink).optional(), font: z.enum(['montserrat', 'bebas', 'system', 'georgia']).optional(),
  fontSize: z.number().int().min(12).max(100).optional(), color: color.optional(),
  background: z.enum(['solid', 'gradient', 'transparent']).optional(), backgroundColor: color.optional(), gradientEnd: color.optional(),
  angle: z.number().int().min(0).max(360).optional(), textAlign: z.enum(['left','center','right']).optional(),
  paddingY: z.number().int().min(0).max(160).optional(), opacity: z.number().min(.1).max(1).optional(),
}).strict();
export const SiteContent = mongoose.models.BravoSiteContent || mongoose.model('BravoSiteContent', new mongoose.Schema({ _id: String, value: mongoose.Schema.Types.Mixed, previous: mongoose.Schema.Types.Mixed, revision: { type: Number, default: 0 }, updatedBy: mongoose.Schema.Types.ObjectId }, { timestamps: true }));
const publicRow = row => ({ value: row.value || {}, revision: row.revision || 0, canUndo: row.previous != null });
export async function loadSiteContent() {
  await connectDb();
  const rows = await SiteContent.find({ _id: { $in: Object.keys(CONTENT_KEYS) } }).maxTimeMS(2000).lean();
  return Object.fromEntries(rows.map(row => [row._id, publicRow(row)]));
}
const router = express.Router();
router.use(helmet(), (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });
router.get('/', async (_req,res) => res.json({ entries: process.env.MONGODB_URI ? await loadSiteContent() : {} }));
router.use(sameOrigin, cookieParser(), async (_req,_res,next) => { await connectDb(); next(); }, identify, requireUser, requireOwner, rateLimit('site-content-write',120,3600000), express.json({ limit:'32kb' }));
router.put('/:key', async (req,res) => {
  const key = req.params.key;
  if (!Object.hasOwn(CONTENT_KEYS,key)) return res.status(400).json({ error:'This part of the site is managed through its existing controls.' });
  const input = z.object({ expectedRevision:z.number().int().min(0), value:contentInput.optional(), undo:z.literal(true).optional() }).strict().refine(v => !!v.undo !== !!v.value).parse(req.body);
  if (input.value?.text !== undefined && !CONTENT_KEYS[key].text) return res.status(400).json({ error:'Live information must be changed in its management screen.' });
  if (input.value?.link !== undefined && !CONTENT_KEYS[key].link) return res.status(400).json({error:'Select a website link to change its address.'});
  await SiteContent.init(); let saved;
  await transaction(async session => {
    const current = await SiteContent.findById(key).session(session);
    if ((current?.revision || 0) !== input.expectedRevision) throw Object.assign(new Error('Someone else changed this item. Close and reopen the editor before publishing.'), { status:409 });
    if (input.undo && current?.previous == null) throw Object.assign(new Error('No previous edit is available.'), { status:400 });
    const row = current || new SiteContent({ _id:key });
    const next = input.undo ? row.previous : input.value;
    row.previous = row.value || {}; row.value = next; row.revision = input.expectedRevision + 1; row.updatedBy = req.user._id;
    await row.save({ session });
    await AuditEvent.create([{ actorId:req.user._id, action:'site-content.published', targetType:'site-content', targetId:key, details:{revision:row.revision} }],{session});
    saved = publicRow(row);
  });
  res.json({entry:saved});
});
router.use((error,_req,res,_next) => { const known=requestError(error); const status=known?.status || (error instanceof z.ZodError ? 400 : error.code===11000 ? 409 : error.status || 500); res.status(status).json({error:known?.message || (status>=500?'Could not confirm publication. Reopen the editor to check your saved version.':error instanceof z.ZodError?'Check the text, colors, and size values.':error.message)}); });
export default router;
