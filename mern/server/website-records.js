import { z } from 'zod';
import { User, ServiceSetting, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { SERVICES } from '../shared/catalog.js';
import { publicTrainerProfile, trainerProfileKey } from '../shared/trainer-profile.js';
import { publicRole } from './authorization.js';
import { effectiveServices } from './services.js';
import { SiteContent } from './site-content-store.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const cents = z.number().int().min(0).max(1000000);
export const serviceEditInput = z.object({ expectedRevision: z.number().int().nonnegative(), cents,
  name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(2000).optional(),
  additionalDogCents: cents.optional(), bundleCents: cents.optional(), enabled: z.boolean().optional(),
}).strict();
export async function editWebsiteService(req, res) {
  const service = SERVICES.find(item => item.id === req.params.id);
  if (!service) throw fail('Service not found.', 404);
  const { expectedRevision, ...fields } = serviceEditInput.parse(req.body);
  if (fields.additionalDogCents !== undefined && service.id !== 'training') throw fail('Additional-dog pricing belongs to training.');
  if (fields.bundleCents !== undefined && service.id !== 'online') throw fail('Bundle pricing belongs to online lessons.');
  if (service.id === 'online' && fields.enabled !== undefined) throw fail('Open or close the lesson library in Lesson studio.');
  await ServiceSetting.init();
  await transaction(async session => {
    // Serialize cross-service price checks, including simultaneous admin edits.
    await ServiceSetting.updateOne({ _id: 'catalog-lock' }, { $inc: { revision: 1 } }, { upsert: true, session });
    const rows = await ServiceSetting.find({ _id: { $in: ['training', 'online', service.id] } }).session(session).lean();
    const current = rows.find(row => row._id === service.id);
    if ((current?.revision || 0) !== expectedRevision) throw fail('This program changed. Reopen the editor before publishing.', 409);
    const value = id => ({ ...SERVICES.find(item => item.id === id), ...rows.find(row => row._id === id), ...(id === service.id ? fields : {}) });
    if (value('online').bundleCents < value('training').cents) throw fail('The training + lessons total must cover the training price. Update the bundle total first.');
    await ServiceSetting.updateOne({ _id: service.id }, { $set: { ...fields, revision: expectedRevision + 1, updatedBy: req.user._id } }, { upsert: true, runValidators: true, session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'service.updated', targetType: 'service', targetId: service.id, details: { ...fields, revision: expectedRevision + 1 } }], { session });
  });
  res.json({ service: (await effectiveServices({ includeDisabled: true })).find(item => item.id === service.id) });
}
export async function editWebsiteTrainer(req, res) {
  const id = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.id);
  const { expectedRevision, expectedIntroductionRevision, name, ...fields } = z.object({ expectedRevision: z.number().int().nonnegative(), expectedIntroductionRevision: z.number().int().nonnegative(), name: z.string().trim().min(2).max(80), title: z.string().trim().min(1).max(80), bio: z.string().trim().max(8000) }).strict().parse(req.body);
  let saved;
  await transaction(async session => {
    const person = await User.findOne({ _id: id, role: { $in: ['owner', 'staff'] }, blocked: { $ne: true }, removedAt: null }).session(session);
    if (!person) throw fail('Active trainer not found.', 404);
    if ((person.publicProfileRevision || 0) !== expectedRevision) throw fail('This profile changed. Reopen it before publishing.', 409);
    Object.assign(person, fields, { publicName: name, publicProfileRevision: expectedRevision + 1 });
    await person.save({ session });
    const contentKey = `trainer-${trainerProfileKey(person)}-introduction`;
    const introduction = await SiteContent.findById(contentKey).session(session);
    if ((introduction?.revision || 0) !== expectedIntroductionRevision) throw fail('This introduction changed. Reopen the profile before publishing.', 409);
    if (introduction) {
      introduction.previous = introduction.value || {};
      introduction.value = { ...introduction.value, text: fields.bio };
      introduction.revision += 1; introduction.updatedBy = req.user._id;
      await introduction.save({ session });
    }
    await AuditEvent.create([{ actorId: req.user._id, action: 'trainer.profile.published', targetType: 'trainer', targetId: id, details: { revision: expectedRevision + 1 } }], { session });
    saved = publicTrainerProfile(person, publicRole(person));
  });
  res.json({ person: saved });
}
