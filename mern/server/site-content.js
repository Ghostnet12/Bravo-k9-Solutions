import express from 'express';
import { securityHeaders } from './http-security.js';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { connectDb, transaction } from './db.js';
import { AuditEvent } from './models.js';
import { identify, requireUser, requireOwner, sameOrigin, rateLimit } from './auth.js';
import { requestError } from './errors.js';
import { safeContentLink } from '../shared/site-content.js';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';
import { SiteContent, loadSiteContent, publicSiteContentRow } from './site-content-store.js';
import { SiteImage } from './site-image-store.js';
import { retainBackgroundImages } from './background-images.js';
export { SiteContent, loadSiteContent } from './site-content-store.js';
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const contentInput = z.object({
  mediaKind: z.enum(['automatic', 'photo', 'video']).optional(),
  text: z.string().max(8000).optional(), link:z.string().max(1000).refine(safeContentLink).optional(), font: z.enum(['montserrat', 'bebas', 'system', 'georgia']).optional(),
  fontSize: z.number().int().min(12).max(100).optional(), color: color.optional(),
  background: z.enum(['solid', 'gradient', 'transparent', 'image']).optional(), backgroundColor: color.optional(), gradientEnd: color.optional(),
  backgroundImage: z.string().regex(/^\/api\/site-images\/background-[a-f0-9-]{36}\/image\?v=\d+$/).optional(),
  backgroundShade: z.number().min(0).max(1).optional(), backgroundX: z.number().min(0).max(100).optional(), backgroundY: z.number().min(0).max(100).optional(),
  angle: z.number().int().min(0).max(360).optional(), textAlign: z.enum(['left','center','right']).optional(),
  paddingY: z.number().int().min(0).max(160).optional(), opacity: z.number().min(.1).max(1).optional(),
}).strict();
const router = express.Router();
router.use(securityHeaders(), (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });
router.get('/', async (_req,res) => res.json({ entries: process.env.MONGODB_URI ? await loadSiteContent() : {} }));
router.use(sameOrigin, cookieParser(), async (_req,_res,next) => { await connectDb(); next(); }, identify, requireUser, requireOwner, rateLimit('site-content-write',120,3600000), express.json({ limit:'512kb' }));
const mutationInput = z.object({ expectedRevision:z.number().int().min(0), value:contentInput.optional(), undo:z.literal(true).optional() }).strict().refine(v => !!v.undo !== !!v.value);
function validateMutation(key, input) {
  if (!Object.hasOwn(CONTENT_KEYS,key)) throw Object.assign(new Error('This part of the site is managed through its existing controls.'), {status:400});
  if (input.value?.text !== undefined && !CONTENT_KEYS[key].text) throw Object.assign(new Error('Use the program or profile editor to change live information.'), {status:400});
  if (input.value?.link !== undefined && !CONTENT_KEYS[key].link) throw Object.assign(new Error('Select a website link to change its address.'), {status:400});
  if (input.value?.mediaKind !== undefined && !CONTENT_KEYS[key].media) throw Object.assign(new Error('Select a program media setting.'), {status:400});
}
async function publishMutations(changes, actorId) {
  changes.forEach(({key,...input})=>validateMutation(key,input));
  await SiteContent.init(); await SiteImage.init(); const entries={};
  await transaction(async session => {
    const backgrounds=[];
    for(const {key,...input} of changes) {
      const current = await SiteContent.findById(key).session(session);
      if ((current?.revision || 0) !== input.expectedRevision) throw Object.assign(new Error('Someone else changed this item. Close and reopen the editor before publishing. Nothing in this draft was saved.'), { status:409 });
      if (input.undo && current?.previous == null) throw Object.assign(new Error('No previous edit is available.'), { status:400 });
      const row = current || new SiteContent({ _id:key });
      const next = input.undo ? row.previous : input.value;
      backgrounds.push(row.value?.backgroundImage, row.previous?.backgroundImage, next?.backgroundImage);
      row.previous = row.value || {}; row.value = next; row.revision = input.expectedRevision + 1; row.updatedBy = actorId;
      await row.save({ session });
      await AuditEvent.create([{ actorId, action:'site-content.published', targetType:'site-content', targetId:key, details:{revision:row.revision} }],{session});
      entries[key] = publicSiteContentRow(row);
    }
    await retainBackgroundImages(backgrounds, session);
  });
  return entries;
}
router.post('/batch', async (req,res) => {
  const { changes } = z.object({changes:z.array(z.object({key:z.string().max(120),expectedRevision:z.number().int().nonnegative(),value:contentInput}).strict()).min(1).max(50)}).strict().parse(req.body);
  if(new Set(changes.map(item=>item.key)).size!==changes.length)return res.status(400).json({error:'Choose each website part once.'});
  res.json({entries:await publishMutations(changes,req.user._id)});
});
router.put('/:key', async (req,res) => {
  const key=req.params.key, input=mutationInput.parse(req.body);
  const entries=await publishMutations([{key,...input}],req.user._id);
  res.json({entry:entries[key]});
});
router.use((error,_req,res,_next) => { const known=requestError(error); const status=known?.status || (error instanceof z.ZodError ? 400 : error.code===11000 ? 409 : error.status || 500); res.status(status).json({error:known?.message || (status>=500?'Could not confirm publication. Reopen the editor to check your saved version.':error instanceof z.ZodError?'Check the text, colors, and size values.':error.message)}); });
export default router;
