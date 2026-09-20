import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrimaryOwner, requireUser, requireStaff, requireOwner, publicRole } from '../server/authorization.js';
import { requirePrimaryOwner } from '../server/administrator-removal.js';

const founder = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'owner' };
test('founder access requires an explicit valid owner identity', t => {
  const previous = process.env.OWNER_USER_ID;
  t.after(() => { if (previous === undefined) delete process.env.OWNER_USER_ID; else process.env.OWNER_USER_ID = previous; });
  for (const configured of [undefined, '', 'undefined', 'invalid', ' aaaaaaaaaaaaaaaaaaaaaaaa']) {
    if (configured === undefined) delete process.env.OWNER_USER_ID; else process.env.OWNER_USER_ID = configured;
    assert.equal(isPrimaryOwner(founder), false);
    assert.equal(isPrimaryOwner({ _id: '6aa290cbd066f8feb3c1964f', role: 'owner' }), false);
    assert.equal(isPrimaryOwner(undefined), false);
    assert.throws(() => requirePrimaryOwner({ user: founder }, {}, () => assert.fail('must deny')), { status: 403 });
  }
  process.env.OWNER_USER_ID = founder._id.toUpperCase();
  assert.equal(isPrimaryOwner(founder), true);
  assert.equal(isPrimaryOwner({ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'owner', isPrimaryOwner: true }), false);
  assert.equal(publicRole(founder), 'owner');
  assert.equal(publicRole({ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'owner' }), 'staff');
  let called = false;
  requirePrimaryOwner({ user: founder }, {}, () => { called = true; });
  assert.equal(called, true);
  assert.throws(() => requirePrimaryOwner({ user: { ...founder, role: 'member' } }, {}, () => assert.fail('must deny')), { status: 403 });
});

test('role middleware preserves the member, staff and delegated owner boundary', () => {
  for (const role of [undefined, 'member', 'staff', 'owner', 'administrator', 'unknown']) {
    const req = { user: role ? { role } : undefined };
    for (const [guard, allowed, status] of [
      [requireUser, !!role, 401],
      [requireStaff, ['staff', 'owner'].includes(role), 403],
      [requireOwner, role === 'owner', 403],
    ]) {
      let called = false;
      const invoke = () => guard(req, {}, () => { called = true; });
      if (allowed) { invoke(); assert.equal(called, true); }
      else { assert.throws(invoke, { status }); assert.equal(called, false); }
    }
  }
});
