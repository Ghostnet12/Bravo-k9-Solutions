import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { sessionLifetime, privilegedSessionExpired, PRIVILEGED_MAX_AGE, PRIVILEGED_IDLE_AGE } from '../server/session-policy.js';

test('privileged sessions have absolute and idle deadlines independent of cookie expiry', () => {
  const now = Date.now();
  for (const role of ['staff', 'owner']) {
    const user = { role };
    assert.equal(sessionLifetime(user), PRIVILEGED_MAX_AGE);
    assert.equal(privilegedSessionExpired({ issuedAt: new Date(now), lastSeenAt: new Date(now) }, user, now), false);
    assert.equal(privilegedSessionExpired({ issuedAt: new Date(now - PRIVILEGED_MAX_AGE), lastSeenAt: new Date(now) }, user, now), true);
    assert.equal(privilegedSessionExpired({ issuedAt: new Date(now - PRIVILEGED_IDLE_AGE), lastSeenAt: new Date(now - PRIVILEGED_IDLE_AGE) }, user, now), true);
    assert.equal(privilegedSessionExpired({ _id: mongoose.Types.ObjectId.createFromTime(Math.floor((now - PRIVILEGED_MAX_AGE - 1000) / 1000)) }, user, now), true);
    assert.equal(privilegedSessionExpired({}, user, now), true);
  }
  assert.equal(sessionLifetime({ role: 'member' }), 7 * 86400000);
  assert.equal(sessionLifetime({ role: 'owner', mustChangePassword: true }), 30 * 60000);
  assert.equal(privilegedSessionExpired({}, { role: 'member' }, now), false);
});
