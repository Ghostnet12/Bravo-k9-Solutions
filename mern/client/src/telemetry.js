import { routeArea } from '../../shared/telemetry.js';
const key = 'bravo-visit-v1';
let enabled = false, monitoringEnabled = false;
export function enableMonitoring(value) { monitoringEnabled = value === true; }
const sent = new Set(), errors = new Set();
export function trackingAllowed() { return navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true; }
function visit(create = false) {
  if (!monitoringEnabled || !enabled || !trackingAllowed()) return null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (stored && /^[0-9a-f-]{36}$/.test(stored.token) && Date.now() - stored.created < 30 * 60000) return stored;
    if (!create) return null;
    let channel = 'direct';
    try {
      const host = new URL(document.referrer).hostname;
      if (host !== location.hostname) channel = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com)$/.test(host) ? 'search' : /(^|\.)(facebook\.com|instagram\.com|t\.co|x\.com|youtube\.com|tiktok\.com)$/.test(host) ? 'social' : 'referral';
    } catch { /* No referrer is direct traffic. */ }
    const next = { token: crypto.randomUUID(), channel, created: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(next)); return next;
  } catch { return null; }
}
function send(endpoint, body) {
  // Independent from api(): reporting must never recurse or interrupt the task.
  return fetch(`/api/telemetry/${endpoint}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).then(r => r.ok).catch(() => false);
}
export function setTrackingAudience(user) {
  enabled = !['staff', 'owner'].includes(user?.role);
  if (!enabled) { try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ } }
}
export function trackVisit(stage) {
  const current = visit(true); if (!current) return;
  const id = `${current.token}:${stage}`; if (sent.has(id)) return;
  sent.add(id);
  void send('visit', { token: current.token, channel: current.channel, stage }).then(ok => { if (!ok) sent.delete(id); });
}
export function bookingTrackingHeaders() {
  const current = visit(); return current ? { 'X-Bravo-Visit': current.token } : {};
}
export function reportBrowserError(kind, path = globalThis.location?.pathname || '') {
  if (!monitoringEnabled) return;
  const area = routeArea(path), id = `${kind}:${area}`;
  if (errors.has(id) || errors.size >= 10) return;
  errors.add(id); void send('error', { kind, area });
}
export function installErrorMonitoring() {
  const scriptError = event => {
    try { if (!event.filename || new URL(event.filename).origin !== location.origin) return; } catch { return; }
    reportBrowserError('script_error');
  };
  const rejected = () => reportBrowserError('unhandled_promise');
  window.addEventListener('error', scriptError); window.addEventListener('unhandledrejection', rejected);
  return () => { window.removeEventListener('error', scriptError); window.removeEventListener('unhandledrejection', rejected); };
}
