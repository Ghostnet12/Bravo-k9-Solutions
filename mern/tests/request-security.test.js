import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/app.js';
import express from 'express';
import { sameOrigin } from '../server/auth.js';
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


test('Fetch Metadata rejects cross-site writes before parsing while retaining Origin checks', async () => {
  const fixture = express();
  fixture.use(sameOrigin, express.json());
  fixture.all('/write', (_req, res) => res.json({ ok: true }));
  fixture.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'Rejected' }));
  const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
  for (const method of ['post', 'put', 'patch', 'delete']) {
    await request(fixture)[method]('/write').set('Origin', origin).set('Sec-Fetch-Site', 'cross-site').set('Content-Type', 'application/json').send('{invalid').expect(403);
    for (const site of ['same-origin', 'same-site', 'none', null]) {
      let allowed = request(fixture)[method]('/write').set('Origin', origin);
      if (site) allowed = allowed.set('Sec-Fetch-Site', site);
      await allowed.send({}).expect(200);
    }
    await request(fixture)[method]('/write').set('Sec-Fetch-Site', 'same-origin').send({}).expect(403);
    await request(fixture)[method]('/write').set('Origin', 'https://unrelated.example').set('Sec-Fetch-Site', 'same-site').send({}).expect(403);
    await request(fixture)[method]('/write').set('Origin', origin).set('Content-Type', 'text/plain').send('text').expect(415);
  }
  // Ordinary public navigation remains available from external links.
  await request(fixture).get('/write').set('Sec-Fetch-Site', 'cross-site').expect(200);
});
