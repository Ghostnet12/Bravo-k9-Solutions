import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { useLiveSessions } from './live-state';
import { isLiveAnnouncement } from '../../shared/live-policy.js';
import './home-banner.css';
import { isImageEditor } from '../../shared/site-images.js';
import { DEFAULT_BANNER, bannerDate } from '../../shared/site-banner.js';

const AlertEditor = lazy(() => import('./BannerEditor'));
const localTime = date => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
export default function HomeBanner() {
  const { user } = useBravo();
  const live = useLiveSessions();
  const canEdit = isImageEditor(user) && !user?.mustChangePassword;
  const [now, setNow] = useState(() => new Date()), [weather, setWeather] = useState(null);
  const [saved, setSaved] = useState(null), [editError, setEditError] = useState(''), [editing, setEditing] = useState(false);
  const [paused, setPaused] = useState(null), [reduced, setReduced] = useState(false);
  const hold = useRef(null), origin = useRef(null);
  const cancelHold = () => { clearTimeout(hold.current); hold.current = null; };
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches || document.documentElement.classList.contains('access-reduced-motion')); changed(); media.addEventListener('change', changed);
    const preferenceObserver = new MutationObserver(changed);
    preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    let active = true;
    const refresh = () => {
      if (document.hidden) return;
      api('/site-banner').then(data => { if (active && Array.isArray(data.alerts)) setSaved(data); }).catch(() => {});
      api('/site-banner/weather').then(data => { if (active) setWeather(data.weather || null); }).catch(() => { if (active) setWeather(null); });
    };
    refresh(); const dataTimer = setInterval(refresh, 300000), clockTimer = setInterval(() => setNow(new Date()), 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(dataTimer); clearInterval(clockTimer); cancelHold(); preferenceObserver.disconnect(); media.removeEventListener('change', changed); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  async function openEditor() {
    if (!canEdit) return;
    cancelHold(); setEditError('');
    try { const data = await api('/site-banner'); setSaved(data); setEditing(true); }
    catch (e) { setEditError(e.message); }
  }
  const freshWeather = weather && now.getTime() - Date.parse(weather.observedAt) <= 7200000 ? weather : null;
  const settings = { ...DEFAULT_BANNER, ...saved?.settings };
  const weatherText = settings.weatherOverride || (freshWeather ? `${freshWeather.temperature}°F · ${freshWeather.description} · observed ${localTime(new Date(freshWeather.observedAt))}` : '');
  const alerts = (saved?.alerts || []).map(text => text.replace(/All alerts and important information will be displayed here\.?/gi, '').trim()).filter(text => text && !isLiveAnnouncement(text));
  const activeTrainers = live.announcements.filter(item => item.status === 'live');
  const items = [
    ...(activeTrainers.length ? [{ label: 'LIVE', text: activeTrainers.map(item => `${item.trainerName}${item.audience === 'client' ? ' · Client session' : ''}`).join(' / ') }] : []),
    ...(live.availability === 'unavailable' ? [{ label: 'LIVE', text: 'Status temporarily unavailable — check Live Cams.' }] : []),
    ...(settings.showAlerts ? (alerts.length ? alerts.map(text => ({ label: settings.alertLabel, text })) : [{ label: settings.fallbackLabel, text: settings.fallback }]) : []),
    ...(settings.showLocation ? [{ label: settings.locationLabel, text: settings.location }] : []),
    ...(settings.showTime ? [{ label: settings.timeLabel, text: `${bannerDate(now)} · ${settings.timeOverride || localTime(now)}` }] : []),
    ...(settings.showWeather && weatherText ? [{ label: settings.weatherLabel, text: weatherText }] : []),
  ];
  const routine = settings.motion !== 'always' && !(settings.motion === 'alerts' && settings.showAlerts && saved?.alerts?.length);
  const stopped = (paused ?? routine) || reduced || editing;
  return <>
    <section className={`home-status-banner ${stopped ? 'is-paused' : ''}`} aria-label="Location, weather, date, time and Bravo alerts" data-banner-editable={canEdit || undefined} style={{ '--banner-text': settings.textColor, '--banner-border': settings.borderColor, '--banner-center': settings.centerColor, '--banner-edge': settings.edgeColor, '--banner-size': `${settings.fontSize}px`, '--banner-outline': `${settings.borderWidth}px` }}
      onPointerDown={event => { if (!canEdit || event.button !== 0 || event.target.closest('button, a')) return; origin.current = { x: event.clientX, y: event.clientY }; cancelHold(); hold.current = setTimeout(openEditor, 650); }}
      onPointerMove={event => { if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancelHold(); }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
      onContextMenu={event => { if (canEdit && !event.target.closest('button, a')) event.preventDefault(); }}>
      <div className="banner-viewport" tabIndex={stopped ? 0 : undefined} aria-label={stopped ? 'Banner information — scroll sideways for more' : undefined}><div className="banner-track" style={{ '--banner-duration': `${Math.max(35, items.reduce((sum, item) => sum + item.text.length + item.label.length, 0) * .18) / settings.speed}s` }}>
        {[0, 1].map(copy => <div className="banner-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{items.map((item, index) => <span className="banner-item" key={index}>{item.label.trim() && <strong>{item.label}</strong>}<span>{item.text}</span><i aria-hidden="true">✦</i></span>)}</div>)}
      </div></div>
      <div className="banner-controls">{!reduced && <button type="button" aria-label={stopped ? 'Resume banner' : 'Pause banner'} aria-pressed={stopped} onClick={() => setPaused(!stopped)}>{stopped ? '▶' : 'Ⅱ'}</button>}</div>
    </section>
    {canEdit && <button type="button" className="section-edit-button" onClick={openEditor}>Edit information banner</button>}
    {editError && <p className="shell" role="alert">{editError}</p>}
    {editing && canEdit && saved && <Suspense fallback={<p role="status">Opening banner editor…</p>}><AlertEditor saved={saved} publish={setSaved} close={() => setEditing(false)}/></Suspense>}
  </>;
}
