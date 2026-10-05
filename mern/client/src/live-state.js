import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { useLocation } from 'react-router-dom';
import { LIVE_POLL_MS } from '../../shared/live-policy.js';

export const liveTime = date => date ? new Date(date).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) : 'Connecting';
export function liveDuration(date, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (!date || !Number.isFinite(seconds)) return '00:00:00';
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export function useLiveClock(offset = 0) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now + offset;
}
const initial = { sessions: [], announcements: [], loading: true, availability: 'loading', error: '', offset: 0 };
const LiveContext = createContext(initial);
export const refreshLive = () => window.dispatchEvent(new Event('bravo-live-changed'));
export function LiveStatusProvider({ children }) {
  const { user, authReady } = useBravo(), { pathname } = useLocation();
  const relevant = pathname === '/' || pathname.startsWith('/live') || pathname === '/admin';
  const identity = `${user?.id || 'public'}:${user?.role || ''}`;
  const [data, setData] = useState(initial), now = useLiveClock(data.offset);
  useEffect(() => {
    if (!authReady || !relevant) return;
    let active = true, busy = false;
    const load = async () => {
      if (!active || busy || document.hidden) return;
      busy = true; const sent = Date.now();
      try {
        const result = await api('/live', { timeoutMs: 4000 });
        if (!Array.isArray(result.sessions) || !Array.isArray(result.announcements)) throw new Error('Invalid live status');
        if (active) setData({ ...result, identity, loading: false, error: '', offset: new Date(result.serverTime).getTime() - (sent + Date.now()) / 2 });
      } catch {
        if (active) setData(old => ({ ...old, identity, loading: false, availability: 'unavailable', error: 'Live status is temporarily unavailable. Reconnecting…' }));
      } finally { busy = false; }
    };
    setData(initial); void load();
    const timer = setInterval(load, LIVE_POLL_MS);
    window.addEventListener('bravo-live-changed', load); window.addEventListener('online', load); document.addEventListener('visibilitychange', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('bravo-live-changed', load); window.removeEventListener('online', load); document.removeEventListener('visibilitychange', load); };
  }, [identity, authReady, relevant]);
  const snapshot = data.identity === identity ? data : initial;
  const state = item => snapshot.availability !== 'available' ? 'unavailable' : item.status === 'live' && (!item.liveUntil || new Date(item.liveUntil).getTime() <= now) ? 'reconnecting' : item.status;
  const value = { ...snapshot, sessions: snapshot.sessions.map(item => ({ ...item, status: state(item) })),
    announcements: snapshot.announcements.map(item => ({ ...item, status: state(item) })) };
  return createElement(LiveContext.Provider, { value }, children);
}
export function useLiveSessions() { return useContext(LiveContext); }
