import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../server/app.js';

test('database diagnostics identify retry failures without exposing driver secrets', async t => {
  const previous = process.env.MONGODB_URI;
  const secret = 'PRIVATE_DRIVER_SECRET_CANARY';
  process.env.MONGODB_URI = `mongodb+srv://bravo_app:${secret}@private-host.invalid/bravo_k9`;
  t.after(() => {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  });
  const logs = [];
  t.mock.method(console, 'error', (...args) => { logs.push(args); });
  let failure = { code: 18, name: 'MongoServerError' };
  const connection = t.mock.method(mongoose, 'connect', async () => {
    throw Object.assign(new Error(process.env.MONGODB_URI), failure);
  });
  const first = await request(app).get('/api/config').expect(200);
  assert.equal(first.body.connected, false);
  assert.equal(first.body.connectionIssue, 'authentication_failed');
  assert.equal(first.body.paymentsReady, false);
  assert.ok(!first.text.includes(secret));

  failure = { code: 13, name: 'MongoServerError' };
  const retry = await request(app).get('/api/config').expect(200);
  assert.equal(retry.body.connectionIssue, 'database_permission_denied');
  assert.equal(connection.mock.callCount(), 2);
  const protectedRoute = await request(app).get('/api/auth/me').expect(503);
  assert.ok(!JSON.stringify([first.body, retry.body, protectedRoute.body, logs]).includes(secret));
  assert.ok(!JSON.stringify(logs).includes('private-host.invalid'));
});
