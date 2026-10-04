import { useEffect, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';

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
export function useLiveSessions() {
  const { user, authReady } = useBravo();
  const [data, setData] = useState({ sessions: [], loading: true, error: '', offset: 0 });
  useEffect(() => {
    if (!authReady) return;
    let active = true, timer;
    const load = async () => {
      try {
        const result = await api('/live');
        if (active) setData({ sessions: Array.isArray(result.sessions) ? result.sessions : [], loading: false, error: '', offset: result.serverTime ? new Date(result.serverTime).getTime() - Date.now() : 0 });
      } catch {
        if (active) setData(old => ({ ...old, sessions: [], loading: false, error: 'Live sessions could not refresh. Check your connection and try again.' }));
      } finally { if (active) timer = setTimeout(load, 15000); }
    };
    setData({ sessions: [], loading: true, error: '', offset: 0 }); load();
    return () => { active = false; clearTimeout(timer); };
  }, [user?.id, authReady]);
  return data;
}
