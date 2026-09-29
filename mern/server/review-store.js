import mongoose from 'mongoose';
import { DEFAULT_REVIEWS } from '../shared/reviews.js';
import { connectDb } from './db.js';

export const WebsiteReview = mongoose.models.BravoWebsiteReview || mongoose.model('BravoWebsiteReview', new mongoose.Schema({
  _id: String, authorName: String, body: String, excerpt: String, source: String,
  rating: { type: Number, min: 1, max: 5, default: null },
  hidden: { type: Boolean, default: false }, order: Number,
  revision: { type: Number, default: 0 }, updatedBy: mongoose.Schema.Types.ObjectId,
}, { timestamps: true }));

export function publicRecommendation(row) {
  return { id: row.id || row._id, authorName: row.authorName, body: row.body, excerpt: row.excerpt || '', source: row.source, rating: row.rating ?? null };
}
export async function websiteReviews() {
  const rows = await WebsiteReview.find().sort({ order: 1, _id: 1 }).maxTimeMS(3000).lean();
  const merged = new Map(DEFAULT_REVIEWS.map(row => [row.id, row]));
  for (const row of rows) merged.set(row._id, { ...row, id: row._id });
  return [...merged.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
export async function loadPublicRecommendations() {
  await connectDb();
  return (await websiteReviews()).filter(row => !row.hidden).map(publicRecommendation);
}
