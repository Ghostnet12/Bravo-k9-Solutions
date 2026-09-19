import { useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import './home-banner.css';

const localTime = date => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
function AlertEditor({ saved, publish, close }) {
  const dialog = useRef(null);
  const [baseline] = useState(saved);
  const [draft, setDraft] = useState(saved.alerts);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus?.();
  }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { publish(await api('/site-banner', { method: 'PUT', body: { expectedRevision: baseline.revision, alerts: draft.map(value => value.trim()) } })); close(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="banner-editor" aria-labelledby="banner-editor-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <form onSubmit={save}>
      <div className="banner-editor-heading"><h2 id="banner-editor-title">Edit banner alerts</h2><button type="button" onClick={close} disabled={busy} aria-label="Close alert editor">×</button></div>
      <p>Publish short updates, weather-related closures, or appointment notices. These messages are public.</p>
      <fieldset disabled={busy}>
        {draft.map((value, index) => <div className="banner-alert-field" key={index}><label>Alert {index + 1}<textarea required maxLength={280} rows={3} value={value} onChange={event => setDraft(items => items.map((item, i) => i === index ? event.target.value : item))}/></label><button type="button" onClick={() => setDraft(items => items.filter((_, i) => i !== index))}>Remove alert {index + 1}</button></div>)}
        <button type="button" disabled={draft.length >= 30} onClick={() => setDraft(items => [...items, ''])}>+ Add alert</button>
      </fieldset>
      <p className="banner-editor-note">Location, local time, and NWS weather update automatically. Publish with no alerts to clear your notices.</p>
      {error && <p role="alert">{error}</p>}
      <div className="banner-editor-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" disabled={busy || JSON.stringify(draft) === JSON.stringify(baseline.alerts)}>{busy ? 'Publishing…' : 'Publish alerts'}</button></div>
    </form>
  </dialog>;
}
export default function HomeBanner() {
  const { user } = useBravo();
  const canEdit = user?.role === 'owner';
  const [now, setNow] = useState(() => new Date()), [weather, setWeather] = useState(null);
  const [saved, setSaved] = useState(null), [editError, setEditError] = useState(''), [editing, setEditing] = useState(false);
  const [paused, setPaused] = useState(false), [reduced, setReduced] = useState(false);
  const hold = useRef(null), origin = useRef(null);
  const cancelHold = () => { clearTimeout(hold.current); hold.current = null; };
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches); changed(); media.addEventListener('change', changed);
    let active = true;
    const refresh = () => {
      if (document.hidden) return;
      api('/site-banner').then(data => { if (active && Array.isArray(data.alerts)) setSaved(data); }).catch(() => {});
      api('/site-banner/weather').then(data => { if (active) setWeather(data.weather || null); }).catch(() => { if (active) setWeather(null); });
    };
    refresh(); const dataTimer = setInterval(refresh, 300000), clockTimer = setInterval(() => setNow(new Date()), 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(dataTimer); clearInterval(clockTimer); cancelHold(); media.removeEventListener('change', changed); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  async function openEditor() {
    if (!canEdit) return;
    cancelHold(); setEditError('');
    try { const data = await api('/site-banner'); setSaved(data); setEditing(true); }
    catch (e) { setEditError(e.message); }
  }
  const freshWeather = weather && now.getTime() - Date.parse(weather.observedAt) <= 7200000 ? weather : null;
  const items = [
    { label: 'LOCATION', text: 'Aberdeen, South Dakota' },
    { label: 'LOCAL TIME', text: localTime(now) },
    { label: 'WEATHER · NWS', text: freshWeather ? `${freshWeather.temperature}°F · ${freshWeather.description} · observed ${localTime(new Date(freshWeather.observedAt))}` : 'Weather temporarily unavailable' },
    ...(saved?.alerts?.length ? saved.alerts.map(text => ({ label: 'BRAVO ALERT', text })) : [{ label: 'BRAVO', text: 'Trust. Train. Deploy.' }]),
  ];
  const stopped = paused || reduced || editing;
  return <>
    <section className={`home-status-banner ${stopped ? 'is-paused' : ''}`} aria-label="Aberdeen weather, local time and Bravo alerts"
      onPointerDown={event => { if (!canEdit || event.button !== 0 || event.target.closest('button, a')) return; origin.current = { x: event.clientX, y: event.clientY }; cancelHold(); hold.current = setTimeout(openEditor, 650); }}
      onPointerMove={event => { if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancelHold(); }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
      onContextMenu={event => { if (canEdit && !event.target.closest('button, a')) event.preventDefault(); }}>
      <div className="banner-viewport"><div className="banner-track" style={{ '--banner-duration': `${Math.max(35, items.reduce((sum, item) => sum + item.text.length + item.label.length, 0) * .18)}s` }}>
        {[0, 1].map(copy => <div className="banner-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{items.map((item, index) => <span className="banner-item" key={index}><strong>{item.label}</strong><span>{item.text}</span><i aria-hidden="true">✦</i></span>)}</div>)}
      </div></div>
      <div className="banner-controls">{!reduced && <button type="button" aria-label={paused ? 'Resume banner' : 'Pause banner'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button>}{canEdit && <button type="button" onClick={openEditor}>Edit alerts</button>}</div>
    </section>
    {editError && <p className="shell" role="alert">{editError}</p>}
    {editing && canEdit && saved && <AlertEditor saved={saved} publish={setSaved} close={() => setEditing(false)}/>}
  </>;
}
