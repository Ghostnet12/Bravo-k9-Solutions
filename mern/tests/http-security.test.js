import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import app from '../server/client-services-app.js';
import { securityHeaders, privateResponse, PERMISSIONS_POLICY } from '../server/http-security.js';

function assertPolicy(headers) {
  assert.equal(headers['permissions-policy'], PERMISSIONS_POLICY);
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

test('early routes and dependency failures retain headers without Vercel', async t => {
  const previous = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  t.after(() => { if (previous !== undefined) process.env.MONGODB_URI = previous; });
  for (const path of ['/api/health/ready', '/api/site-ads', '/api/site-ads/example/image']) {
    const response = await request(app).get(path).expect(503);
    assertPolicy(response.headers);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.doesNotMatch(response.text, /MONGODB_URI|passwordHash|stack/);
  }
  const rejected = await request(app).post('/api/site-ads').set('Origin', 'https://unrelated.example').send({}).expect(403);
  assertPolicy(rejected.headers);
  assert.match(rejected.headers['cache-control'], /no-store/);
  const cron = await request(app).get('/api/cron/memberships').expect(401);
  assertPolicy(cron.headers);
  assert.match(cron.headers['cache-control'], /no-store/);
});


test('static and dynamic device policies agree and preserve Bravo Live capture', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const deployed = config.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Permissions-Policy').value;
  assert.equal(deployed, PERMISSIONS_POLICY);
  const directives = new Map(deployed.split(', ').map(item => item.split('=')));
  for (const feature of ['camera', 'microphone']) assert.equal(directives.get(feature), '(self)');
  for (const feature of ['geolocation', 'accelerometer', 'gyroscope', 'magnetometer', 'usb', 'serial', 'hid', 'midi']) assert.equal(directives.get(feature), '()');
  for (const feature of ['autoplay', 'fullscreen', 'screen-wake-lock', 'payment']) assert.equal(directives.has(feature), false);
});

// The viewer needs one frame origin, not scripts, GPS permission or network
// access in the Bravo page. Keep the deployed and server policies in sync.
test('Glympse is allowed only as a frame in both security policies', async () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const deployed = config.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  const dynamic = (await request(app).get('/api/health').expect(200)).headers['content-security-policy'];
  for (const csp of [deployed, dynamic]) {
    const directives = csp.split(';').map(value => value.trim());
    assert.ok(directives.find(value => value.startsWith('frame-src ')).split(' ').includes('https://glympse.com'));
    for (const directive of ['script-src', 'connect-src']) assert.ok(!directives.find(value => value.startsWith(`${directive} `)).includes('glympse'));
    assert.ok(directives.includes("frame-ancestors 'none'"));
  }
});
