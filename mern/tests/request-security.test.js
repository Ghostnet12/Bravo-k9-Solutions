import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/app.js';
import { clientError, requestError } from '../server/errors.js';

test('request parsing errors never echo submitted text', () => {
  for (const [type, status] of [['entity.parse.failed', 400], ['entity.too.large', 413], ['encoding.unsupported', 415], ['charset.unsupported', 415], ['request.aborted', 400], ['request.size.invalid', 400]]) {
    const error = Object.assign(new Error('SECRET submitted text'), { type });
    for (const output of [requestError(error), clientError(error)]) {
      assert.equal(output.status, status);
      assert.doesNotMatch(output.message, /SECRET/);
    }
  }
});

test('cross-origin JSON is rejected before parsing, and same-origin syntax errors are sanitized', async () => {
  const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
  const body = '{"password":"SECRET" invalid}';
  await request(app).post('/api/auth/login').set('Origin', 'https://unrelated.example').set('Content-Type', 'application/json').send(body).expect(403);
  const response = await request(app).post('/api/auth/login').set('Origin', origin).set('Content-Type', 'application/json').send(body).expect(400);
  assert.doesNotMatch(response.text, /SECRET|password|SyntaxError/);
});
