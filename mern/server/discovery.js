import mongoose from 'mongoose';
import { z } from 'zod';
import { requireUser, requireOwner, rateLimit } from './auth.js';
import { transaction } from './db.js';
import { AuditEvent } from './models.js';
import { Workshop, publicEvent } from './workshop-store.js';
const Interest = mongoose.models.BravoCourseInterest || mongoose.model('BravoCourseInterest', new mongoose.Schema({ email: { type: String, unique: true }, consent: String, createdAt: { type: Date, default: Date.now }, expiresAt: { type: Date, index: { expires: 0 } } }));
export const workshopInput = z.object({ expectedRevision: z.number().int().min(0), title: z.string().trim().min(3).max(100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const day = new Date(`${value}T12:00:00Z`); return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value; }), time: z.string().max(50), location: z.string().max(200), duration: z.string().trim().min(1).max(50), cents: z.number().int().min(0).max(1000000), description: z.string().trim().min(5).max(1500), published: z.boolean() }).strict();
const interestInput = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), consent: z.literal(true), website: z.string().max(200).optional() }).strict();
export function discoveryRoutes(app) {
  app.get('/api/workshops', async (req, res) => {
    const event = publicEvent(await Workshop.findById('featured').lean());
    res.json({ event: event.published || req.user?.role === 'owner' ? event : null });
  });
  app.put('/api/workshops', requireUser, requireOwner, rateLimit('workshop-write', 30, 3600000), async (req, res) => {
    const { expectedRevision, ...details } = workshopInput.parse(req.body);
    await Workshop.init();
    let event;
    await transaction(async session => {
      const current = await Workshop.findById('featured').session(session);
      if ((current?.revision || 0) !== expectedRevision) throw Object.assign(new Error('Workshop changed while you were editing. Reload the page to see the latest version. Your draft is still open.'), { status: 409 });
      const record = current || new Workshop({ _id: 'featured' });
      record.details = details; record.revision = expectedRevision + 1;
      await record.save({ session });
      await AuditEvent.create([{ actorId: req.user._id, action: 'workshop.published', targetType: 'workshop', targetId: 'featured', details: { revision: record.revision } }], { session });
      event = publicEvent(record);
    });
    res.json({ event });
  });
  app.post('/api/course-interest', rateLimit('course-interest', 5, 3600000, req => req.ip), async (req, res) => {
    const input = interestInput.parse(req.body);
    if (!input.website) {
      await Interest.init();
      try { await Interest.updateOne({ email: input.email }, { $setOnInsert: { email: input.email, consent: 'One email when Bravo online courses launch', createdAt: new Date(), expiresAt: new Date(Date.now() + 365 * 86400000) } }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
    }
    // Identical response for existing and new addresses; never expose membership.
    res.status(202).json({ ok: true });
  });
  app.get('/api/admin/course-interest', requireUser, requireOwner, async (req, res) => {
    const before = req.query.before;
    if (before && !/^[a-f\d]{24}$/i.test(before)) return res.status(400).json({ error: 'Invalid page.' });
    const rows = await Interest.find({ expiresAt: { $gt: new Date() }, ...(before ? { _id: { $lt: before } } : {}) }).select('email createdAt consent').sort({ _id: -1 }).limit(101).lean();
    res.json({ interests: rows.slice(0, 100), next: rows.length > 100 ? String(rows[99]._id) : null });
  });
  app.delete('/api/admin/course-interest/:id', requireUser, requireOwner, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid signup.' });
    await Interest.deleteOne({ _id: req.params.id }); res.json({ ok: true });
  });
}
