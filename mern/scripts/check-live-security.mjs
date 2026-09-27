import assert from 'node:assert/strict';

// Fixed public production target; no deployment-provided URLs or credentials.
const deniedPaths = new Set(['/api/auth/mfa', '/api/groups', '/api/bookings', '/api/cron/memberships']);
for (const path of ['/', '/api/health', '/api/health/ready', ...deniedPaths]) {
  const response = await fetch(`https://bravounleashed.com${path}`, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, deniedPaths.has(path) ? 401 : 200, `${path}: HTTP status`);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', `${path}: framing policy`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${path}: MIME policy`);
  const policy = response.headers.get('content-security-policy') || '';
  const directives = policy.split(';').map(value => value.trim());
  for (const expected of ["frame-ancestors 'none'", "object-src 'none'", "script-src 'self'"]) assert.ok(directives.includes(expected), `${path}: ${expected}`);
  if (path.startsWith('/api/')) {
    assert.match(response.headers.get('cache-control') || '', /\bno-store\b/, `${path}: private response caching`);
    const body = await response.json();
    if (deniedPaths.has(path)) {
      for (const field of ['enabled', 'available', 'secret', 'recoveryCodes', 'groups', 'people', 'bookings']) {
        assert.equal(Object.hasOwn(body, field), false, `${path}: no private MFA fields`);
      }
    } else {
      assert.equal(body.ok, true, `${path}: healthy API`);
      if (path === '/api/health/ready') assert.equal(body.databaseConnected, true, `${path}: database connected`);
    }
  } else assert.match(await response.text(), /Bravo/);
  console.log(`${path}: health and security headers passed`);
}
