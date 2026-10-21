import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
import { hasAccountBookingDraft, readBookingDraft, readBookingHandoff, writeBookingDraft } from './booking-draft';
import { publicCatalogSnapshot } from '../../shared/catalog';
const Context = createContext(null);
const noMembership = { active: false, manual: false, onlineAccess: false };
function initialCatalog() {
  try {
    const services = publicCatalogSnapshot(typeof document === 'undefined' ? null : JSON.parse(document.querySelector('meta[name="bravo-catalog"]')?.content || 'null'));
    if (!services) return null;
    const online = services.find(service => service.id === 'online');
    return { services, lessonLibrary: { open: online.enabled, lessonCents: online.cents, bundleCents: online.bundleCents } };
  } catch { return null; }
}
export function AppProvider({ children }) {
  const [config, setConfig] = useState(initialCatalog), [user, setUser] = useState(null), [services, setServices] = useState([]), [authReady, setAuthReady] = useState(false);
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
  const draftState = useRef({ owner: null, revision: 0, draft: null, pendingDraft: null, authHandoff: false, locked: false });
  const [draftSnapshot, setDraftSnapshot] = useState(draftState.current);
  const { owner: draftOwner, revision: draftRevision, draft: bookingDraft } = draftSnapshot;
  const setBookingDraft = useCallback(value => {
    const current = draftState.current;
    // A previous account/component cannot write into the newly resolved scope.
    if (!draftOwner || current.owner !== draftOwner || current.revision !== draftRevision || current.pendingDraft || current.locked) return;
    const draft = writeBookingDraft(draftOwner, value, { handoff: current.authHandoff });
    draftState.current = { ...current, draft };
    setDraftSnapshot(draftState.current);
  }, [draftOwner, draftRevision]);
  const beginBookingHandoff = useCallback(() => {
    const current = draftState.current;
    if (current.owner !== 'guest' || current.owner !== draftOwner || current.revision !== draftRevision || !current.draft) return;
    writeBookingDraft('guest', current.draft, { handoff: true });
    draftState.current = { ...current, authHandoff: true }; setDraftSnapshot(draftState.current);
  }, [draftOwner, draftRevision]);
  const resumeBookingHandoff = useCallback(() => {
    const current = draftState.current;
    if (!current.owner?.startsWith('user:') || current.owner !== draftOwner || current.revision !== draftRevision || !current.pendingDraft) return false;
    const draft = writeBookingDraft(current.owner, current.pendingDraft);
    draftState.current = { ...current, draft, pendingDraft: null, authHandoff: false, revision: current.revision + 1 };
    setDraftSnapshot(draftState.current); return true;
  }, [draftOwner, draftRevision]);
  const discardBookingDraft = useCallback(() => {
    writeBookingDraft(null, null);
    draftState.current = { ...draftState.current, draft: null, pendingDraft: null, authHandoff: false, locked: false, revision: draftState.current.revision + 1 };
    setDraftSnapshot(draftState.current);
  }, []);
  const authGeneration = useRef(0);
  const refreshUser = useCallback(async ({ claimBookingDraft = false } = {}) => {
    const generation = authGeneration.current;
    try {
      const data = await api('/auth/me');
      if (generation !== authGeneration.current) return;
      const owner = data.user?.id ? `user:${data.user.id}` : 'guest';
      if (draftState.current.owner !== owner) {
        const current = draftState.current;
        const locked = owner === 'guest' && hasAccountBookingDraft();
        const claimGuest = claimBookingDraft && current.owner === 'guest' && !!data.user;
        const storedHandoff = readBookingHandoff(owner);
        const pendingDraft = !claimGuest && data.user ? storedHandoff : null;
        const authHandoff = !data.user && !!storedHandoff;
        const draft = pendingDraft || locked ? null : readBookingDraft(owner, { claimGuest }) || (claimGuest ? current.draft : null);
        // Bind an interrupted guest handoff to the resolved account without
        // exposing its fields or letting a blank form replace it before consent.
        if (!locked) writeBookingDraft(owner, pendingDraft || draft, { handoff: !!pendingDraft || authHandoff });
        draftState.current = { owner, draft, pendingDraft, authHandoff, locked, revision: current.revision + 1 };
        setDraftSnapshot(draftState.current);
      }
      setUser(data.user); setServices(data.services || []); setMembership(data.user ? data.membership || noMembership : noMembership);
    } finally { setAuthReady(true); }
  }, []);
  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    authGeneration.current += 1;
    notificationUser.current = null;
    writeBookingDraft(null, null);
    draftState.current = { owner: 'guest', revision: draftState.current.revision + 1, draft: null, pendingDraft: null, authHandoff: false, locked: false };
    setDraftSnapshot(draftState.current);
    readNotifications.current = new Set();
    setUser(null); setServices([]); setMembership(noMembership); setNotifications([]);
  }, []);
  const refreshConfig = useCallback(() => api('/config', { foreground: true }).then(setConfig), []);
  const updateService = useCallback(service => setConfig(old => ({ ...old,
    services: (old?.services || []).map(item => item.id === service.id ? service : item),
    ...(service.id === 'online' ? { lessonLibrary: { ...old?.lessonLibrary, lessonCents: service.cents, bundleCents: service.bundleCents } } : {}),
  })), []);
  useEffect(() => { refreshConfig().catch(() => setConfig(old => ({ ...old, connected: false, paymentsReady: false }))); refreshUser().catch(() => {}); }, [refreshUser, refreshConfig]);
  return <Context.Provider value={{ signOut, notifications, refreshNotifications, markNotificationsRead, config, user, services, membership, setUser, authReady, refreshUser, refreshConfig, updateService, bookingDraft, setBookingDraft, discardBookingDraft, draftOwner, draftRevision, beginBookingHandoff, resumeBookingHandoff, hasPendingBookingHandoff: !!draftSnapshot.pendingDraft, hasLockedBookingDraft: draftSnapshot.locked }}>{children}</Context.Provider>;
}
export const useBravo = () => useContext(Context);
