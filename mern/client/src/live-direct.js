import { api } from './api';
import { createLocalPublisherHealth } from './publisher-health';
import { loadLiveNetwork, liveConnectionFailure } from './live-network';

export const DIRECT_ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];
export const DIRECT_FAILURE = liveConnectionFailure(false);
export const cameraReady = stream => !!stream?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted);
export function stopStream(stream) { stream?.getTracks().forEach(track => track.stop()); }
export async function gatherDescription(pc, waitMs = 8000) {
  if (pc.iceGatheringState !== 'complete') await new Promise(resolve => {
    const finish = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); pc.removeEventListener('connectionstatechange', check); resolve(); };
    const check = () => { if (pc.signalingState === 'closed') { finish(); } else if (pc.iceGatheringState === 'complete') finish(); };
    // Non-trickle signaling keeps requests bounded. Include gathered host/STUN
    // candidates if an unreachable STUN service delays completion.
    const timer = setTimeout(finish, waitMs);
    pc.addEventListener('icegatheringstatechange', check); pc.addEventListener('connectionstatechange', check);
  });
  if (pc.signalingState === 'closed' || !pc.localDescription) throw new Error('Connection cancelled.');
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}

export function createBroadcaster(sessionId, getStream, onCount) {
  const peers = new Map(), controller = new AbortController(); let closed = false, cached, pendingNetwork;
  function remove(id) { const peer = peers.get(id); if (peer) { clearTimeout(peer.timeout); peer.pc?.close(); peers.delete(id); } }
  const count = () => onCount([...peers.values()].filter(p => p.pc?.connectionState === 'connected').length);
  async function network() {
    if (cached && cached.validUntil > Date.now() + 60000) return cached;
    if (!pendingNetwork) pendingNetwork = loadLiveNetwork(sessionId, 'publisher', controller.signal).then(data => {
      cached = { ...data, validUntil: data.expiresAt ? Date.parse(data.expiresAt) : Date.now() + 120000 };
      return cached;
    }).finally(() => { pendingNetwork = null; });
    return pendingNetwork;
  }
  async function answer(item) {
    // Reserve first: repeated heartbeats must not create duplicate peers while
    // short-lived relay credentials are being obtained.
    const peer = { pc: null, timeout: null }; peers.set(item.id, peer);
    const active = () => !closed && peers.get(item.id) === peer;
    try {
      const connection = await network();
      if (!active()) return;
      const pc = new RTCPeerConnection(connection.configuration); peer.pc = pc;
      peer.timeout = setTimeout(() => { if (pc.connectionState !== 'connected') { pc.close(); count(); } }, 35000);
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.close(); count(); };
      await pc.setRemoteDescription(item.offer);
      for (const transceiver of pc.getTransceivers()) {
        // Audio stays negotiated even when the trainer's microphone is off.
        transceiver.direction = 'sendonly';
        await transceiver.sender.replaceTrack(getStream()?.getTracks().find(track => track.kind === transceiver.receiver.track.kind) || null);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      const description = await gatherDescription(pc, connection.relayConfigured ? 12000 : 8000);
      if (!active()) return;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!active() || pc.signalingState === 'closed') throw new Error('Connection cancelled.');
        try {
          await api(`/live/${sessionId}/peers/${item.id}/answer`, { method: 'POST', body: { answer: description }, timeoutMs: 8000, signal: controller.signal });
          break;
        } catch (error) {
          if (attempt === 2 || [400, 401, 403, 404, 410].includes(error.status)) throw error;
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const parameters = sender.getParameters();
        if (parameters.encodings?.length) {
          parameters.encodings.forEach(encoding => { encoding.maxBitrate = sender.track.kind === 'video' ? 700000 : 48000; });
          await sender.setParameters(parameters).catch(() => {});
        }
      }
    } catch {
      clearTimeout(peer.timeout); peer.pc?.close(); count();
      // Keep the tombstone until the next sync so an old heartbeat cannot
      // resurrect a rejected negotiation. No credentials are logged or stored.
      if (active()) await api(`/live/${sessionId}/peers/${item.id}/reject`, { method: 'POST', body: {}, timeoutMs: 5000, signal: controller.signal }).catch(() => {});
    }
  }
  return {
    sync(items) {
      if (closed) return;
      for (const id of peers.keys()) if (!items.some(item => item.id === id)) remove(id);
      for (const item of items) if (!peers.has(item.id)) void answer(item);
      count();
    },
    async replaceTrack(kind, track) {
      await Promise.all([...peers.values()].filter(p => p.pc && p.pc.signalingState !== 'closed').map(async ({ pc }) => {
        const sender = pc.getTransceivers().find(t => t.receiver.track.kind === kind)?.sender;
        if (sender) await sender.replaceTrack(track);
      }));
    },
    disconnect() { closed = true; controller.abort(); cached = null; for (const id of peers.keys()) remove(id); count(); },
  };
}

