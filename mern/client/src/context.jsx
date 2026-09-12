import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
const Context = createContext(null);
const noMembership = { active: false, manual: false, onlineAccess: false };
export function AppProvider({ children }) {
  const [config, setConfig] = useState(null), [user, setUser] = useState(null), [services, setServices] = useState([]), [authReady, setAuthReady] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const refreshNotifications = useCallback(async () => { if (!user) return; const result = await api('/notifications'); setNotifications(result.items || []); }, [user?.id]);
  useEffect(() => { setNotifications([]); if (!user) return; let current = true; const load = () => { if (!document.hidden) api('/notifications').then(data => { if (current) setNotifications(data.items || []); }).catch(() => {}); }; load(); const timer = setInterval(load, 15000); return () => { current = false; clearInterval(timer); }; }, [user?.id]);
  const [membership, setMembership] = useState(noMembership);
  const [bookingDraft, setBookingDraft] = useState(null);
  const previousUserId = useRef(null);
  const refreshUser = useCallback(async () => {
    try {
      const data = await api('/auth/me');
      if (previousUserId.current && previousUserId.current !== data.user?.id) setBookingDraft(null);
      previousUserId.current = data.user?.id || null;
      setUser(data.user); setServices(data.services || []); setMembership(data.user ? data.membership || noMembership : noMembership);
    } finally { setAuthReady(true); }
  }, []);
  const refreshConfig = useCallback(() => api('/config').then(setConfig), []);
  useEffect(() => { refreshConfig().catch(() => setConfig({ connected: false, paymentsReady: false })); refreshUser().catch(() => {}); }, [refreshUser, refreshConfig]);
  return <Context.Provider value={{ notifications, refreshNotifications, config, user, services, membership, setUser, authReady, refreshUser, refreshConfig, bookingDraft, setBookingDraft }}>{children}</Context.Provider>;
}
export const useBravo = () => useContext(Context);
