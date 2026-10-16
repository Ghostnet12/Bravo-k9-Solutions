import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { DEFAULT_BANNER } from '../../shared/site-banner.js';

export default function AlertEditor({ saved, publish, close }) {
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
      <p>Publish short updates, weather-related closures, or appointment notices. These messages are public. Live announcements update automatically from active broadcasts; do not add a static “live now” notice.</p>
      <fieldset disabled={busy}>
        <details open><summary>Content &amp; automatic updates</summary><div className="banner-settings">
          {[['showLocation', 'Show location'], ['showTime', 'Show time'], ['showWeather', 'Show weather'], ['showAlerts', 'Show alerts']].map(([key, title]) => <label className="banner-check" key={key}><input type="checkbox" checked={settings[key]} onChange={event => change(key, event.target.checked)}/>{title}</label>)}
          {[['locationLabel', 'Location label'], ['location', 'Location text'], ['timeLabel', 'Time label'], ['timeOverride', 'Custom time text (blank = automatic Central Time)'], ['weatherLabel', 'Weather label'], ['weatherOverride', 'Custom weather text (blank = automatic Aberdeen weather)'], ['alertLabel', 'Alert label'], ['fallbackLabel', 'Default message label'], ['fallback', 'Default message when there are no alerts']].map(([key, title]) => <div key={key}><label htmlFor={`banner-${key}`}>{title}</label><input id={`banner-${key}`} value={settings[key]} maxLength={key.endsWith('Label') ? 50 : 280} onChange={event => change(key, event.target.value)}/></div>)}
          <p>Automatic weather is for Aberdeen, SD. Use custom weather text for your own update. Blank custom time or weather text restores automatic updates.</p>
        </div></details>
        <details><summary>Colors, text size &amp; scrolling</summary><div className="banner-settings"><label>Banner movement<select aria-label="Banner movement" value={settings.motion} onChange={event => change('motion', event.target.value)}><option value="alerts">Scroll only when there is an alert</option><option value="always">Always scroll</option><option value="never">Keep still</option></select></label>
          {[['textColor', 'Text color'], ['borderColor', 'Outline color'], ['centerColor', 'Center color'], ['edgeColor', 'Edge color']].map(([key, title]) => <div key={key}><label htmlFor={`banner-${key}`}>{title}</label><input type="color" id={`banner-${key}`} value={settings[key]} onChange={event => change(key, event.target.value)}/></div>)}
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
