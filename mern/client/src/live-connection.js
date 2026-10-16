import { api } from './api';

// Configure before offering/answering; renew expiring credentials while media
// continues. An issued credential is not proof of a successful media path.
export function configureLiveConnection(pc, sessionId, onFailure = () => {}) {
  const controller = new AbortController();
  let stopped = false, timer, expires = Infinity;
  const disconnect = () => { if (stopped) return; stopped = true; clearTimeout(timer); controller.abort(); };
  async function configure() {
    const config = await api(`/live/${sessionId}/connection`, { method: 'POST', body: {}, signal: controller.signal, timeoutMs: 8000 });
    if (stopped || pc.signalingState === 'closed') throw Object.assign(new Error('Connection cancelled.'), { name: 'AbortError' });
    if (!Array.isArray(config.iceServers) || !config.iceServers.length || !['all', 'relay'].includes(config.iceTransportPolicy)) throw new Error('Video connection settings are unavailable. Please retry.');
    pc.setConfiguration({ iceServers: config.iceServers, iceTransportPolicy: config.iceTransportPolicy });
    expires = config.expiresAt ? Date.parse(config.expiresAt) : Infinity;
    if (Number.isFinite(expires)) timer = setTimeout(refresh, Math.max(15000, expires - Date.now() - 300000));
    return config;
  }
  async function refresh() {
    if (stopped || pc.signalingState === 'closed') return;
    try { await configure(); }
    catch (error) {
      if (stopped) return;
      if ([401, 403, 404, 410].includes(error.status) || Date.now() + 10000 >= expires) { disconnect(); onFailure(error.message); }
      else timer = setTimeout(refresh, 15000);
    }
  }
  const ready = configure().catch(error => { disconnect(); throw error; });
  return { ready, disconnect };
}
