import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
const Context = createContext(null);
export function AppProvider({ children }) {
  const [config, setConfig] = useState(null), [user, setUser] = useState(null), [services, setServices] = useState([]), [authReady, setAuthReady] = useState(false);
  const [bookingDraft, setBookingDraft] = useState(null);
  const refreshUser = useCallback(async () => {
    try { const data = await api('/auth/me'); setUser(data.user); setServices(data.services); }
    finally { setAuthReady(true); }
  }, []);
  const refreshConfig = useCallback(() => api('/config').then(setConfig), []);
  useEffect(() => { refreshConfig().catch(() => setConfig({ connected: false, paymentsReady: false })); refreshUser().catch(() => {}); }, [refreshUser, refreshConfig]);
  return <Context.Provider value={{ config, user, services, setUser, authReady, refreshUser, refreshConfig, bookingDraft, setBookingDraft }}>{children}</Context.Provider>;
}
export const useBravo = () => useContext(Context);
