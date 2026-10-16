import test from 'node:test';
import assert from 'node:assert/strict';
import { routeArea, AREAS } from '../shared/telemetry.js';
import { publicPagePaths, resolvePublicPagePath, publicPageHandler } from '../server/public-page.js';

test('public page routing accepts direct URLs and deployment rewrites', () => {
  for (const path of publicPagePaths) {
    assert.equal(resolvePublicPagePath(`${path}?utm_source=example`), path.slice(1));
    assert.equal(resolvePublicPagePath(`/api/public-page?path=${encodeURIComponent(path)}`), path.slice(1));
  }
});

test('public page routing rejects ambiguous rewrites and paths outside its allowlist', async () => {
  for (const url of ['/api/public-page?path=/contact&path=/live', '/api/public-page?path=../../server/models.js', '/api/public-page?path=%2F..%2Fserver', '/api/public-page?path=/admin', '/api/public-page?path=/contact%00', '/not-a-public-page', 'http://[invalid']) {
    assert.equal(resolvePublicPagePath(url), null, url);
  }
  const req = { url: '/api/public-page?path=../../server/models.js', get query() { throw new Error('legacy query getter accessed'); }, get path() { throw new Error('legacy path getter accessed'); } };
  let code, ended = false;
  await publicPageHandler(req, { status(value) { code = value; return this; }, end() { ended = true; } });
  assert.equal(code, 404); assert.equal(ended, true);
});

test('timeout diagnostics identify public services using only fixed categories', () => {
  for (const [path, expected] of [['/api/config', 'configuration'], ['/api/site-content', 'content'], ['/api/site-banner/weather', 'content'], ['/api/site-ads', 'content'], ['/api/live/private-session-id/viewer', 'live'], ['/api/proof-videos/private-clip-id/video', 'proof'], ['/api/reviews', 'proof'], ['/api/team/schedules', 'team'], ['/api/site-images/private-asset-id', 'team'], ['/api/availability', 'booking'], ['/api/auth/me', 'account']]) {
    const area = routeArea(`${path}?email=private%40example.test#private`);
    assert.equal(area, expected); assert.ok(AREAS.includes(area));
    assert.ok(!area.includes('private'));
  }
  assert.equal(routeArea('/api/config-secret?private=yes'), 'other');
  assert.equal(routeArea('/api/customer-specific-path'), 'other');
});
