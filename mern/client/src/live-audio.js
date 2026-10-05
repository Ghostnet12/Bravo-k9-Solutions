export function claimLiveAudio(element) {
  document.querySelectorAll('audio,video').forEach(other => {
    if (other !== element && !other.muted && other.volume > 0) other.pause();
  });
  window.dispatchEvent(new CustomEvent('bravo-audio-focus', { detail: { active: true } }));
}
export const releaseLiveAudio = () => window.dispatchEvent(new CustomEvent('bravo-audio-focus', { detail: { active: false } }));
