import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LessonLibrary, LessonSection, Lesson, Booking, AuditEvent } from './models.js';
import { requireUser, requireOwner } from './auth.js';
import { LESSON_PRICE_CENTS, LESSON_BUNDLE_CENTS } from '../shared/lesson-library.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function readLessonLibrary() {
  const record = await LessonLibrary.findById('library').lean();
  return { open: record?.open === true, revision: record?.revision || 0, lessonCents: LESSON_PRICE_CENTS, bundleCents: LESSON_BUNDLE_CENTS };
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
    let pendingCheckouts = 0;
    if (!open) {
      const { stripeClient } = await import('./payments.js');
      const stripe = stripeClient();
      const pending = await Booking.find({ serviceIds: 'online', paymentStatus: 'unpaid', stripeSessionId: { $exists: true }, checkoutExpiresAt: { $gt: new Date() } }).select('stripeSessionId').lean();
      for (const booking of pending) {
        try { if (!stripe) throw new Error('Payments unavailable'); const checkout = await stripe.checkout.sessions.retrieve(booking.stripeSessionId); if (checkout.status === 'open') await stripe.checkout.sessions.expire(checkout.id); }
        catch { pendingCheckouts++; }
      }
    }
    res.json({ library: await readLessonLibrary(), pendingCheckouts });
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
