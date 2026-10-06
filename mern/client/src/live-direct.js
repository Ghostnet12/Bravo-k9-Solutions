import { api } from './api';
import { LIVE_ICE_SERVERS } from '../../shared/live-network.js';

export const DIRECT_ICE = LIVE_ICE_SERVERS;
export const DIRECT_FAILURE = 'This network could not connect the phone and viewer directly. Cellular data is allowed, but some carriers, VPNs and firewalls require a video relay. Bravo currently has no relay configured. Try another network.';
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
      for (let attempt = 0; attempt < 3; attempt++) {
        if (closed || pc.signalingState === 'closed') throw new Error('Connection cancelled.');
        try {
          await api(`/live/${sessionId}/peers/${item.id}/answer`, { method: 'POST', body: { answer: description }, timeoutMs: 8000 });
          break;
        } catch (error) {
          if (attempt === 2 || [400, 401, 403, 404, 410].includes(error.status)) throw error;
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      // Let WebRTC estimate available bandwidth and adapt each connection.
      // No application bitrate ceiling or minimum connection speed is imposed.
    } catch {
      clearTimeout(peer.timeout); pc.close(); count();
      // Release a failed slot; retain the local tombstone until the next sync so
      // a stale heartbeat cannot recreate a connection with an obsolete answer.
      if (!closed) await api(`/live/${sessionId}/peers/${item.id}/reject`, { method: 'POST', body: {}, timeoutMs: 5000 }).catch(() => {});
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
      if (result.status === 'reconnecting') onState('reconnecting');
      else if (pc.connectionState === 'connected') onState('watching');
      if (result.answer && !pc.currentRemoteDescription) await pc.setRemoteDescription(result.answer);
    } catch (error) {
      if ([401, 403, 404, 409, 410, 503].includes(error.status) || Date.now() - lastVerified > 30000) { fail(error.message); return; }
    }
    if (!closed) timer = setTimeout(poll, pc.connectionState === 'connected' ? 4000 : 1000);
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

// Browser-local WebRTC loopback verifies advancing encoded AND decoded camera
// frames before discovery. This is media-pipeline health, not proof of cellular
// reachability. Actual viewers still negotiate their own direct connections.
export async function createPublisherHealth(getStream) {
  const sender = new RTCPeerConnection({ iceServers: [] }), receiver = new RTCPeerConnection({ iceServers: [] });
  const id = crypto.randomUUID(); let closed = false;
  const sink = document.createElement('video'); sink.muted = true; sink.autoplay = true; sink.playsInline = true;
  sink.setAttribute('aria-hidden', 'true'); sink.setAttribute('data-publisher-health', '');
  sink.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'; document.body.append(sink);
  receiver.ontrack = event => { sink.srcObject = new MediaStream([event.track]); sink.play().catch(() => {}); };
  const disconnect = () => { closed = true; sender.close(); receiver.close(); sink.srcObject = null; sink.remove(); };
  const sample = async () => {
    if (closed) throw new Error('Publisher stopped.');
    const [outgoing, incoming] = await Promise.all([sender.getStats(), receiver.getStats()]);
    let framesEncoded = 0, framesDecoded = 0;
    outgoing.forEach(stat => { if (stat.type === 'outbound-rtp' && (stat.kind === 'video' || stat.mediaType === 'video')) framesEncoded += stat.framesEncoded || 0; });
    incoming.forEach(stat => { if (stat.type === 'inbound-rtp' && (stat.kind === 'video' || stat.mediaType === 'video')) framesDecoded += stat.framesDecoded || 0; });
    return { id, framesEncoded, framesDecoded };
  };
  try {
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
    throw new Error('The camera is not publishing video frames. End the session and try again.');
  } catch (error) { disconnect(); throw error; }
}
