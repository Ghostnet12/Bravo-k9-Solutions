import { User } from './models.js';

// A transactional write makes revocation conflict with the protected operation;
// a read alone can pass on an older snapshot while revocation commits elsewhere.
export async function lockStaffAuthorization(user, session) {
  const result = await User.updateOne({
    _id: user._id, role: { $in: ['staff', 'owner'] }, blocked: false, removedAt: null,
    mustChangePassword: { $ne: true }, credentialVersion: user.credentialVersion || { $in: [0, null] },
  }, { $inc: { accessOperationRevision: 1 } }, { session });
  if (!result.matchedCount) throw Object.assign(new Error('Your account changed. Sign in again before continuing.'), { status: 409 });
}
