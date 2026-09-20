import test from 'node:test';
import assert from 'node:assert/strict';
import { newSecret, seal, unseal, totp, matchingStep, recoveryHash, newRecoveryCodes, mfaConfigured } from '../server/mfa-crypto.js';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('TOTP matches RFC 6238 SHA-1 vectors', () => {
  for (const [seconds, expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) assert.equal(totp(secret, Math.floor(seconds / 30), 8), expected);
  assert.equal(matchingStep(secret, '287082', 59000), 1);
  assert.equal(matchingStep(secret, '287082', 90000), null);
  assert.equal(matchingStep(secret, '12345', 59000), null);
});
test('encrypted secrets bind to the account and fail closed without the key', () => {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  try {
    delete process.env.MFA_ENCRYPTION_KEY; assert.equal(mfaConfigured(), false); assert.throws(() => seal(secret, 'one'), { status: 503 });
    process.env.MFA_ENCRYPTION_KEY = 'ab'.repeat(32);
    const encrypted = seal(secret, 'one'); assert.equal(unseal(encrypted, 'one'), secret); assert.ok(!encrypted.includes(secret)); assert.notEqual(seal(secret, 'one'), encrypted);
    assert.throws(() => unseal(encrypted, 'two'));
    process.env.MFA_ENCRYPTION_KEY = 'cd'.repeat(32); assert.throws(() => unseal(encrypted, 'one'));
  } finally { if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previous; }
});
test('random secrets and recovery codes have expected formats and normalized hashes', () => {
  assert.match(newSecret(), /^[A-Z2-7]{32}$/);
  const codes = newRecoveryCodes(); assert.equal(new Set(codes).size, 10);
  for (const code of codes) { assert.match(code, /^[a-f0-9]{8}(-[a-f0-9]{8}){3}$/); assert.equal(recoveryHash(code), recoveryHash(code.replaceAll('-', '').toUpperCase())); assert.ok(!recoveryHash(code).includes(code)); }
});
