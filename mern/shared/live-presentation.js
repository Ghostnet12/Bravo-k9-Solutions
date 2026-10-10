export function livePlayerStatus(sessionStatus, playerState) {
  if (sessionStatus === 'unavailable') return 'Status unavailable';
  if (sessionStatus === 'ended') return 'Session ended';
  if (sessionStatus !== 'live' || playerState === 'reconnecting') return 'Reconnecting';
  return ({ idle: 'Ready to watch', watching: 'Connected', ended: 'Connection interrupted', blocked: 'Tap to play' })[playerState] || 'Connecting';
}
// Transport connectivity is not proof that the video is playing. Only the
// media element's playing event can promote a paused player to watching.
export function liveConnectionState(current, incoming) {
  if (incoming === 'watching') return ['watching', 'blocked'].includes(current) ? current : 'waiting';
  return incoming;
}
