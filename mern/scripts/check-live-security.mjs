import assert from 'node:assert/strict';

// Fixed public production target; no deployment-provided URLs or credentials.
for (const path of ['/', '/api/health']) {
  const response = await fetch(`https://bravounleashed.com${path}`, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', `${path}: framing policy`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${path}: MIME policy`);
  const policy = response.headers.get('content-security-policy') || '';
  const directives = policy.split(';').map(value => value.trim());
  for (const expected of ["frame-ancestors 'none'", "object-src 'none'", "script-src 'self'"]) assert.ok(directives.includes(expected), `${path}: ${expected}`);
  if (path === '/api/health') assert.equal((await response.json()).ok, true);
  else assert.match(await response.text(), /Bravo/);
  console.log(`${path}: health and security headers passed`);
}
