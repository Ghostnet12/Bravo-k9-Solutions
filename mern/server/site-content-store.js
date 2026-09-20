import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { CONTENT_KEYS } from '../shared/site-content-keys.js';

// Persistence stays independent of the Express editor so public rendering can
// read published content without pulling the editing/router stack into memory.
export const SiteContent = mongoose.models.BravoSiteContent || mongoose.model('BravoSiteContent', new mongoose.Schema({
  _id: String,
  value: mongoose.Schema.Types.Mixed,
  previous: mongoose.Schema.Types.Mixed,
  revision: { type: Number, default: 0 },
  updatedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true }));

export const publicSiteContentRow = row => ({
  value: row.value || {},
  revision: row.revision || 0,
  canUndo: row.previous != null,
});

export async function loadSiteContent() {
  await connectDb();
  const rows = await SiteContent.find({ _id: { $in: Object.keys(CONTENT_KEYS) } }).maxTimeMS(2000).lean();
  return Object.fromEntries(rows.map(row => [row._id, publicSiteContentRow(row)]));
}
