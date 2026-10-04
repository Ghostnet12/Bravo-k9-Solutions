import { api } from './api';

export const DIRECT_ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];
export const DIRECT_FAILURE = 'This network could not make a direct connection. Try Wi-Fi or a different network. Bravo does not use a paid video relay.';
export const cameraReady = stream => !!stream?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted);
export function stopStream(stream) { stream?.getTracks().forEach(track => track.stop()); }
export async function gatherDescription(pc) {
  if (pc.iceGatheringState !== 'complete') await new Promise(resolve => {
    const finish = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); pc.removeEventListener('connectionstatechange', check); resolve(); };
    const check = () => { if (pc.signalingState === 'closed') { finish(); } else if (pc.iceGatheringState === 'complete') finish(); };
    // Non-trickle signaling keeps requests bounded. Include gathered host/STUN
    // candidates if an unreachable STUN service delays completion.
    const timer = setTimeout(finish, 8000);
    pc.addEventListener('icegatheringstatechange', check); pc.addEventListener('connectionstatechange', check);
  });
  if (pc.signalingState === 'closed' || !pc.localDescription) throw new Error('Connection cancelled.');
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}

export function createBroadcaster(sessionId, getStream, onCount) {
  const peers = new Map(); let closed = false;
  function remove(id) { const peer = peers.get(id); if (peer) { clearTimeout(peer.timeout); peer.pc.close(); peers.delete(id); } }
  const count = () => onCount([...peers.values()].filter(p => p.pc.connectionState === 'connected').length);
  async function answer(item) {
    const pc = new RTCPeerConnection({ iceServers: DIRECT_ICE });
    const peer = { pc, timeout: setTimeout(() => { if (pc.connectionState !== 'connected') { pc.close(); count(); } }, 35000) };
    peers.set(item.id, peer);
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.close(); count(); };
    try {
      await pc.setRemoteDescription(item.offer);
      for (const transceiver of pc.getTransceivers()) {
        // Negotiate send-only audio even if the microphone is currently off;
        // replaceTrack can then enable it without renegotiating every viewer.
        transceiver.direction = 'sendonly';
        await transceiver.sender.replaceTrack(getStream()?.getTracks().find(track => track.kind === transceiver.receiver.track.kind) || null);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      const description = await gatherDescription(pc);
      if (closed) return;
      await api(`/live/${sessionId}/peers/${item.id}/answer`, { method: 'POST', body: { answer: description }, timeoutMs: 10000 });
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const parameters = sender.getParameters();
        if (parameters.encodings?.length) {
          parameters.encodings.forEach(encoding => { encoding.maxBitrate = sender.track.kind === 'video' ? 700000 : 48000; });
          await sender.setParameters(parameters).catch(() => {});
        }
      }
    } catch { pc.close(); count(); }
  }
  return {
    sync(items) {
      if (closed) return;
      for (const id of peers.keys()) if (!items.some(item => item.id === id)) remove(id);
      for (const item of items) if (!peers.has(item.id)) void answer(item);
      count();
    },
    async replaceTrack(kind, track) {
      await Promise.all([...peers.values()].filter(p => p.pc.signalingState !== 'closed').map(async ({ pc }) => {
        const sender = pc.getTransceivers().find(t => t.receiver.track.kind === kind)?.sender;
        if (sender) await sender.replaceTrack(track);
      }));
    },
    disconnect() { closed = true; for (const id of peers.keys()) remove(id); count(); },
  };
}

export function createViewer(sessionId, onStream, onState, onError) {
  const pc = new RTCPeerConnection({ iceServers: DIRECT_ICE });
  const stream = new MediaStream(); let closed = false, credentials, timer, connectionTimer, lastVerified = Date.now();
  const leave = () => {
    if (credentials) fetch(`/api/live/${sessionId}/peers/${credentials.peerId}/leave`, {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: credentials.token }),
    }).catch(() => {});
  };
  function disconnect() { if (closed) return; closed = true; clearTimeout(timer); clearTimeout(connectionTimer); pc.close(); stopStream(stream); leave(); }
  function fail(message) { if (closed) return; disconnect(); onState('ended'); onError(message); }
  pc.ontrack = ({ track }) => { stream.addTrack(track); onStream(stream); };
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === 'connected') { clearTimeout(connectionTimer); onState('watching'); }
    else if (pc.connectionState === 'failed') fail(DIRECT_FAILURE);
    else if (pc.connectionState === 'disconnected') {
      onState('reconnecting'); clearTimeout(connectionTimer);
      connectionTimer = setTimeout(() => fail(DIRECT_FAILURE), 15000);
    }
  };
  async function poll() {
    if (closed) return;
    try {
      const result = await api(`/live/${sessionId}/peers/${credentials.peerId}/poll`, { method: 'POST', body: { token: credentials.token }, timeoutMs: 10000 });
      if (closed) return;
      lastVerified = Date.now();
      if (result.answer && !pc.currentRemoteDescription) await pc.setRemoteDescription(result.answer);
    } catch (error) {
      if ([401, 403, 404, 409, 410, 503].includes(error.status) || Date.now() - lastVerified > 30000) { fail(error.message); return; }
    }
    if (!closed) timer = setTimeout(poll, pc.connectionState === 'connected' ? 15000 : 2000);
  }
  return {
    disconnect,
    async connect() {
      try {
        pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
        await pc.setLocalDescription(await pc.createOffer());
        const offer = await gatherDescription(pc);
        if (closed) return;
        credentials = await api(`/live/${sessionId}/watch`, { method: 'POST', body: { offer }, timeoutMs: 10000 });
        if (closed) { leave(); return; }
        connectionTimer = setTimeout(() => fail(DIRECT_FAILURE), 35000);
        void poll();
      } catch (error) { if (!closed) { disconnect(); throw error; } }
    },
  };
}
