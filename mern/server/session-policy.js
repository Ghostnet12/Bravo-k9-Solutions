export const PRIVILEGED_MAX_AGE = 8 * 60 * 60 * 1000;
export const PRIVILEGED_IDLE_AGE = 30 * 60 * 1000;

export function sessionLifetime(user) {
  if (user.mustChangePassword) return 30 * 60000;
  return ['staff', 'owner'].includes(user.role) ? PRIVILEGED_MAX_AGE : 7 * 86400000;
}

export function privilegedSessionExpired(session, user, now = Date.now()) {
  if (!['staff', 'owner'].includes(user.role)) return false;
  // Existing sessions predate these fields. Their ObjectId preserves issuance
  // time; do not reset their absolute lifetime when deploying this protection.
  const issued = new Date(session.issuedAt || session._id?.getTimestamp?.()).getTime();
  const lastSeen = new Date(session.lastSeenAt || session.issuedAt || session._id?.getTimestamp?.()).getTime();
  return !Number.isFinite(issued) || !Number.isFinite(lastSeen) ||
    now - issued >= PRIVILEGED_MAX_AGE || now - lastSeen >= PRIVILEGED_IDLE_AGE;
}
