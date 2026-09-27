import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { Notice } from './ui';
import { workshopMarkup } from '../../shared/workshops';

function WorkshopEditor({ event, onSaved, onClose }) {
  const dialog = useRef(null), [draft, setDraft] = useState(event), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  async function save(e) { e.preventDefault(); setBusy(true); setError(''); try { const { revision, ...details } = draft; const data = await api('/workshops', { method: 'PUT', body: { ...details, expectedRevision: revision } }); onSaved(data.event); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <dialog ref={dialog} className="site-content-dialog" aria-label="Edit workshop" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><form onSubmit={save}><h2>Workshop details</h2><p>Leave the time or location blank until confirmed. Details appear on Home and Workshops.</p><fieldset disabled={busy}>{[['title','Workshop title'],['date','Date'],['time','Time (Central)'],['location','Location'],['duration','Duration']].map(([key,label]) => <label key={key}>{label}<input required={['title','date','duration'].includes(key)} type={key === 'date' ? 'date' : 'text'} maxLength={key === 'location' ? 200 : key === 'title' ? 100 : 50} value={draft[key]} onChange={e => setDraft(old => ({ ...old, [key]: e.target.value }))}/></label>)}<label>Price per seat ($)<input type="number" required min="0" max="10000" step="0.01" value={draft.cents / 100} onChange={e => setDraft(old => ({ ...old, cents: Math.round(Number(e.target.value) * 100) }))}/></label><label>Agenda and suitability<textarea required maxLength={1500} value={draft.description} onChange={e => setDraft(old => ({ ...old, description: e.target.value }))}/></label><label className="check"><input type="checkbox" checked={draft.published} onChange={e => setDraft(old => ({ ...old, published: e.target.checked }))}/>Show this workshop publicly</label></fieldset>{error && <p role="alert">{error}</p>}<div className="goal-actions"><button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : 'Publish workshop'}</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div></form></dialog>;
}
function initialWorkshop() { try { return typeof document === 'undefined' ? null : JSON.parse(document.querySelector('meta[name="bravo-workshop"]')?.content || 'null'); } catch { return null; } }
export function WorkshopDetails({ compact = false }) {
  const { user } = useBravo();
  const [event, setEvent] = useState(initialWorkshop), [error, setError] = useState(''), [editing, setEditing] = useState(false), [status, setStatus] = useState('');
  const owner = user?.role === 'owner' && !user.mustChangePassword;
  useEffect(() => { let active = true; api('/workshops').then(data => { if (active) { setEvent(data.event); } }).catch(() => { if (active) setError('Workshop details could not load. Call Bravo for the latest information.'); }); return () => { active = false; }; }, []);
  return <section className="workshop-details" aria-label="Featured workshop">
    {error && <Notice error>{error}</Notice>}
    <div data-workshop-content={compact ? 'compact' : 'full'} dangerouslySetInnerHTML={{ __html: workshopMarkup(event, compact) }}/>
    {owner && event && !compact && <button type="button" className="button button-ghost" onClick={() => setEditing(true)}>Edit workshop details</button>}
    <p role="status">{status}</p>{editing && owner && <WorkshopEditor event={event} onClose={() => setEditing(false)} onSaved={next => { setEvent(next); setEditing(false); setStatus('Workshop details saved.'); }}/>}</section>;
}
