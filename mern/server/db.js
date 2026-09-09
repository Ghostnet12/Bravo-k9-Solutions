import mongoose from 'mongoose';
import { ALL_MODELS, Settings } from './models.js';
import { DEFAULT_SCHEDULE } from './scheduling.js';
let pending;
export async function connectDb() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('Accounts and scheduling are not connected yet. Please call Bravo at (605) 824-2767.'), { status: 503 });
  if (!pending) pending = mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'bravo_k9', serverSelectionTimeoutMS: 5000, maxPoolSize: 5 }).then(async () => {
    await Promise.all(ALL_MODELS.map(m => m.init()));
    await Settings.updateOne({ _id: 'schedule' }, { $setOnInsert: DEFAULT_SCHEDULE }, { upsert: true });
  }).catch(() => { pending = undefined; throw Object.assign(new Error('Bravo’s account service is temporarily unavailable. Please try again or call us.'), { status: 503 }); });
  await pending;
}
export async function transaction(work) { return mongoose.connection.transaction(work); }
