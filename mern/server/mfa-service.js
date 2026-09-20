import { randomBytes } from 'node:crypto';
import { User, Session, PasswordReset, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { verifyPassword, issueSession } from './auth.js';
import { newSecret, seal, unseal, matchingStep, recoveryHash, newRecoveryCodes } from './mfa-crypto.js';
const fail = (message, status = 403) => Object.assign(new Error(message), { status });
const select = '+passwordHash +credentialVersion +mfa';
const version = user => user.credentialVersion || { $in: [0, null] };
const currentFilter = user => ({ _id: user._id, passwordHash: user.passwordHash, credentialVersion: version(user), blocked: false, removedAt: null, mustChangePassword: { $ne: true } });
const audit = (user, action, session) => AuditEvent.create([{ actorId: user._id, action, targetType: 'user', targetId: String(user._id) }], session ? { session } : {});
async function account(user, password) {
  const current = await User.findById(user._id).select(select);
  if (!current || current.blocked || current.removedAt || current.mustChangePassword || (current.credentialVersion || 0) !== (user.credentialVersion || 0) || !await verifyPassword(password, current.passwordHash)) throw fail('Confirm your current password.');
  return current;
}
export async function beginEnrollment(user, password) {
  const current = await account(user, password);
  if (!['owner', 'staff'].includes(current.role)) throw fail('Team access required.');
  if (current.mfaEnabled) throw fail('Two-step verification is already enabled.', 409);
  const secret = newSecret(), token = randomBytes(16).toString('hex');
  const pending = { secret: seal(secret, current._id), token, expiresAt: new Date(Date.now() + 600000) };
  const result = await User.updateOne({ ...currentFilter(current), role: current.role, mfaEnabled: { $ne: true } }, { $set: { 'mfa.pending': pending } });
  if (!result.matchedCount) throw fail('Your account changed. Sign in again.', 409);
  return { secret, token, expiresAt: pending.expiresAt, account: current.email || current.name };
}
export async function finishEnrollment(req, res, input) {
  const current = await account(req.user, input.currentPassword), pending = current.mfa?.pending;
  if (current.mfaEnabled || !['owner', 'staff'].includes(current.role) || !pending || pending.token !== input.token || !(pending.expiresAt > new Date())) throw fail('Setup expired or changed. Start again.', 409);
  const step = matchingStep(unseal(pending.secret, current._id), input.code);
  if (step === null) throw fail('Check the code in your authenticator app and try again.');
  const recoveryCodes = newRecoveryCodes();
  let updated;
  await transaction(async session => {
    updated = await User.findOneAndUpdate({ ...currentFilter(current), role: current.role, mfaEnabled: { $ne: true }, 'mfa.pending.token': input.token, 'mfa.pending.expiresAt': { $gt: new Date() } }, {
      $set: { mfaEnabled: true, mfa: { secret: pending.secret, lastStep: step, recoveryHashes: recoveryCodes.map(recoveryHash) } }, $inc: { credentialVersion: 1 },
    }, { session, returnDocument: 'after' }).select('+credentialVersion');
    if (!updated) throw fail('Your account changed. Start setup again.', 409);
    await Session.deleteMany({ userId: current._id }, { session });
    await PasswordReset.deleteMany({ userId: current._id }, { session });
    await audit(current, 'security.mfa-enabled', session);
  });
  await issueSession(req, res, updated);
  return { recoveryCodes };
}
// Atomic consumption prevents simultaneous requests from reusing a code.
// Bind verification to the same password and credential version checked at login.
export async function consumeFactor(current, code, session) {
  const filter = { ...currentFilter(current), mfaEnabled: true, 'mfa.secret': current.mfa?.secret };
  let update;
  if (/^\d{6}$/.test(code)) {
    const step = matchingStep(unseal(current.mfa.secret, current._id), code);
    if (step === null) return false;
    filter['mfa.lastStep'] = { $lt: step }; update = { $set: { 'mfa.lastStep': step } };
  } else if (/^[a-f0-9\s-]{32,40}$/i.test(code)) {
    const hash = recoveryHash(code); filter['mfa.recoveryHashes'] = hash; update = { $pull: { 'mfa.recoveryHashes': hash } };
  } else return false;
  const result = await User.updateOne(filter, update, session ? { session } : {});
  if (!result.matchedCount) return false;
  await audit(current, /^\d{6}$/.test(code) ? 'security.mfa-verified' : 'security.mfa-recovery-used', session);
  return true;
}
export async function verifyLoginFactor(current, code) {
  if (!current.mfaEnabled) return;
  if (!await consumeFactor(current, code || '')) {
    await audit(current, 'security.mfa-denied');
    throw fail('Enter a fresh authenticator code or an unused recovery code.', 401);
  }
}
export async function disableMfa(req, res, input) {
  const current = await account(req.user, input.currentPassword);
  if (!current.mfaEnabled) throw fail('Two-step verification is already off.', 409);
  let updated;
  await transaction(async session => {
    if (!await consumeFactor(current, input.code, session)) throw fail('Enter a fresh authenticator code or an unused recovery code.');
    updated = await User.findOneAndUpdate(currentFilter(current), { $set: { mfaEnabled: false }, $unset: { mfa: 1 }, $inc: { credentialVersion: 1 } }, { session, returnDocument: 'after' }).select('+credentialVersion');
    if (!updated) throw fail('Your account changed. Sign in again.', 409);
    await Session.deleteMany({ userId: current._id }, { session });
    await PasswordReset.deleteMany({ userId: current._id }, { session });
    await audit(current, 'security.mfa-disabled', session);
  });
  await issueSession(req, res, updated);
  return { ok: true };
}
