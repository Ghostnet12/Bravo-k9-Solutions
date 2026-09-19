import { useEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import './home-banner.css';
import { isImageEditor } from '../../shared/site-images.js';
import { DEFAULT_BANNER } from '../../shared/site-banner.js';

const localTime = date => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
function AlertEditor({ saved, publish, close }) {
  const dialog = useRef(null);
  const [baseline] = useState(saved);
  const [draft, setDraft] = useState(saved.alerts);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_BANNER, ...saved.settings }));
  const change = (key, value) => setSettings(old => ({ ...old, [key]: value }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus?.();
  }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { publish(await api('/site-banner', { method: 'PUT', body: { expectedRevision: baseline.revision, alerts: draft.map(value => value.trim()), settings } })); close(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="banner-editor" aria-labelledby="banner-editor-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <form onSubmit={save}>
      <div className="banner-editor-heading"><h2 id="banner-editor-title">Edit banner</h2><button type="button" onClick={close} disabled={busy} aria-label="Close banner editor">×</button></div>
      <p>Publish short updates, weather-related closures, or appointment notices. These messages are public.</p>
      <fieldset disabled={busy}>
        <details open><summary>Content &amp; automatic updates</summary><div className="banner-settings">
          {[['showLocation', 'Show location'], ['showTime', 'Show time'], ['showWeather', 'Show weather'], ['showAlerts', 'Show alerts']].map(([key, title]) => <label className="banner-check" key={key}><input type="checkbox" checked={settings[key]} onChange={event => change(key, event.target.checked)}/>{title}</label>)}
          {[['locationLabel', 'Location label'], ['location', 'Location text'], ['timeLabel', 'Time label'], ['timeOverride', 'Custom time text (blank = automatic Central Time)'], ['weatherLabel', 'Weather label'], ['weatherOverride', 'Custom weather text (blank = automatic Aberdeen weather)'], ['alertLabel', 'Alert label'], ['fallbackLabel', 'Default message label'], ['fallback', 'Default message when there are no alerts']].map(([key, title]) => <div key={key}><label htmlFor={`banner-${key}`}>{title}</label><input id={`banner-${key}`} value={settings[key]} maxLength={key.endsWith('Label') ? 50 : 280} onChange={event => change(key, event.target.value)}/></div>)}
          <p>Automatic weather is for Aberdeen, SD. Use custom weather text for your own update. Blank custom time or weather text restores automatic updates.</p>
        </div></details>
        <details><summary>Colors, text size &amp; scrolling</summary><div className="banner-settings">
          {[['textColor', 'Text color'], ['borderColor', 'Outline color'], ['centerColor', 'Center color'], ['edgeColor', 'Orange-end color']].map(([key, title]) => <div key={key}><label htmlFor={`banner-${key}`}>{title}</label><input type="color" id={`banner-${key}`} value={settings[key]} onChange={event => change(key, event.target.value)}/></div>)}
          {[['speed', 'Scroll speed', .25, 3, .25], ['fontSize', 'Text size', 12, 24, 1], ['borderWidth', 'Outline thickness', 0, 6, 1]].map(([key, title, min, max, step]) => <div key={key}><label htmlFor={`banner-${key}`}>{title}: {settings[key]}</label><input type="range" id={`banner-${key}`} min={min} max={max} step={step} value={settings[key]} onChange={event => change(key, Number(event.target.value))}/></div>)}
          <button type="button" onClick={() => setSettings({ ...DEFAULT_BANNER })}>Reset banner settings</button>
        </div></details>
        <h3>Alerts</h3>
        {draft.map((value, index) => <div className="banner-alert-field" key={index}><label htmlFor={`banner-alert-${index}`}>Alert {index + 1}</label><textarea id={`banner-alert-${index}`} required maxLength={280} rows={3} value={value} onChange={event => { const text = event.target.value; setDraft(items => items.map((item, i) => i === index ? text : item)); }}/><button type="button" onClick={() => setDraft(items => items.filter((_, i) => i !== index))}>Remove alert {index + 1}</button></div>)}
        <button type="button" disabled={draft.length >= 30} onClick={() => setDraft(items => [...items, ''])}>+ Add alert</button>
      </fieldset>
      <p className="banner-editor-note">Your banner settings and notices publish together. Publish with no alerts to clear your notices.</p>
      {error && <p role="alert">{error}</p>}
      <div className="banner-editor-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" disabled={busy || (JSON.stringify(draft) === JSON.stringify(baseline.alerts) && JSON.stringify(settings) === JSON.stringify({ ...DEFAULT_BANNER, ...baseline.settings }))}>{busy ? 'Publishing…' : 'Publish banner'}</button></div>
    </form>
  </dialog>;
}
export default function HomeBanner() {
  const { user } = useBravo();
  const canEdit = isImageEditor(user) && !user?.mustChangePassword;
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
  const settings = { ...DEFAULT_BANNER, ...saved?.settings };
  const items = [
    ...(settings.showLocation ? [{ label: settings.locationLabel, text: settings.location }] : []),
    ...(settings.showTime ? [{ label: settings.timeLabel, text: settings.timeOverride || localTime(now) }] : []),
    ...(settings.showWeather ? [{ label: settings.weatherLabel, text: settings.weatherOverride || (freshWeather ? `${freshWeather.temperature}°F · ${freshWeather.description} · observed ${localTime(new Date(freshWeather.observedAt))}` : 'Weather temporarily unavailable') }] : []),
    ...(settings.showAlerts ? (saved?.alerts?.length ? saved.alerts.map(text => ({ label: settings.alertLabel, text })) : [{ label: settings.fallbackLabel, text: settings.fallback }]) : []),
  ];
  const stopped = paused || reduced || editing;
  return <>
    <section className={`home-status-banner ${stopped ? 'is-paused' : ''}`} aria-label="Location, weather, time and Bravo alerts" data-banner-editable={canEdit || undefined} style={{ '--banner-text': settings.textColor, '--banner-border': settings.borderColor, '--banner-center': settings.centerColor, '--banner-edge': settings.edgeColor, '--banner-size': `${settings.fontSize}px`, '--banner-outline': `${settings.borderWidth}px` }}
      onPointerDown={event => { if (!canEdit || event.button !== 0 || event.target.closest('button, a')) return; origin.current = { x: event.clientX, y: event.clientY }; cancelHold(); hold.current = setTimeout(openEditor, 650); }}
      onPointerMove={event => { if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancelHold(); }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
      onContextMenu={event => { if (canEdit && !event.target.closest('button, a')) event.preventDefault(); }}>
      <div className="banner-viewport"><div className="banner-track" style={{ '--banner-duration': `${Math.max(35, items.reduce((sum, item) => sum + item.text.length + item.label.length, 0) * .18) / settings.speed}s` }}>
        {[0, 1].map(copy => <div className="banner-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{items.map((item, index) => <span className="banner-item" key={index}>{item.label.trim() && <strong>{item.label}</strong>}<span>{item.text}</span><i aria-hidden="true">✦</i></span>)}</div>)}
      </div></div>
      <div className="banner-controls">{!reduced && <button type="button" aria-label={paused ? 'Resume banner' : 'Pause banner'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button>}</div>
    </section>
    {editError && <p className="shell" role="alert">{editError}</p>}
    {editing && canEdit && saved && <AlertEditor saved={saved} publish={setSaved} close={() => setEditing(false)}/>}
  </>;
}
