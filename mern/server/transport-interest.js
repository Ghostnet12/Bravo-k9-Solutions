import mongoose from 'mongoose';
import { z } from 'zod';
import { requireUser, requireOwner, rateLimit } from './auth.js';

// Transport consent is kept separate from the course launch mailing list.
const Interest = mongoose.models.BravoTransportInterest || mongoose.model('BravoTransportInterest', new mongoose.Schema({
  email: { type: String, unique: true }, consent: String,
  createdAt: { type: Date, default: Date.now }, expiresAt: { type: Date, index: { expires: 0 } },
}));
const inputSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  consent: z.literal(true), website: z.string().max(200).optional(),
}).strict();

export function transportInterestRoutes(app) {
  app.post('/api/transport-interest', rateLimit('transport-interest', 5, 3600000, req => req.ip), async (req, res) => {
    const input = inputSchema.parse(req.body);
    if (!input.website) {
      await Interest.init();
      try {
        await Interest.updateOne({ email: input.email }, { $setOnInsert: {
          email: input.email, consent: 'One email when Bravo K9 transport launches',
          createdAt: new Date(), expiresAt: new Date(Date.now() + 365 * 86400000),
        } }, { upsert: true });
      } catch (error) { if (error.code !== 11000) throw error; }
    }
    // Do not disclose whether an address was already registered.
    res.set('Cache-Control', 'private, no-store').status(202).json({ ok: true });
  });
  app.get('/api/admin/transport-interest', requireUser, requireOwner, async (req, res) => {
    const before = req.query.before;
    if (before && !/^[a-f\d]{24}$/i.test(before)) return res.status(400).json({ error: 'Invalid page.' });
    const rows = await Interest.find({ expiresAt: { $gt: new Date() }, ...(before ? { _id: { $lt: before } } : {}) }).select('email createdAt consent').sort({ _id: -1 }).limit(101).lean();
    res.set('Cache-Control', 'private, no-store').json({ interests: rows.slice(0, 100), next: rows.length > 100 ? String(rows[99]._id) : null });
  });
  app.delete('/api/admin/transport-interest/:id', requireUser, requireOwner, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid signup.' });
    await Interest.deleteOne({ _id: req.params.id });
    res.set('Cache-Control', 'private, no-store').json({ ok: true });
  });
}
