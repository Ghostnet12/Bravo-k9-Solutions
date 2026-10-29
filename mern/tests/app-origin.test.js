import test from 'node:test';
import assert from 'node:assert/strict';
import { appOrigin, appOrigins } from '../server/app-origin.js';
import { sameOrigin } from '../server/auth.js';

test('production retains its exact configured origin; preview hosts do not grant production access', () => {
  assert.deepEqual(appOrigins({ NODE_ENV: 'production', VERCEL_ENV: 'production', APP_ORIGIN: 'https://bravounleashed.com', VERCEL_URL: 'test.vercel.app' }), ['https://bravounleashed.com']);
  assert.deepEqual(appOrigins({ NODE_ENV: 'production' }), []);
  assert.equal(appOrigin({ NODE_ENV: 'development' }), 'http://localhost:5173');
});

test('preview allows only exact platform-provided deployment and branch origins', () => {
  const env = { VERCEL_ENV: 'preview', VERCEL_URL: 'bravo-123.vercel.app', VERCEL_BRANCH_URL: 'bravo-git-test.vercel.app', APP_ORIGIN: 'https://bravounleashed.com' };
  assert.deepEqual(appOrigins(env), ['https://bravo-123.vercel.app', 'https://bravo-git-test.vercel.app']);
  assert.equal(appOrigin(env), 'https://bravo-123.vercel.app');
  assert.deepEqual(appOrigins({ ...env, VERCEL_BRANCH_URL: env.VERCEL_URL }), ['https://bravo-123.vercel.app']);
  for (const host of [undefined, '', 'https://bravo.vercel.app', 'bravo.vercel.app.evil.test', 'bravo.vercel.app/path', 'bravo.vercel.app:443', 'user@bravo.vercel.app', '*.vercel.app', 'bravo.vercel.app\n']) {
    assert.deepEqual(appOrigins({ ...env, VERCEL_URL: host, VERCEL_BRANCH_URL: undefined }), [], String(host));
  }
});

test('preview CSRF boundary rejects other previews, production, forged host and non-JSON writes', () => {
  const saved = { ...process.env };
  Object.assign(process.env, { VERCEL_ENV: 'preview', VERCEL_URL: 'bravo-123.vercel.app', VERCEL_BRANCH_URL: 'bravo-git-test.vercel.app', APP_ORIGIN: 'https://bravounleashed.com' });
  const check = (origin, extra = {}, json = true) => {
    let passed = false;
    sameOrigin({ method: 'POST', headers: { origin, ...extra }, is: () => json }, {}, () => { passed = true; });
    return passed;
  };
  try {
    assert.equal(check('https://bravo-123.vercel.app'), true);
    assert.equal(check('https://bravo-git-test.vercel.app'), true);
    for (const origin of ['https://other.vercel.app', 'https://bravounleashed.com', 'null', undefined, 'http://bravo-123.vercel.app']) {
      assert.throws(() => check(origin, { host: 'bravo-123.vercel.app', 'x-forwarded-host': 'bravo-123.vercel.app' }), { status: 403 });
    }
    assert.throws(() => check('https://bravo-123.vercel.app', { 'sec-fetch-site': 'cross-site' }), { status: 403 });
    assert.throws(() => check('https://bravo-123.vercel.app', {}, false), { status: 415 });
  } finally {
    for (const key of ['VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'APP_ORIGIN']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
