import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/app.js';
test('public routes remain useful without a database', async () => {
  delete process.env.MONGODB_URI;
  const health = await request(app).get('/api/health').expect(200); assert.equal(health.body.ok,true);
  const config = await request(app).get('/api/config').expect(200); assert.equal(config.body.connected,false); assert.equal(config.body.paymentsReady,false);
  await request(app).get('/api/lessons').expect(404); assert.equal(config.body.lessonLibrary.open,false); assert.equal(config.body.services.find(s=>s.id==='online').enabled,false);
});
test('cross-origin writes and missing database fail closed', async () => {
  await request(app).post('/api/auth/register').set('Origin','https://evil.example').send({}).expect(403);
  await request(app).post('/api/auth/register').set('Origin','http://localhost:5173').send({}).expect(503);
  await request(app).get('/api/admin').expect(503);
});
test('unconfigured webhook does not claim successful payment', async () => { await request(app).post('/api/stripe/webhook').send({ type:'checkout.session.completed' }).expect(503); });
test('production files and all routes are served without broken imports', async () => {
  for (const route of ['/', '/portal', '/account', '/learn', '/community', '/admin', '/contact', '/accessibility']) {
    const res = await request(app).get(route).expect(200); assert.match(res.text,/Bravo K9/);
  }
  for(const name of ['bravo-logo-small','hero-bravo-k9','david-northrop','ashley-leverock','janet-hughes','training-education']) await request(app).get(`/images/${name}.webp`).expect(200);
});

test('public search files have route-specific metadata and private routes are noindex', async () => {
  const contact = await request(app).get('/contact').expect(200);
  assert.match(contact.text, /Contact Bravo K9 Solutions/);
  assert.match(contact.text, /rel="canonical" href="https:\/\/bravounleashed.com\/contact"/);
  const account = await request(app).get('/account').expect(200);
  assert.match(account.headers['x-robots-tag'], /noindex/);
  const sitemap = await request(app).get('/sitemap.xml').expect(200);
  assert.match(sitemap.text, /\/contact/); assert.match(sitemap.text, /\/dog-walking/); assert.doesNotMatch(sitemap.text, /\/admin|\/account|\/community/);
  await request(app).get('/not-a-bravo-page').expect(404);
});
