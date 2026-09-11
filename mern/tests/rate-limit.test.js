import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../server/auth.js';
import { RateBucket } from '../server/models.js';

const query = value => ({ then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });

test('role-aware rate limits preserve customer protection and allow owner verification', async t => {
  t.mock.method(RateBucket, 'findOneAndUpdate', () => query({ count: 11 }));
  const middleware = rateLimit('booking', req => req.user?.role === 'owner' ? 50 : 10, 3600000);

  let ownerContinued = false;
  await middleware({ user: { _id: 'owner-1', role: 'owner' } }, { set() {} }, () => { ownerContinued = true; });
  assert.equal(ownerContinued, true);

  let retryAfter;
  await assert.rejects(
    middleware({ user: { _id: 'client-1', role: 'client' } }, { set(name, value) { if (name === 'Retry-After') retryAfter = value; } }, () => {}),
    error => error.status === 429 && /Please wait about/.test(error.message),
  );
  assert.ok(Number(retryAfter) > 0);
});
