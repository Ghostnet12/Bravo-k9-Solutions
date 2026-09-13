import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
const Context = createContext(null);
const noMembership = { active: false, manual: false, onlineAccess: false };
export function AppProvider({ children }) {
  const [config, setConfig] = useState(null), [user, setUser] = useState(null), [services, setServices] = useState([]), [authReady, setAuthReady] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const readNotifications = useRef(new Set()), notificationUser = useRef(user?.id);
  notificationUser.current = user?.id;
  const refreshNotifications = useCallback(async () => {
    if (!user || user.mustChangePassword) return;
    const result = await api('/notifications');
    if (notificationUser.current === user.id) setNotifications((result.items || []).filter(item => item.unread && !readNotifications.current.has(item.id)));
  }, [user?.id, user?.mustChangePassword]);
  const markNotificationsRead = useCallback(async ids => {
    if (!user || user.mustChangePassword) return;
    const pending = [...new Set(ids)].filter(id => !readNotifications.current.has(id));
    if (!pending.length) return;
    await api('/notifications/read', { method: 'POST', body: { ids: pending } });
    if (notificationUser.current !== user.id) return;
    pending.forEach(id => readNotifications.current.add(id));
    setNotifications(items => items.filter(item => !readNotifications.current.has(item.id)));
  }, [user?.id, user?.mustChangePassword]);
  useEffect(() => {
    readNotifications.current = new Set(); setNotifications([]);
    if (!user || user.mustChangePassword) return;
    let current = true;
    const load = () => { if (current && !document.hidden) refreshNotifications().catch(() => {}); };
    load(); const timer = setInterval(load, 15000);
    return () => { current = false; clearInterval(timer); };
  }, [user?.id, user?.mustChangePassword, refreshNotifications]);
  const [membership, setMembership] = useState(noMembership);
  const [bookingDraft, setBookingDraft] = useState(null);
  const previousUserId = useRef(null), authGeneration = useRef(0);
  const refreshUser = useCallback(async () => {
    const generation = authGeneration.current;
    try {
      const data = await api('/auth/me');
      if (generation !== authGeneration.current) return;
      if (previousUserId.current && previousUserId.current !== data.user?.id) setBookingDraft(null);
      previousUserId.current = data.user?.id || null;
      setUser(data.user); setServices(data.services || []); setMembership(data.user ? data.membership || noMembership : noMembership);
    } finally { setAuthReady(true); }
  }, []);
  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    authGeneration.current += 1;
    notificationUser.current = null; previousUserId.current = null;
    readNotifications.current = new Set();
    setUser(null); setServices([]); setMembership(noMembership); setNotifications([]); setBookingDraft(null);
  }, []);
  const refreshConfig = useCallback(() => api('/config').then(setConfig), []);
  useEffect(() => { refreshConfig().catch(() => setConfig({ connected: false, paymentsReady: false })); refreshUser().catch(() => {}); }, [refreshUser, refreshConfig]);
  return <Context.Provider value={{ signOut, notifications, refreshNotifications, markNotificationsRead, config, user, services, membership, setUser, authReady, refreshUser, refreshConfig, bookingDraft, setBookingDraft }}>{children}</Context.Provider>;
}
export const useBravo = () => useContext(Context);
