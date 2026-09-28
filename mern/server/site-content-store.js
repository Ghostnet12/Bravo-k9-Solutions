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

const LEGACY_TEXT_REFINEMENTS = {
  'trainer-david-focus': {
    from: 'Specialized  with FCI Belgian Malinois, ex-military, law enforcement, and executive protection K9’s • Behavior modification • Puppy behavioral issues • Obedience • Executive protection and everyday behavior. ',
    to: 'Specializes in working with FCI Belgian Malinois, ex-military, law-enforcement, and executive-protection K9s • Behavior modification • Puppy behavior • Obedience • Everyday behavior.',
  },
  'ui-52': {
    from: 'Built by Northrop Web Design & Development Team using the  FRACTURE framework.',
    to: 'Built by Northrop Web Design & Development Team using the FRACTURE framework.',
  },
};

export function normalizeLegacySiteContentValue(key, value = {}) {
  const legacy = LEGACY_TEXT_REFINEMENTS[key];
  return legacy && value?.text === legacy.from ? { ...value, text: legacy.to } : value || {};
}

export const publicSiteContentRow = row => ({
  value: normalizeLegacySiteContentValue(row._id, row.value),
  revision: row.revision || 0,
  canUndo: row.previous != null,
});

export async function loadSiteContent() {
  await connectDb();
  const rows = await SiteContent.find({ _id: { $in: Object.keys(CONTENT_KEYS) } }).maxTimeMS(2000).lean();
  return Object.fromEntries(rows.map(row => [row._id, publicSiteContentRow(row)]));
}
