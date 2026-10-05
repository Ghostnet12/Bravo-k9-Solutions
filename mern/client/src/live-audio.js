let owner = null;
export function claimLiveAudio(element) {
  if (!element) return;
  owner = element;
  document.querySelectorAll('audio,video').forEach(other => {
    if (other !== element && !other.muted && other.volume > 0) other.pause();
  });
  window.dispatchEvent(new CustomEvent('bravo-audio-focus', { detail: { active: true } }));
}
export function releaseLiveAudio(element) {
  if (!element || owner !== element) return;
  owner = null;
  window.dispatchEvent(new CustomEvent('bravo-audio-focus', { detail: { active: false } }));
}
