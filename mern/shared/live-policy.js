// One policy for API discovery, dashboards and browser freshness checks.
export const LIVE_POLL_MS = 2000;
export const LIVE_FRESH_MS = 8000;
export const LIVE_STALE_MS = 20000;
export function sessionState(session, now = Date.now()) {
  if (!session.open || ['ending', 'ended'].includes(session.status)) return 'ended';
  if (now - new Date(session.lastSeenAt).getTime() >= LIVE_STALE_MS) return 'ended';
  if (!session.startedAt || !session.lastPublishedAt) return 'starting';
  const age = now - new Date(session.lastPublishedAt).getTime();
  if (age >= LIVE_STALE_MS) return 'ended';
  return session.status === 'live' && age < LIVE_FRESH_MS ? 'live' : 'reconnecting';
}
export const isLiveAnnouncement = text => /\b(?:bravo(?:\s+k9(?:\s+solutions)?)?(?:\s+is)?|training|streaming|broadcasting)\s+live\s+(?:now|today)\b/i.test(String(text));
