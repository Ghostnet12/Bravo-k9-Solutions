import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_SOUNDTRACK_SRC, SITE_SOUNDTRACK_TITLE, SITE_SOUNDTRACK_VOLUME } from '../../shared/site-soundtrack.js';

const storageKey = 'bravo-accessibility-preferences';

function musicEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return saved.siteMusic !== false;
  } catch {
    return true;
  }
}

export default function SiteSoundtrack() {
  const audio = useRef(null), enabled = useRef(true);
  const { pathname } = useLocation();

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    enabled.current = musicEnabled();
    element.volume = SITE_SOUNDTRACK_VOLUME;

    const shouldPlay = () => pathname === '/' && enabled.current && !document.hidden;
    const attempt = () => {
      if (!shouldPlay()) { element.pause(); return; }
      if (!element.getAttribute('src')) {
        element.src = SITE_SOUNDTRACK_SRC;
        element.load();
      }
      element.play().catch(() => {
        // iPhone/Safari and some Chrome settings block audible autoplay until
        // the visitor makes a real gesture. Retrying below is the browser-safe
        // path; the website never shows another playback control over the hero.
      });
    };
    const gesture = () => attempt();
    const visibility = () => attempt();
    const preference = event => {
      enabled.current = event.detail?.enabled !== false;
      if (enabled.current) attempt();
      else element.pause();
    };

    const loaded = () => attempt();
    if (document.readyState === 'complete') attempt();
    else window.addEventListener('load', loaded, { once: true });
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('bravo-site-music', preference);
    return () => {
      window.removeEventListener('load', loaded);
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('bravo-site-music', preference);
    };
  }, [pathname]);

  return <audio ref={audio} loop preload="none" aria-label={SITE_SOUNDTRACK_TITLE} data-site-soundtrack="" />;
}
