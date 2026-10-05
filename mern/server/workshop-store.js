import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { resolveWorkshop } from '../shared/workshop-schedule.js';
import { DEFAULT_WORKSHOP } from '../shared/workshops.js';
export const Workshop = mongoose.models.BravoWorkshop || mongoose.model('BravoWorkshop', new mongoose.Schema({ _id: String, details: mongoose.Schema.Types.Mixed, revision: { type: Number, default: 0 } }, { timestamps: true }));
// A stable date identity and revision snapshots preserve historical occurrences.
// Bravo currently confirms seats manually; no workshop checkout or reservation exists.
export const WorkshopOccurrence = mongoose.models.BravoWorkshopOccurrence || mongoose.model('BravoWorkshopOccurrence', new mongoose.Schema({
  _id: String, programId: String, date: String, snapshots: [mongoose.Schema.Types.Mixed],
}, { timestamps: true }));
export const publicEvent = (record, now = new Date()) => resolveWorkshop(record ? { ...record.details, revision: record.revision } : DEFAULT_WORKSHOP, now);
export async function preserveWorkshopOccurrence(event, session) {
  if (!event.date) return;
  const { nextDate, ...snapshot } = event;
  await WorkshopOccurrence.updateOne({ _id: event.occurrenceId }, { $setOnInsert: { programId: 'featured', date: event.date }, $addToSet: { snapshots: snapshot } }, { upsert: true, session });
}

export async function loadPublicWorkshop() {
  await connectDb();
  const event = publicEvent(await Workshop.findById('featured').maxTimeMS(2000).lean());
  return event.published ? event : null;
}
