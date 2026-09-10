import mongoose from 'mongoose';
import { ALL_MODELS, Settings } from './models.js';
import { DEFAULT_SCHEDULE } from './scheduling.js';
let pending;
function databaseIssue(error, phase) {
  if (error?.code === 18) return 'authentication_failed';
  if (error?.code === 13) return 'database_permission_denied';
  if (error?.name === 'MongoParseError' || error?.name === 'MongoInvalidArgumentError') return 'invalid_connection_string';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error?.code) || ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError'].includes(error?.name)) return 'database_unreachable';
  return phase === 'initialize' ? 'initialization_failed' : 'connection_failed';
}
export async function connectDb() {
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('Accounts and scheduling are not connected yet. Please call Bravo at (605) 824-2767.'), { status: 503, databaseIssue: 'missing_configuration' });
  if (!pending) {
    let phase = 'connect';
    pending = Promise.resolve().then(() => mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'bravo_k9', serverSelectionTimeoutMS: 5000, maxPoolSize: 5 })).then(async () => {
      phase = 'initialize';
      await Promise.all(ALL_MODELS.map(m => m.init()));
      await Settings.updateOne({ _id: 'schedule' }, { $setOnInsert: DEFAULT_SCHEDULE }, { upsert: true });
    }).catch(error => {
      const issue = databaseIssue(error, phase);
      // Log only fixed categories: driver messages/stacks can contain credentials.
      console.error('Bravo database startup failed', { issue, phase });
      pending = undefined;
      throw Object.assign(new Error('Bravo’s account service is temporarily unavailable. Please try again or call us.'), { status: 503, databaseIssue: issue });
    });
  }
  await pending;
}
export async function transaction(work) { return mongoose.connection.transaction(work); }
