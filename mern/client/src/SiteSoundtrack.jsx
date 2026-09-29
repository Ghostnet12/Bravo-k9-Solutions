import { useEffect, useRef } from 'react';
import { SITE_SOUNDTRACK_SRC, SITE_SOUNDTRACK_TITLE, SITE_SOUNDTRACK_VOLUME } from '../../shared/site-soundtrack.js';

const storageKey = 'bravo-accessibility-preferences';
const positionKey = 'bravo-site-soundtrack-position';

function musicEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return saved.siteMusic !== false;
  } catch {
    return true;
  }
}

function rememberedPosition() {
  try {
    const value = Number(sessionStorage.getItem(positionKey));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export default function SiteSoundtrack() {
  const audio = useRef(null), enabled = useRef(true);
  const publicHost = location.hostname === 'bravounleashed.com' || location.hostname === 'www.bravounleashed.com' || location.hostname.endsWith('.vercel.app');

  useEffect(() => {
    if (!publicHost) return;
    const element = audio.current;
    if (!element) return;
    enabled.current = musicEnabled();
    element.volume = SITE_SOUNDTRACK_VOLUME;

    const remember = () => {
      try {
        if (Number.isFinite(element.currentTime) && element.currentTime >= 0) sessionStorage.setItem(positionKey, String(element.currentTime));
      } catch {
        // Playback still works when session storage is unavailable.
      }
    };
    const restore = () => {
      const position = rememberedPosition();
      if (position <= 0) return;
      if (Number.isFinite(element.duration) && element.duration > 0) element.currentTime = position % element.duration;
      else element.currentTime = position;
    };
    const shouldPlay = () => enabled.current && !document.hidden;
    const attempt = () => {
      if (!shouldPlay()) { element.pause(); return; }
      if (!element.getAttribute('src')) {
        element.src = SITE_SOUNDTRACK_SRC;
        element.load();
        element.addEventListener('loadedmetadata', restore, { once: true });
      }
      element.play().catch(() => {
        // iPhone/Safari and some Chrome settings block audible autoplay until
        // the visitor makes a real gesture. Retrying below is the browser-safe
        // path; the soundtrack still applies to every route.
      });
    };
    const gesture = () => attempt();
    const visibility = () => attempt();
    const preference = event => {
      enabled.current = event.detail?.enabled !== false;
      if (enabled.current) attempt();
      else element.pause();
    };

    let startTimer = 0;
    const loaded = () => { startTimer = window.setTimeout(attempt, 0); };
    if (document.readyState === 'complete') loaded();
    else window.addEventListener('load', loaded, { once: true });

    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', remember);
    window.addEventListener('beforeunload', remember);
    window.addEventListener('bravo-site-music', preference);
    return () => {
      remember();
      window.removeEventListener('load', loaded);
      window.clearTimeout(startTimer);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', remember);
      window.removeEventListener('beforeunload', remember);
      window.removeEventListener('bravo-site-music', preference);
    };
  }, [publicHost]);

  return <audio ref={audio} loop preload="none" aria-label={SITE_SOUNDTRACK_TITLE} data-site-soundtrack="" />;
}
