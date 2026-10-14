import { useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { DEFAULT_MUSIC, playableTracks } from '../../shared/music-playlist.js';
import { api } from './api';
const storageKey = 'bravo-accessibility-preferences', positionKey = 'bravo-site-soundtrack-position', preferenceKey = 'bravo-music-preferences';
function read(key, store = localStorage) { try { return JSON.parse(store.getItem(key) || '{}'); } catch { return {}; } }
function write(key, value, store = localStorage) { try { store.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ } }
export default function SiteSoundtrack() {
  const audio = useRef(null), enabled = useRef(true), liveRoute = useRef(false);
  const { pathname } = useLocation();
  liveRoute.current = pathname === '/live' || pathname.startsWith('/live/');
  useEffect(() => { window.dispatchEvent(new Event('bravo-live-audio-focus')); }, [pathname]);
  useEffect(() => {
    const element = audio.current;
    let playlist = DEFAULT_MUSIC, tracks = playableTracks(playlist), index = 0, active = true, focus = false, ready = false;
    const failed = new Set(), media = new Set(), preferences = read(preferenceKey), remembered = read(positionKey, sessionStorage);
    enabled.current = read(storageKey).siteMusic !== false && preferences.paused !== true;
    element.volume = Number.isFinite(preferences.volume) ? Math.max(0, Math.min(1, preferences.volume)) : .72;
    element.muted = preferences.muted === true;
    const status = () => window.dispatchEvent(new CustomEvent('bravo-music-status', { detail: { playing: !element.paused, muted: element.muted, volume: element.volume, title: tracks[index]?.title || '', available: tracks.length > failed.size } }));
    const persist = () => write(preferenceKey, { paused: !enabled.current, volume: element.volume, muted: element.muted });
    const remember = () => write(positionKey, { id: tracks[index]?.id, time: element.currentTime }, sessionStorage);
    const shouldPlay = () => enabled.current && !document.hidden && ready && !liveRoute.current && !focus && !media.size && tracks.length > failed.size;
    const attempt = () => {
      if (!active) return;
      if (!shouldPlay()) { element.pause(); status(); return; }
      if (element.getAttribute('src') !== tracks[index].src) { element.src = tracks[index].src; element.load(); }
      element.play().then(status).catch(status);
    };
    const next = () => {
      if (tracks.length <= failed.size) { element.pause(); status(); return; }
      do { index = (index + 1) % tracks.length; } while (failed.has(tracks[index].id));
      element.removeAttribute('src'); attempt(); status();
    };
    const error = () => { if (tracks[index]) failed.add(tracks[index].id); next(); };
    const restore = () => { if (remembered.id === tracks[index]?.id && Number.isFinite(remembered.time) && remembered.time > 0 && element.duration > remembered.time) { element.currentTime = remembered.time; remembered.time = 0; } };
    const publish = data => {
      const currentId = ready ? tracks[index]?.id : null;
      ready = true; playlist = data; tracks = playableTracks(data); failed.clear();
      const found = tracks.findIndex(t => t.id === currentId); index = found >= 0 ? found : 0;
      if (!tracks.length) { element.pause(); element.removeAttribute('src'); element.load(); }
      attempt(); status();
    };
    const refresh = () => { if (!document.hidden) api('/site-music').then(data => { if (active && (!ready || data.revision > playlist.revision)) publish(data); }).catch(() => {}); };
    const published = event => publish(event.detail);
    const preference = event => { enabled.current = event.detail?.enabled !== false; persist(); attempt(); };
    const command = event => {
      const { action, value } = event.detail;
      if (action === 'toggle') { enabled.current = element.paused; write(storageKey, { ...read(storageKey), siteMusic: enabled.current }); window.dispatchEvent(new CustomEvent('bravo-music-preference', { detail: { enabled: enabled.current } })); }
      if (action === 'mute') element.muted = !element.muted;
      if (action === 'volume') element.volume = Math.max(0, Math.min(1, value));
      if (action === 'next') next();
      if (action !== 'status') { persist(); attempt(); } status();
    };
    const audioFocus = event => { focus = event.detail?.active === true; attempt(); };
    const mediaChange = event => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement) || target === element) return;
      if (!target.paused && !target.ended && !target.muted && target.volume > 0) media.add(target); else media.delete(target);
      attempt();
    };
    const visibility = () => { for (const item of media) if (!item.isConnected || item.paused) media.delete(item); attempt(); refresh(); };
    const loaded = () => { refresh(); attempt(); };
    const windowEvents = { load: loaded, 'bravo-music-command': command, 'bravo-music-published': published, 'bravo-site-music': preference, 'bravo-audio-focus': audioFocus, 'bravo-live-audio-focus': visibility, pagehide: remember };
    const audioEvents = { ended: next, error, loadedmetadata: restore, play: status, pause: status };
    for (const [name, handler] of Object.entries(windowEvents)) window.addEventListener(name, handler);
    for (const [name, handler] of Object.entries(audioEvents)) element.addEventListener(name, handler);
    document.addEventListener('visibilitychange', visibility);
    for (const name of ['play', 'pause', 'ended', 'volumechange']) document.addEventListener(name, mediaChange, true);
    if (document.readyState === 'complete') loaded();
    const timer = setInterval(refresh, 60000); status();
    return () => {
      active = false; remember(); element.pause(); clearInterval(timer);
      for (const [name, handler] of Object.entries(windowEvents)) window.removeEventListener(name, handler);
      for (const [name, handler] of Object.entries(audioEvents)) element.removeEventListener(name, handler);
      document.removeEventListener('visibilitychange', visibility);
      for (const name of ['play', 'pause', 'ended', 'volumechange']) document.removeEventListener(name, mediaChange, true);
    };
  }, []);
  return <audio ref={audio} preload="none" aria-label="Bravo music playlist" data-site-soundtrack=""/>;
}
