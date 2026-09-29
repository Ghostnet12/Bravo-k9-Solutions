import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_SOUNDTRACK_PARTS, SITE_SOUNDTRACK_TITLE, SITE_SOUNDTRACK_VOLUME } from '../../shared/site-soundtrack.js';

const storageKey = 'bravo-accessibility-preferences';
let soundtrackUrlPromise;

function musicEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return saved.siteMusic !== false;
  } catch {
    return true;
  }
}

function decodeBase64(value) {
  const binary = atob(value.trim()), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function soundtrackUrl() {
  soundtrackUrlPromise ||= Promise.all(SITE_SOUNDTRACK_PARTS.map(async path => {
    const response = await fetch(path, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Soundtrack unavailable.');
    return decodeBase64(await response.text());
  })).then(parts => URL.createObjectURL(new Blob(parts, { type: 'audio/mp4' })));
  return soundtrackUrlPromise;
}

export default function SiteSoundtrack() {
  const audio = useRef(null), enabled = useRef(true), source = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    let disposed = false;
    enabled.current = musicEnabled();
    element.volume = SITE_SOUNDTRACK_VOLUME;

    const shouldPlay = () => pathname === '/' && enabled.current && !document.hidden;
    const attempt = async () => {
      if (!shouldPlay()) { element.pause(); return; }
      try {
        source.current ||= await soundtrackUrl();
        if (disposed) return;
        if (element.src !== source.current) {
          element.src = source.current;
          element.load();
        }
        await element.play();
      } catch {
        // Audible autoplay is intentionally retried on the first real gesture.
        // Safari/iOS and some Chrome settings do not permit bypassing this rule.
      }
    };
    const gesture = () => attempt();
    const visibility = () => attempt();
    const preference = event => {
      enabled.current = event.detail?.enabled !== false;
      if (enabled.current) attempt();
      else element.pause();
    };

    attempt();
    document.addEventListener('pointerdown', gesture, true);
    document.addEventListener('keydown', gesture, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('bravo-site-music', preference);
    return () => {
      disposed = true;
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('bravo-site-music', preference);
    };
  }, [pathname]);

  return <audio ref={audio} autoPlay loop preload="auto" aria-label={SITE_SOUNDTRACK_TITLE} data-site-soundtrack="" />;
}