export function createViewer(sessionId, onStream, onState, onError) {
  const stream = new MediaStream(), controller = new AbortController();
  let pc, closed = false, credentials, timer, connectionTimer, lastVerified = Date.now(), relayConfigured = false;
  const failureMessage = () => liveConnectionFailure(relayConfigured);
  const leave = () => {
    if (credentials) fetch(`/api/live/${sessionId}/peers/${credentials.peerId}/leave`, {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: credentials.token }),
    }).catch(() => {});
  };
  function disconnect() { if (closed) return; closed = true; controller.abort(); clearTimeout(timer); clearTimeout(connectionTimer); pc?.close(); stopStream(stream); leave(); }
  function fail(message) { if (closed) return; disconnect(); onState('ended'); onError(message); }
  function bindConnection() {
    pc.ontrack = ({ track }) => { if (closed) return; stream.addTrack(track); onStream(stream); };
    pc.onconnectionstatechange = () => {
      if (closed) return;
      if (pc.connectionState === 'connected') { clearTimeout(connectionTimer); onState('watching'); }
      else if (pc.connectionState === 'failed') fail(failureMessage());
      else if (pc.connectionState === 'disconnected') {
        onState('reconnecting'); clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => fail(failureMessage()), 15000);
      }
    };
  }
  async function poll() {
    if (closed) return;
    try {
      const result = await api(`/live/${sessionId}/peers/${credentials.peerId}/poll`, { method: 'POST', body: { token: credentials.token }, timeoutMs: 10000, signal: controller.signal });
      if (closed) return;
      lastVerified = Date.now();
      if (result.status === 'reconnecting') onState('reconnecting');
      else if (pc.connectionState === 'connected') onState('watching');
      if (result.answer && !pc.currentRemoteDescription) await pc.setRemoteDescription(result.answer);
    } catch (error) {
      if (closed) return;
      if ([401, 403, 404, 409, 410, 503].includes(error.status) || Date.now() - lastVerified > 30000) { fail(error.message); return; }
    }
    if (!closed) timer = setTimeout(poll, pc.connectionState === 'connected' ? 4000 : 1000);
  }
  return {
    disconnect,
    async connect() {
      try {
        // Guest/public access is decided by the server, not subscription state.
        // Get TURN before createOffer: adding it after gathering is too late.
        const network = await loadLiveNetwork(sessionId, 'viewer', controller.signal);
        if (closed) return;
        relayConfigured = network.relayConfigured;
        pc = new RTCPeerConnection(network.configuration); bindConnection();
        pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
        await pc.setLocalDescription(await pc.createOffer());
        const offer = await gatherDescription(pc, relayConfigured ? 12000 : 8000);
        if (closed) return;
        // Do not abort an in-flight join: if it succeeds after cancellation,
        // receive its capability and immediately release the allocated peer.
        credentials = await api(`/live/${sessionId}/watch`, { method: 'POST', body: { offer }, timeoutMs: 10000 });
        if (closed) { leave(); return; }
        lastVerified = Date.now();
        connectionTimer = setTimeout(() => fail(failureMessage()), 35000);
        void poll();
      } catch (error) { if (!closed) { disconnect(); throw error; } }
    },
  };
}

// Prefer genuine local codec output so publishing does not require same-device
// ICE or a hidden video renderer. Older browsers retain the WebRTC fallback.
// Neither health path proves reachability to a remote viewer; viewers negotiate
// their own direct connections and retain the existing authorization boundaries.
export async function createPublisherHealth(getStream, options = {}) {
  try { return await createLocalPublisherHealth(getStream, options); }
  catch (error) {
    if (options.signal?.aborted || error.name !== 'NotSupportedError') throw error;
    return createLoopbackHealth(getStream, options);
  }
}
async function createLoopbackHealth(getStream, { signal } = {}) {
  const sender = new RTCPeerConnection({ iceServers: [] }), receiver = new RTCPeerConnection({ iceServers: [] });
  const id = crypto.randomUUID(); let closed = false;
  const sink = document.createElement('video'); sink.muted = true; sink.autoplay = true; sink.playsInline = true;
  sink.setAttribute('aria-hidden', 'true'); sink.setAttribute('data-publisher-health', '');
  sink.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'; document.body.append(sink);
  receiver.ontrack = event => { sink.srcObject = new MediaStream([event.track]); sink.play().catch(() => {}); };
  const disconnect = () => { if (closed) return; closed = true; sender.close(); receiver.close(); sink.srcObject = null; sink.remove(); signal?.removeEventListener('abort', disconnect); };
  signal?.addEventListener('abort', disconnect, { once: true });
  if (signal?.aborted) disconnect();
  const sample = async () => {
    if (closed) throw new Error('Publisher stopped.');
    const [outgoing, incoming] = await Promise.all([sender.getStats(), receiver.getStats()]);
    let framesEncoded = 0, framesDecoded = 0;
    outgoing.forEach(stat => { if (stat.type === 'outbound-rtp' && (stat.kind === 'video' || stat.mediaType === 'video')) framesEncoded += stat.framesEncoded || 0; });
    incoming.forEach(stat => { if (stat.type === 'inbound-rtp' && (stat.kind === 'video' || stat.mediaType === 'video')) framesDecoded += stat.framesDecoded || 0; });
    return { id, framesEncoded, framesDecoded };
  };
  try {
    if (closed) throw Object.assign(new Error('Broadcast cancelled.'), { name: 'AbortError' });
    const track = getStream()?.getVideoTracks()[0]; if (!track) throw new Error('Enable the camera first.');
    const videoSender = sender.addTrack(track);
    await sender.setLocalDescription(await sender.createOffer());
    await receiver.setRemoteDescription(await gatherDescription(sender));
    await receiver.setLocalDescription(await receiver.createAnswer());
    await sender.setRemoteDescription(await gatherDescription(receiver));
    const until = Date.now() + 10000;
    while (!closed && Date.now() < until) {
      const health = await sample();
      if (health.framesEncoded > 1 && health.framesDecoded > 1) return { sample, disconnect, replaceTrack: track => videoSender.replaceTrack(track) };
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('The compatible camera check could not complete. Keep this tab open and try Start live again. If it repeats, try Safari or Chrome on another network.');
  } catch (error) { disconnect(); throw error; }
}
