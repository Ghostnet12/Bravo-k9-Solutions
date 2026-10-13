import mongoose from 'mongoose';
import { timingSafeEqual } from 'node:crypto';
import { connectDb } from './db.js';
import { FCI_HOME, FCI_REFRESH_MS, cleanFCIItems } from '../shared/fci.js';
import { fetchFCIAnnouncements } from './fci-source.js';
export const FCIUpdates = mongoose.models.BravoFCIUpdates || mongoose.model('BravoFCIUpdates', new mongoose.Schema({
  _id: String, items: [mongoose.Schema.Types.Mixed], lastSuccessAt: Date, lastAttemptAt: Date, nextAttemptAt: Date, status: String,
}));
export function nextFCIRefresh(now) {
  const next = new Date(now);
  next.setUTCHours(13, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
export function fciSnapshot(row) {
  return { items: cleanFCIItems(row?.items), source: FCI_HOME, lastSuccessAt: row?.lastSuccessAt || null,
    refreshHours: 24, stale: !row?.lastSuccessAt || Date.now() - new Date(row.lastSuccessAt).getTime() > FCI_REFRESH_MS || row.status !== 'ok',
    unavailable: !row?.items?.length };
}
export async function loadFCIUpdates({ Model = FCIUpdates, connect = connectDb, fetchSource = fetchFCIAnnouncements, now = new Date() } = {}) {
  await connect();
  // Dedicated cache only. No customer, membership, or advertisement writes.
  await Model.updateOne({ _id: 'announcements' }, { $setOnInsert: { items: [], nextAttemptAt: new Date(0) } }, { upsert: true });
  const claimed = await Model.findOneAndUpdate({ _id: 'announcements', nextAttemptAt: { $lte: now } }, { $set: { lastAttemptAt: now, nextAttemptAt: nextFCIRefresh(now) } }, { returnDocument: 'after' }).lean();
  if (claimed) {
    try {
      const items = cleanFCIItems(await fetchSource());
      if (!items.length) throw new Error('No verified announcements');
      await Model.updateOne({ _id: 'announcements', lastAttemptAt: now }, { $set: { items, status: 'ok', lastSuccessAt: now } });
    } catch {
      // Retain last successful content; retry at most once per hour after failure.
      await Model.updateOne({ _id: 'announcements', lastAttemptAt: now }, { $set: { status: 'unavailable', nextAttemptAt: new Date(now.getTime() + 3600000) } });
    }
  }
  return fciSnapshot(await Model.findById('announcements').lean());
}
export async function fciUpdatesHandler(_req, res) {
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  try { return res.json(await loadFCIUpdates()); }
  catch { res.set('Cache-Control', 'no-store'); return res.json(fciSnapshot(null)); }
}
export async function fciCronHandler(req, res) {
  res.set('Cache-Control', 'no-store');
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const supplied = Buffer.from(req.get('authorization') || '');
  if (!expected || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'Unauthorized' });
  try { const result = await loadFCIUpdates(); return res.status(result.stale ? 503 : 200).json({ ok: !result.stale, count: result.items.length, lastSuccessAt: result.lastSuccessAt }); }
  catch { return res.status(503).json({ ok: false }); }
}
