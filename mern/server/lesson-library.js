import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LessonLibrary, LessonSection, Lesson, Booking, AuditEvent } from './models.js';
import { requireUser, requireOwner } from './auth.js';
import { LESSON_PRICE_CENTS, LESSON_BUNDLE_CENTS } from '../shared/lesson-library.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
// Five concurrent sessions, with short per-call deadlines, keep closing within
// the browser and serverless request limits. Persisted retries also cover links
// created before the first deployment of the closed-by-default library.
export async function expireLessonCheckouts(stripeOverride) {
  const filter = { serviceIds: 'online', paymentStatus: 'unpaid', stripeSessionId: { $exists: true }, checkoutExpiresAt: { $gt: new Date() } };
  const pending = await Booking.find(filter).select('stripeSessionId').limit(5).lean();
  if (!pending.length) return 0;
  const stripe = stripeOverride === undefined ? (await import('./payments.js')).stripeClient() : stripeOverride;
  const options = { timeout: 3000, maxNetworkRetries: 0 };
  if (stripe) await Promise.allSettled(pending.map(async booking => {
    const checkout = await stripe.checkout.sessions.retrieve(booking.stripeSessionId, {}, options);
    if (checkout.status === 'open') await stripe.checkout.sessions.expire(checkout.id, {}, options);
    await Booking.updateOne({ _id: booking._id, stripeSessionId: booking.stripeSessionId }, { $set: { checkoutExpiresAt: new Date() } });
  }));
  return Booking.countDocuments({ ...filter, checkoutExpiresAt: { $gt: new Date() } });
}
async function reconcileClosedLibrary(force = false) {
  const now = new Date();
  const claimed = await LessonLibrary.findOneAndUpdate({ _id: 'library', open: false, ...(force ? {} : { $or: [{ cleanupAfter: { $exists: false } }, { cleanupAfter: { $lte: now } }] }) }, { $set: { cleanupAfter: new Date(now.getTime() + 30000) } });
  if (!claimed) return;
  const pendingCheckouts = await expireLessonCheckouts();
  await LessonLibrary.updateOne({ _id: 'library', open: false }, { $set: { pendingCheckouts } });
}
export async function readLessonLibrary() {
  let record = await LessonLibrary.findById('library').lean();
  if (!record) {
    await LessonLibrary.updateOne({ _id: 'library' }, { $setOnInsert: { open: false, revision: 0 } }, { upsert: true });
    record = await LessonLibrary.findById('library').lean();
  }
  if (!record.open && (!record.cleanupAfter || new Date(record.cleanupAfter) <= new Date())) {
    await reconcileClosedLibrary();
    record = await LessonLibrary.findById('library').lean();
  }
  return { open: record?.open === true, revision: record?.revision || 0, pendingCheckouts: record?.open ? 0 : record?.pendingCheckouts || 0, lessonCents: LESSON_PRICE_CENTS, bundleCents: LESSON_BUNDLE_CENTS };
}
export async function requireOpenLibrary(user) {
  if (user?.role !== 'owner' && !(await readLessonLibrary()).open) throw fail('This page is not available.', 404);
}
export function lessonLibraryRoutes(app) {
  app.get('/api/admin/lesson-library', requireUser, requireOwner, async (_req, res) => res.json({ library: await readLessonLibrary(), sections: await LessonSection.find().sort({ order: 1, title: 1 }).lean() }));
  app.put('/api/admin/lesson-library', requireUser, requireOwner, async (req, res) => {
    const { open, expectedRevision } = z.object({ open: z.boolean(), expectedRevision: z.number().int().nonnegative() }).parse(req.body);
    if (open && !await Lesson.exists({ published: true })) throw fail('Publish at least one lesson before opening the library.');
    await LessonLibrary.updateOne({ _id: 'library' }, { $setOnInsert: { open: false, revision: 0 } }, { upsert: true });
    const updated = await LessonLibrary.findOneAndUpdate({ _id: 'library', revision: expectedRevision }, { $set: { open, updatedBy: req.user._id }, $inc: { revision: 1 } }, { returnDocument: 'after' });
    if (!updated) throw fail('The library settings changed. Reload before trying again.', 409);
    await AuditEvent.create({ actorId: req.user._id, action: open ? 'lessons.opened' : 'lessons.closed', targetType: 'lesson-library', targetId: 'library' });
    if (!open) await reconcileClosedLibrary(true);
    const library = await readLessonLibrary();
    res.json({ library, pendingCheckouts: library.pendingCheckouts });
  });
  const sectionInput = z.object({ title: z.string().trim().min(1).max(80), description: z.string().trim().max(1000).default(''), order: z.number().int().min(0).max(9999).default(0) });
  app.post('/api/admin/lesson-sections', requireUser, requireOwner, async (req, res) => {
    const data = sectionInput.parse(req.body);
    const section = await LessonSection.create({ _id: randomUUID(), ...data });
    res.status(201).json({ section });
  });
  app.put('/api/admin/lesson-sections/:id', requireUser, requireOwner, async (req, res) => {
    const section = await LessonSection.findByIdAndUpdate(req.params.id, { $set: sectionInput.parse(req.body) }, { returnDocument: 'after' });
    if (!section) throw fail('Section not found.', 404); res.json({ section });
  });
  app.delete('/api/admin/lesson-sections/:id', requireUser, requireOwner, async (req, res) => {
    if (await Lesson.exists({ sectionId: req.params.id })) throw fail('Move this section’s lessons to another section before removing it.');
    await LessonSection.deleteOne({ _id: req.params.id }); res.json({ ok: true });
  });
}
