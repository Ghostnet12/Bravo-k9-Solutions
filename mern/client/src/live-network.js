import { api } from './api';
export async function loadLiveNetwork(sessionId, role, signal) {
  const data = await api(`/live/${sessionId}/network`, { method: 'POST', body: { role }, signal, timeoutMs: 8000 });
  if (data.version !== 1 || !Array.isArray(data.iceServers) || !data.iceServers.length || typeof data.relayConfigured !== 'boolean') {
    throw new Error('The live connection settings could not load. Refresh this page and retry.');
  }
  return { ...data, configuration: { iceServers: data.iceServers, iceTransportPolicy: 'all' } };
}
export const liveConnectionFailure = relayConfigured => relayConfigured
  ? 'The video connection could not finish, including its relay route. Check that mobile data is available and tap Retry connection.'
  : 'This network could not connect directly. Bravo’s mobile-network relay has not been configured yet. Please try another connection or contact Bravo.';
