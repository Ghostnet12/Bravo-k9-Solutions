import { User, AuditEvent } from './models.js';
import { verifyPassword } from './auth.js';

const denied = () => Object.assign(new Error('Confirm your current owner password.'), { status: 403 });
export async function confirmOwnerPassword(user, password) {
  const actor = await User.findById(user._id).select('+passwordHash +credentialVersion');
  if (!actor || actor.blocked || actor.removedAt || actor.mustChangePassword || actor.role !== 'owner' ||
      (actor.credentialVersion || 0) !== (user.credentialVersion || 0) ||
      !await verifyPassword(password, actor.passwordHash)) {
    // Never record passwords, hashes, request bodies or cookies.
    await AuditEvent.create({ actorId: user._id, action: 'security.reauthentication-denied', targetType: 'user', targetId: String(user._id) });
    throw denied();
  }
  return { _id: actor._id, passwordHash: actor.passwordHash, credentialVersion: actor.credentialVersion || 0 };
}

export async function lockOwnerReauthentication(proof, session) {
  // Writing the actor inside the destructive-action transaction serializes it
  // against password changes, permission changes, blocking and account removal.
  const result = await User.updateOne({
    _id: proof._id, passwordHash: proof.passwordHash,
    credentialVersion: proof.credentialVersion || { $in: [0, null] },
    role: 'owner', blocked: false, removedAt: null, mustChangePassword: { $ne: true },
  }, { $set: { lastReauthenticatedAt: new Date() } }, { session });
  if (!result.matchedCount) throw Object.assign(new Error('Your account changed. Sign in again before continuing.'), { status: 409 });
}
