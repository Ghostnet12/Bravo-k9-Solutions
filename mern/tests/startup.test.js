import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ALL_MODELS } from '../server/models.js';

test('cold-start models wait for MongoDB before creating collections and indexes', async () => {
  const created = [];
  const indexes = [];
  let settled = false;
  let startupError;
  const initialization = Promise.all(ALL_MODELS.map(model => model.init()));
  initialization.then(() => { settled = true; }, error => {
    settled = true;
    startupError = error;
  });

  // Exercise the real Mongoose initialization before a database is available.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, startupError?.message || 'Initialization ran before connection');

  // Replace only the network driver boundary; Mongoose owns the startup lifecycle.
  mongoose.connection.db = {
    createCollection: async name => { created.push(name); },
    collection: name => ({
      createIndex: async (fields, options) => {
        indexes.push({ name, fields, options });
        return Object.keys(fields).join('_');
      },
    }),
  };
  mongoose.connection.onOpen();
  await initialization;

  assert.deepEqual(created.sort(), ALL_MODELS.map(model => model.collection.name).sort());
  assert.ok(indexes.some(index => index.fields.email === 1 && index.options.unique));
  assert.ok(indexes.some(index => index.fields.userId === 1 && index.fields.requestKey === 1 && index.options.unique));
});
