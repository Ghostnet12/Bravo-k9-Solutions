import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { Notice } from './ui';
import { workshopMarkup } from '../../shared/workshops';
import { workshopDateLabel, workshopTimeLabel } from '../../shared/workshop-schedule';

const managedEvent = data => data.event && ({ ...data.event, ...(data.configuration && data.event.scheduleMode === 'none' ? { time: data.configuration.time } : {}) });
const editable = event => ({ title: event.title, scheduleMode: event.scheduleMode || 'specific', date: event.date || '', startTime: event.startTime || '', endTime: event.endTime || '', time: event.time || '', location: event.location || '', duration: event.duration, cents: event.cents, description: event.description, published: event.published, expectedRevision: event.revision });
function WorkshopEditor({ event, onSaved, onClose }) {
  const dialog = useRef(null), [draft, setDraft] = useState(() => editable(event)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(null);
  useEffect(() => { const previous = document.activeElement; dialog.current.showModal(); return () => previous?.focus?.(); }, []);
  useEffect(() => {
    if (draft.scheduleMode !== 'weekly') return;
    let active = true;
    const load = () => api('/workshops/schedule-preview').then(data => { if (active) setPreview(data.event); }).catch(() => { if (active) setPreview(null); });
    void load(); const timer = setInterval(load, 15000); return () => { active = false; clearInterval(timer); };
  }, [draft.scheduleMode]);
  const field = key => e => setDraft(old => ({ ...old, [key]: e.target.value }));
  async function save(e) { e.preventDefault(); setBusy(true); setError(''); try { const data = await api('/workshops', { method: 'PUT', body: { ...draft, date: draft.scheduleMode === 'specific' ? draft.date : null } }); onSaved(managedEvent(data)); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <dialog ref={dialog} className="site-content-dialog" aria-label="Edit workshop" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><form onSubmit={save}><h2>Workshop details</h2><p>Save the workshop schedule for Home and Workshops. Publication is a separate setting.</p><fieldset disabled={busy}>
    <fieldset><legend>Date schedule</legend>{[['specific','Specific date'],['weekly','Every Saturday — Automatic'],['none','No date']].map(([value,label]) => <label className="check" key={value}><input type="radio" name="workshop-schedule" value={value} checked={draft.scheduleMode === value} onChange={() => setDraft(old => ({ ...old, scheduleMode: value, ...(value === 'weekly' && !old.startTime && !old.endTime && old.time === '12:00 PM–2:00 PM' ? { startTime: '12:00', endTime: '14:00' } : {}) }))}/>{label}</label>)}</fieldset>
    {draft.scheduleMode === 'specific' && <label>Date<input required type="date" value={draft.date} onChange={field('date')}/></label>}
    <div><label>Start time (Central)<input type="time" required={draft.scheduleMode === 'weekly'} value={draft.startTime} onChange={field('startTime')}/></label><label>End time (Central)<input type="time" required={draft.scheduleMode === 'weekly'} value={draft.endTime} onChange={field('endTime')}/></label>{!draft.startTime && !draft.endTime && <label>Time (Central)<input maxLength={50} value={draft.time} onChange={field('time')}/></label>}</div>
    {draft.scheduleMode === 'weekly' && <aside aria-label="Automatic weekly schedule"><h3>Automatic weekly schedule</h3><p>Every Saturday</p>{preview ? <><p>Current occurrence: {workshopDateLabel(preview.date)}</p><p>{workshopTimeLabel(draft.startTime,draft.endTime) || 'Choose start and end times'} · Central</p><p>Next occurrence: {workshopDateLabel(preview.nextDate)}</p></> : <p role="status">Schedule preview unavailable. Reconnecting…</p>}</aside>}
    {draft.scheduleMode === 'none' && <p>No date or scheduled time will appear publicly. Configured times are retained for later use.</p>}
    {[['title','Workshop title'],['location','Location'],['duration','Duration']].map(([key,label]) => <label key={key}>{label}<input required={key !== 'location'} maxLength={key === 'location' ? 200 : key === 'title' ? 100 : 50} value={draft[key]} onChange={field(key)}/></label>)}
    <label>Price per seat ($)<input type="number" required min="0" max="10000" step="0.01" value={draft.cents / 100} onChange={e => setDraft(old => ({ ...old, cents: Math.round(Number(e.target.value) * 100) }))}/></label><label>Agenda and suitability<textarea required maxLength={1500} value={draft.description} onChange={field('description')}/></label><label className="check"><input type="checkbox" checked={draft.published} onChange={e => setDraft(old => ({ ...old, published: e.target.checked }))}/>Show this workshop publicly</label></fieldset>{error && <p role="alert">{error}</p>}<div className="goal-actions"><button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : 'Save workshop'}</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div></form></dialog>;
}
function initialWorkshop() { try { return typeof document === 'undefined' ? null : JSON.parse(document.querySelector('meta[name="bravo-workshop"]')?.content || 'null'); } catch { return null; } }
export function WorkshopDetails({ compact = false }) {
  const { user } = useBravo();
  const [event, setEvent] = useState(initialWorkshop), [error, setError] = useState(''), [editing, setEditing] = useState(false), [status, setStatus] = useState('');
  const owner = user?.role === 'owner' && !user.mustChangePassword && !user.blocked;
  useEffect(() => {
    let active = true;
    const load = () => { if (document.hidden) return; api('/workshops').then(data => { if (active) { setEvent(managedEvent(data)); setError(''); } }).catch(() => { if (active) { setEvent(null); setError('Workshop details could not load. Call Bravo for the latest information.'); } }); };
    void load(); const timer = setInterval(load,15000); window.addEventListener('bravo-workshop-changed',load); document.addEventListener('visibilitychange',load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('bravo-workshop-changed',load); document.removeEventListener('visibilitychange',load); };
  }, [owner]);
  useEffect(() => {
    if (!owner) return; let active = true;
    const open = () => api('/workshops').then(data => { if (active && data.event) { setEvent(managedEvent(data)); setEditing(true); } }).catch(cause => { if (active) setError(cause.message); });
    window.addEventListener('bravo-workshop-edit',open); return () => { active = false; window.removeEventListener('bravo-workshop-edit',open); };
  }, [owner]);
  return <section data-site-workshop="" className="workshop-details" aria-label="Featured workshop">{error && <Notice error>{error}</Notice>}<div data-workshop-content={compact ? 'compact' : 'full'} dangerouslySetInnerHTML={{ __html: workshopMarkup(event, compact) }}/>{owner && event && <div className="goal-actions"><button type="button" className="button button-ghost" onClick={() => setEditing(true)}>Edit workshop date</button>{!compact && <button type="button" onClick={() => setEditing(true)}>Edit workshop details</button>}</div>}<p role="status">{status}</p>{editing && owner && <WorkshopEditor event={event} onClose={() => setEditing(false)} onSaved={next => { setEvent(next); setEditing(false); setStatus('Workshop details saved.'); window.dispatchEvent(new Event('bravo-workshop-changed')); window.dispatchEvent(new Event('bravo-ads-changed')); }}/>}</section>;
}
