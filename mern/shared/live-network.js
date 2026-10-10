// Public STUN discovers addresses; neither service relays media or incurs a
// Bravo hosting charge. A second provider avoids a single STUN failure.
export const LIVE_ICE_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];
