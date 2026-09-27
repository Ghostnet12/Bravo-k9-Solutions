import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { trainerIntroductions } from '../../shared/trainer-profile';

const dollars = cents => (cents / 100).toFixed(2);
export default function WebsiteRecordEditor({ record, close, published, design }) {
  const dialog = useRef(null), { updateService } = useBravo();
  const [saved, setSaved] = useState(null), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const trainer = record.kind === 'trainer';
  useEffect(() => {
    const focused = document.activeElement; dialog.current.showModal();
    return () => focused?.focus?.();
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([api(trainer ? '/team' : '/admin/services'), trainer ? api('/site-content') : null]).then(([data, content]) => {
      const row = (trainer ? data.team : data.services)?.find(item => item.id === record.id);
      if (!row) throw new Error('This item is no longer available. Reload the page.');
      if (!live) return;
      const introduction = trainerIntroductions[row.profileKey === 'ashley' ? 'Ashley Northrop' : row.profileKey === 'david' ? 'David Northrop' : row.name];
      setSaved({...row,introductionRevision:content?.entries?.[introduction?.key]?.revision || 0}); setDraft(trainer ? { name: row.name, title: row.title, bio: content?.entries?.[introduction?.key]?.value?.text ?? (row.bio || introduction?.text || '') } : {
        name: row.name, description: row.description, price: dollars(row.cents),
        ...(row.id === 'training' ? { additional: dollars(row.additionalDogCents ?? 10000) } : {}),
        ...(row.id === 'online' ? { bundle: dollars(row.bundleCents ?? 25000) } : { enabled: row.enabled !== false }),
      });
    }).catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [record.id, trainer]);
  const initial = useRef(null);
  if (draft && !initial.current) initial.current = JSON.stringify(draft);
  const dirty = !!draft && JSON.stringify(draft) !== initial.current;
  const requestClose = () => { if (!busy && (!dirty || window.confirm('Discard your unpublished changes?'))) close(); };
  useLayoutEffect(() => { const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const change = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const amount = key => {
        if (!/^\d+(?:\.\d{1,2})?$/.test(draft[key]) || Number(draft[key]) > 10000) throw new Error('Enter dollar amounts from 0 to 10,000 with up to two decimal places.');
        return Math.round(Number(draft[key]) * 100);
      };
      const body = { expectedRevision: saved.revision || 0, ...(trainer ? {...draft,expectedIntroductionRevision:saved.introductionRevision} : {
        name: draft.name, description: draft.description, cents: amount('price'),
        ...(saved.id === 'training' ? { additionalDogCents: amount('additional') } : {}),
        ...(saved.id === 'online' ? { bundleCents: amount('bundle') } : { enabled: draft.enabled }),
      }) };
      const result = await api(`/admin/${trainer ? 'team' : 'services'}/${record.id}`, { method: 'PATCH', body });
      if (trainer) window.dispatchEvent(new CustomEvent('bravo-team-published', { detail: result.person }));
      else updateService(result.service);
      published(trainer ? 'Trainer profile published.' : 'Program published. New quotes use the saved prices.'); close();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="site-content-dialog" data-site-image-ignore="" aria-label={trainer ? 'Edit trainer profile' : 'Edit program and pricing'} onCancel={event => { event.preventDefault(); requestClose(); }}>
    <form onSubmit={save}>
      <div className="site-content-heading"><h2>{trainer ? 'Trainer profile' : 'Program & pricing'}</h2><button type="button" aria-label="Close editor" disabled={busy} onClick={requestClose}>×</button></div>
      <p>{trainer ? 'Publish the name, title and introduction visitors see. The trainer keeps their photos, schedule and account.' : 'These are the actual program prices used for new requests and checkout. Existing saved bookings keep their agreed price.'}</p>
      {!draft && !error && <p role="status">Loading the current published version…</p>}
      {draft && <fieldset disabled={busy}>
        <label>{trainer ? 'Public name' : 'Program name'}<input required maxLength={trainer ? 80 : 100} minLength={trainer ? 2 : 1} value={draft.name} onChange={event => change('name', event.target.value)}/></label>
        {trainer ? <><label>Public title<input required maxLength={80} value={draft.title} onChange={event => change('title', event.target.value)}/></label><label>Introduction<textarea aria-label="Introduction" rows={6} maxLength={8000} value={draft.bio} onChange={event => change('bio', event.target.value)}/></label></> : <>
          <label>Program description<textarea aria-label="Program description" rows={4} maxLength={2000} value={draft.description} onChange={event => change('description', event.target.value)}/></label>
          <label>{saved.interval === 'walk' ? 'Price per dog / walk (USD)' : saved.interval === 'once' ? 'Initial intake price (USD)' : 'Monthly price (USD)'}<input required type="number" inputMode="decimal" min="0" max="10000" step="0.01" value={draft.price} onChange={event => change('price', event.target.value)}/></label>
          {saved.id === 'training' && <label>Each additional dog / month (USD)<input required type="number" inputMode="decimal" min="0" max="10000" step="0.01" value={draft.additional} onChange={event => change('additional', event.target.value)}/></label>}
          {saved.id === 'online' ? <><label>Training + lessons total / month (USD)<input required type="number" inputMode="decimal" min="0" max="10000" step="0.01" value={draft.bundle} onChange={event => change('bundle', event.target.value)}/></label><a href="/admin?tab=lessons">Open, close and manage lessons in Lesson studio →</a></> : <label className="record-editor-check"><input type="checkbox" checked={draft.enabled} onChange={event => change('enabled', event.target.checked)}/>Offer this program for new bookings</label>}
        </>}
      </fieldset>}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={()=>{if(!dirty || window.confirm('Discard your unpublished changes and edit the design?'))design();}}>Colors &amp; layout</button>
      <div className="site-content-actions"><button type="button" disabled={busy} onClick={requestClose}>Cancel</button><button type="submit" disabled={busy || !dirty}>{busy ? 'Publishing…' : trainer ? 'Publish trainer profile' : 'Publish program & prices'}</button></div>
    </form>
  </dialog>;
}
