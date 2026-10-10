export function livePlayerStatus(sessionStatus, playerState) {
  if (sessionStatus === 'unavailable') return 'Status unavailable';
  if (sessionStatus === 'ended') return 'Session ended';
  if (sessionStatus !== 'live' || playerState === 'reconnecting') return 'Reconnecting';
  return ({ idle: 'Ready to watch', watching: 'Connected', ended: 'Connection interrupted', blocked: 'Tap to play' })[playerState] || 'Connecting';
}
