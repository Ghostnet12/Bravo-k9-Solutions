import { framingStyle } from '../../shared/site-images.js';

export function applyFraming(element, settings) { Object.assign(element.style, framingStyle(settings)); }
const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
// Zoomed pixels must not crop the native play/seek/caption controls. Keep a small
// accessible control strip outside the transformed video; never autoplay media.
export function videoControls(video, after = video) {
  const abort = new AbortController(), originalControls = video.controls;
  let captions = [...video.textTracks].some(t => t.mode === 'showing');
  const modes = new Map(), root = document.createElement('div');
  root.className = 'site-video-controls'; root.dataset.siteImageIgnore = '';
  root.innerHTML = '<div class="site-video-cue" aria-live="off"></div><div class="site-video-buttons"><button type="button" data-v="play">Play</button><input type="range" data-v="seek" min="0" max="1000" step="1" value="0" aria-label="Video position"><output data-v="time">0:00</output><button type="button" data-v="mute">Mute</button><button type="button" data-v="cc" aria-label="Toggle captions">CC</button><button type="button" data-v="full" title="View original video fullscreen">Full screen</button></div>';
  after.insertAdjacentElement('afterend', root); video.controls = false;
  const fields = Object.fromEntries([...root.querySelectorAll('[data-v]')].map(e => [e.dataset.v, e]));
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });
  function cue() { root.querySelector('.site-video-cue').textContent = captions ? [...video.textTracks].flatMap(t => [...(t.activeCues || [])].map(c => c.text)).join('\n') : ''; }
  function bindTracks() {
    for (const track of video.textTracks) {
      if (!modes.has(track)) { modes.set(track, track.mode); on(track, 'cuechange', cue); }
      track.mode = captions ? 'hidden' : 'disabled';
    }
    fields.cc.hidden = !video.textTracks.length; fields.cc.setAttribute('aria-pressed', String(captions)); cue();
  }
  function update() {
    fields.play.textContent = video.paused ? 'Play' : 'Pause';
    fields.mute.textContent = video.muted ? 'Unmute' : 'Mute';
    fields.seek.disabled = !Number.isFinite(video.duration) || !video.duration;
    fields.seek.value = fields.seek.disabled ? 0 : Math.round(video.currentTime / video.duration * 1000);
    fields.seek.setAttribute('aria-valuetext', `${clock(video.currentTime)} of ${clock(video.duration)}`);
    fields.time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
  }
  on(fields.play, 'click', () => { if (video.paused) video.play().catch(() => { fields.play.textContent = 'Retry play'; }); else video.pause(); });
  on(fields.mute, 'click', () => { video.muted = !video.muted; });
  on(fields.seek, 'input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(fields.seek.value) / 1000 * video.duration; });
  on(fields.cc, 'click', () => { captions = !captions; bindTracks(); });
  on(fields.full, 'click', () => {
    video.controls = true;
    if (video.requestFullscreen) video.requestFullscreen().catch(() => { video.controls = false; });
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else video.controls = false;
  });
  on(document, 'fullscreenchange', () => { video.controls = document.fullscreenElement === video; });
  on(video, 'webkitendfullscreen', () => { video.controls = false; });
  for (const type of ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'loadedmetadata', 'emptied']) on(video, type, update);
  on(video.textTracks, 'addtrack', bindTracks); bindTracks(); update();
  return () => { abort.abort(); root.remove(); video.controls = originalControls; for (const [track, mode] of modes) track.mode = mode; };
}
