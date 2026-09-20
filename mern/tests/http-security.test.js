import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import app from '../server/client-services-app.js';
import { securityHeaders, privateResponse } from '../server/http-security.js';

function assertPolicy(headers) {
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  const csp = headers['content-security-policy'];
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "script-src 'self'", "font-src 'self'"]) assert.ok(csp.split(';').includes(directive), directive);
  assert.ok(csp.includes('frame-src https://www.facebook.com'));
  assert.ok(csp.includes("media-src 'self' blob:"));
}

test('production and local header policies preserve media while denying framing', async t => {
  const previous = process.env.NODE_ENV;
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  for (const mode of ['production', 'development']) {
    process.env.NODE_ENV = mode;
    const fixture = express();
    fixture.use(securityHeaders(), privateResponse);
    fixture.get('/', (_req, res) => res.json({ ok: true }));
    const response = await request(fixture).get('/').expect(200);
    assertPolicy(response.headers);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.headers['content-security-policy'].includes('upgrade-insecure-requests'), mode === 'production');
  }
});

test('real application health and rejected writes retain the shared security policy', async () => {
  assertPolicy((await request(app).get('/api/health').expect(200)).headers);
  const denied = await request(app).post('/api/auth/login').set('Origin', 'https://unrelated.example').send({}).expect(403);
  assertPolicy(denied.headers);
});
