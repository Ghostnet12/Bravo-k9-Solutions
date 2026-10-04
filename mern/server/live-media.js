// Direct WebRTC uses the existing authenticated API only for signaling.
// There is deliberately no TURN relay, media host, account key or paid service.
export const LIVE_PEER_LEASE_MS = 45000;
export const LIVE_ICE_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }];
export function liveConfigured() { return process.env.BRAVO_LIVE_ENABLED !== 'false'; }
export function validateDescription(description, type) {
  if (!description || description.type !== type || typeof description.sdp !== 'string' || description.sdp.length > 40000 || !description.sdp.startsWith('v=0') || description.sdp.includes('\0')) return false;
  const sections = description.sdp.split(/(?:\r?\n)m=/).slice(1);
  // Receive-only offers: viewers never ask for camera/microphone access, publish,
  // or open data channels. The browser performs full SDP validation as well.
  if (!sections.length || sections.length > 2 || !sections.some(s => s.startsWith('video '))) return false;
  const kinds = sections.map(s => s.split(' ')[0]);
  if (new Set(kinds).size !== kinds.length || kinds.some(kind => !['video', 'audio'].includes(kind))) return false;
  return sections.every(section => {
    const directions = [...section.matchAll(/(?:^|\r?\n)a=(sendrecv|sendonly|recvonly|inactive)(?=\r?\n|$)/g)].map(match => match[1]);
    return directions.length === 1 && (type === 'offer' ? directions[0] === 'recvonly' : ['sendonly', 'inactive'].includes(directions[0]));
  });
}
