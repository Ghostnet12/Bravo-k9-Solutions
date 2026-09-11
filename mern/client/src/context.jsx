import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
const Context = createContext(null);
const noMembership = { active: false, manual: false, onlineAccess: false };
export function AppProvider({ children }) {
  const [config, setConfig] = useState(null), [user, setUser] = useState(null), [services, setServices] = useState([]), [authReady, setAuthReady] = useState(false);
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
  return <Context.Provider value={{ config, user, services, membership, setUser, authReady, refreshUser, refreshConfig, bookingDraft, setBookingDraft }}>{children}</Context.Provider>;
}
export const useBravo = () => useContext(Context);
