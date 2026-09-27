import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { DEFAULT_WORKSHOP } from '../shared/workshops.js';
export const Workshop = mongoose.models.BravoWorkshop || mongoose.model('BravoWorkshop', new mongoose.Schema({ _id: String, details: mongoose.Schema.Types.Mixed, revision: { type: Number, default: 0 } }, { timestamps: true }));
export const publicEvent = record => record ? { ...record.details, revision: record.revision } : DEFAULT_WORKSHOP;
export async function loadPublicWorkshop() {
  await connectDb();
  const event = publicEvent(await Workshop.findById('featured').maxTimeMS(2000).lean());
  return event.published ? event : null;
}
