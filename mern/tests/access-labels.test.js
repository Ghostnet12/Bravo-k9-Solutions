import test from 'node:test';
import assert from 'node:assert/strict';
import { accessLabel, deskLabel } from '../shared/access.js';
import { publicRole, isPrimaryOwner } from '../server/auth.js';

test('permission labels separate founder ownership from delegated administrator access', () => {
  const owner = { _id: process.env.OWNER_USER_ID || '6aa290cbd066f8feb3c1964f', role: 'owner', isPrimaryOwner: true };
  const admin = { _id: '111111111111111111111111', role: 'owner', isPrimaryOwner: false };
  assert.equal(publicRole(owner), 'owner'); assert.equal(accessLabel(owner), 'Owner');
  assert.equal(publicRole(admin), 'staff'); assert.equal(accessLabel(admin), 'Administrator');
  assert.equal(deskLabel(admin), 'Admin desk'); assert.equal(deskLabel(owner), 'Owner desk');
  assert.equal(isPrimaryOwner({ ...admin, isPrimaryOwner: true }), false);
  assert.equal(accessLabel({ role: 'staff' }), 'Staff'); assert.equal(accessLabel({ role: 'member' }), 'Client');
});
