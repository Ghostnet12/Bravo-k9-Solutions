// TURN credentials are minted on the server only after live-session access is
// checked. Never put the long-lived provider token or shared secret in a client.
import { createHmac, randomBytes } from 'node:crypto';
import { LIVE_ICE_SERVERS } from './live-media.js';
export const LIVE_TURN_TTL_SECONDS = 21600;
const configError = () => Object.assign(new Error('The live relay configuration is incomplete. Please contact Bravo.'), { status: 503, code: 'LIVE_RELAY_CONFIGURATION' });
const unavailable = () => Object.assign(new Error('The live relay is temporarily unavailable. Please retry shortly.'), { status: 503, code: 'LIVE_RELAY_UNAVAILABLE' });
const names = ['BRAVO_TURN_KEY_ID', 'BRAVO_TURN_API_TOKEN', 'BRAVO_TURN_URLS', 'BRAVO_TURN_SHARED_SECRET'];
const has = (env, name) => typeof env[name] === 'string' && env[name].trim().length > 0;
function configuration(env) {
  if (!names.some(name => has(env, name))) return { provider: 'none' };
  const cloud = has(env, 'BRAVO_TURN_KEY_ID') || has(env, 'BRAVO_TURN_API_TOKEN');
  const own = has(env, 'BRAVO_TURN_URLS') || has(env, 'BRAVO_TURN_SHARED_SECRET');
  if (cloud && own) throw configError();
  if (cloud) {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(env.BRAVO_TURN_KEY_ID || '') || !has(env, 'BRAVO_TURN_API_TOKEN') || env.BRAVO_TURN_API_TOKEN.length > 4096 || /[\s\x00-\x1f]/.test(env.BRAVO_TURN_API_TOKEN)) throw configError();
    return { provider: 'cloudflare', key: env.BRAVO_TURN_KEY_ID, token: env.BRAVO_TURN_API_TOKEN };
  }
  let urls;
  try { urls = JSON.parse(env.BRAVO_TURN_URLS); } catch { throw configError(); }
  const validUrl = url => {
    if (typeof url !== 'string' || url.length > 300) return false;
    const match = /^(turns?):([a-zA-Z0-9][a-zA-Z0-9.-]*|\[[a-fA-F0-9:]+\]):([0-9]{1,5})(?:\?transport=(udp|tcp))?$/.exec(url);
    return !!match && Number(match[3]) > 0 && Number(match[3]) <= 65535 && (match[1] !== 'turns' || match[4] !== 'udp');
  };
  if (!Array.isArray(urls) || !urls.length || urls.length > 6 || !urls.every(validUrl) || !has(env, 'BRAVO_TURN_SHARED_SECRET') || env.BRAVO_TURN_SHARED_SECRET.length < 32 || env.BRAVO_TURN_SHARED_SECRET.length > 512) throw configError();
  // Browser-friendly TLS on 443 is the escape route for restricted carriers.
  // Isolated local relay tests deliberately use non-TLS loopback sockets.
  if (env.NODE_ENV !== 'test' && !urls.some(url => /^turns:/.test(url) && /:443(?:\?transport=tcp)?$/.test(url))) throw configError();
  return { provider: 'coturn', urls: [...new Set(urls)], secret: env.BRAVO_TURN_SHARED_SECRET };
}
export function liveRelayStatus(env = process.env) {
  try { return configuration(env).provider === 'none' ? 'not-configured' : 'configured'; }
  catch { return 'misconfigured'; }
}
export async function issueLiveNetwork({ env = process.env, fetcher = globalThis.fetch, now = Date.now() } = {}) {
  const config = configuration(env);
  const direct = { version: 1, iceServers: LIVE_ICE_SERVERS.map(server => ({ ...server })), iceTransportPolicy: 'all', relayConfigured: false, expiresAt: null };
  if (config.provider === 'none') return direct;
  const expiresAt = new Date(now + LIVE_TURN_TTL_SECONDS * 1000).toISOString();
  if (config.provider === 'coturn') {
    const username = `${Math.floor(now / 1000) + LIVE_TURN_TTL_SECONDS}:${randomBytes(16).toString('hex')}`;
    const credential = createHmac('sha1', config.secret).update(username).digest('base64');
    return { ...direct, relayConfigured: true, expiresAt, iceServers: [...direct.iceServers, { urls: config.urls, username, credential }] };
  }
  try {
    const response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${config.key}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: LIVE_TURN_TTL_SECONDS }), redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw unavailable();
    const data = await response.json();
    // Keep the useful primary UDP/TCP and browser-compatible TLS fallback.
    // Do not hand browsers blocked alternate port 53 or arbitrary response URLs.
    const permitted = new Set(['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp']);
    const raw = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    const servers = raw.slice(0, 8).flatMap(server => {
      if (!server || typeof server.username !== 'string' || !server.username.length || server.username.length > 2048 || typeof server.credential !== 'string' || !server.credential.length || server.credential.length > 2048) return [];
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => permitted.has(url));
      return urls.length ? [{ urls: [...new Set(urls)], username: server.username, credential: server.credential }] : [];
    });
    if (!servers.some(server => server.urls.includes('turns:turn.cloudflare.com:443?transport=tcp'))) throw unavailable();
    return { ...direct, relayConfigured: true, expiresAt, iceServers: [...direct.iceServers, ...servers] };
  } catch { throw unavailable(); }
}
