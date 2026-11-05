import { createHmac, randomUUID } from 'node:crypto';
import { LIVE_ICE_SERVERS } from './live-media.js';

// Long-lived provider secrets never leave the server. Only expiring TURN
// credentials are sent to callers already authorized for the live session.
export const RELAY_TTL_SECONDS = 3600;
const endpoint = 'https://rtc.live.cloudflare.com/v1/turn/keys/';
const failure = code => Object.assign(new Error('The video relay is temporarily unavailable. Please retry shortly.'), { status: 503, code });
export function relayConfiguration(env = process.env) {
  const provider = env.BRAVO_TURN_PROVIDER || '';
  if (!provider || provider === 'disabled') return { configured: false, provider: 'none' };
  if (provider === 'cloudflare') {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(env.CLOUDFLARE_TURN_KEY_ID || '') || !env.CLOUDFLARE_TURN_API_TOKEN?.trim()) return { configured: false, provider, invalid: true };
    return { configured: true, provider };
  }
  if (provider === 'coturn') {
    const urls = String(env.BRAVO_TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!env.BRAVO_TURN_SHARED_SECRET || env.BRAVO_TURN_SHARED_SECRET.length < 32 || !urls.length || urls.length > 8 || !urls.every(validTurnURL)) return { configured: false, provider, invalid: true };
    return { configured: true, provider };
  }
  return { configured: false, provider: 'unknown', invalid: true };
}
export function validTurnURL(value) {
  if (typeof value !== 'string' || value.length > 512) return false;
  // Explicit TURN schemes only: never browser navigation URLs or credentials.
  const match = value.match(/^(turns?):([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):([0-9]{1,5})(?:\?transport=(udp|tcp))?$/);
  return !!match && Number(match[3]) > 0 && Number(match[3]) <= 65535 && (match[1] !== 'turns' || match[4] !== 'udp');
}
function providerIce(data) {
  const entries = Array.isArray(data?.iceServers) ? data.iceServers : data?.iceServers ? [data.iceServers] : [];
  const turns = entries.filter(entry => entry && typeof entry.username === 'string' && typeof entry.credential === 'string')
    .map(entry => ({ urls: (Array.isArray(entry.urls) ? entry.urls : [entry.urls]).filter(url => validTurnURL(url) && /^turns?:turn\.cloudflare\.com:/.test(url)), username: entry.username, credential: entry.credential }))
    .filter(entry => entry.urls.length && entry.username.length <= 2048 && entry.credential.length <= 2048 && entry.username.length && entry.credential.length);
  if (!turns.length || turns.length > 4 || !turns.some(entry => entry.urls.includes('turns:turn.cloudflare.com:443?transport=tcp'))) throw failure('LIVE_RELAY_INVALID_RESPONSE');
  return [...LIVE_ICE_SERVERS, ...turns];
}
export async function liveConnectionConfig({ env = process.env, fetcher = fetch, now = Date.now() } = {}) {
  const settings = relayConfiguration(env);
  if (settings.invalid) throw failure('LIVE_RELAY_NOT_CONFIGURED');
  if (!settings.configured) return { iceServers: LIVE_ICE_SERVERS, iceTransportPolicy: 'all', relayConfigured: false, expiresAt: null };
  const expiresAt = new Date(now + RELAY_TTL_SECONDS * 1000).toISOString();
  let iceServers;
  if (settings.provider === 'cloudflare') {
    try {
      const response = await fetcher(`${endpoint}${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: RELAY_TTL_SECONDS }),
      });
      if (!response.ok) throw failure('LIVE_RELAY_UNAVAILABLE');
      iceServers = providerIce(await response.json());
    } catch { throw failure('LIVE_RELAY_UNAVAILABLE'); }
  } else {
    const username = `${Math.floor(now / 1000) + RELAY_TTL_SECONDS}:bravo-${randomUUID()}`;
    const credential = createHmac('sha1', env.BRAVO_TURN_SHARED_SECRET).update(username).digest('base64');
    iceServers = [...LIVE_ICE_SERVERS, { urls: env.BRAVO_TURN_URLS.split(',').map(s => s.trim()).filter(Boolean), username, credential }];
  }
  return { iceServers, iceTransportPolicy: env.BRAVO_LIVE_ICE_POLICY === 'relay' ? 'relay' : 'all', relayConfigured: true, expiresAt };
}
