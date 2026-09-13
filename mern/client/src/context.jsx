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
    if (!user) return;
    const result = await api('/notifications');
    if (notificationUser.current === user.id) setNotifications((result.items || []).filter(item => item.unread && !readNotifications.current.has(item.id)));
  }, [user?.id]);
  const markNotificationsRead = useCallback(async ids => {
    if (!user) return;
    const pending = [...new Set(ids)].filter(id => !readNotifications.current.has(id));
    if (!pending.length) return;
    await api('/notifications/read', { method: 'POST', body: { ids: pending } });
    if (notificationUser.current !== user.id) return;
    pending.forEach(id => readNotifications.current.add(id));
    setNotifications(items => items.filter(item => !readNotifications.current.has(item.id)));
  }, [user?.id]);
  useEffect(() => {
    readNotifications.current = new Set(); setNotifications([]);
    if (!user) return;
    let current = true;
    const load = () => { if (current && !document.hidden) refreshNotifications().catch(() => {}); };
    load(); const timer = setInterval(load, 15000);
    return () => { current = false; clearInterval(timer); };
  }, [user?.id, refreshNotifications]);
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
  return <Context.Provider value={{ notifications, refreshNotifications, markNotificationsRead, config, user, services, membership, setUser, authReady, refreshUser, refreshConfig, bookingDraft, setBookingDraft }}>{children}</Context.Provider>;
}
export const useBravo = () => useContext(Context);
