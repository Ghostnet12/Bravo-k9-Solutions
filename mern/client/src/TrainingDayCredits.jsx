import { useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { api } from './api';
import { useBravo } from './context';
import { Notice } from './ui';
import { CREDIT_REASONS, extendCalendarDays, trainingDaysRemaining } from '../../shared/training-credits';
import './training-credits.css';
const date = value => DateTime.fromISO(value, { zone: 'America/Chicago' }).toFormat('LLL d, yyyy · h:mm a');

export function TrainingCreditsDesk() {
  const [open, setOpen] = useState(false), [clients, setClients] = useState([]), [client, setClient] = useState(''), [query, setQuery] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => api(`/admin/training-credits/clients?q=${encodeURIComponent(query)}`).then(r => { if (active) { setClients(r.clients); setError(''); } }).catch(e => { if (active) setError(e.message); }), 200);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query]);
  return <details className="panel day-credit-desk" onToggle={e => setOpen(e.currentTarget.open)}><summary>Credit client days</summary>
    {open && <><p>Rain, snow, or a missed training day? Extend the client’s membership without charging them.</p><Notice error>{error}</Notice><label>Find a client<input type="search" value={query} onChange={e => { setQuery(e.target.value); setClient(''); }} placeholder="Client or dog name"/></label><label>Client to credit<select aria-label="Client to credit" value={client} onChange={e => setClient(e.target.value)}><option value="">Choose a client</option>{clients.map(c => <option key={c._id} value={c._id}>{c.name}{c.dogName ? ` · ${c.dogName}` : ''}</option>)}</select></label><p className="helper">Showing up to 100 matching clients. Search to narrow the list.</p>{client && <TrainingDayCredits key={client} clientId={client} initiallyOpen/>}</>}
  </details>;
}
export default function TrainingDayCredits({ clientId, onSaved = () => {}, initiallyOpen = false }) {
  const { user } = useBravo(), staff = ['staff', 'owner'].includes(user.role);
  const [open, setOpen] = useState(initiallyOpen), [data, setData] = useState(null), [version, setVersion] = useState(0);
  const [termId, setTermId] = useState(''), [days, setDays] = useState('1'), [missedDate, setMissedDate] = useState('');
  const [reason, setReason] = useState('rain'), [note, setNote] = useState(''), [cancelVisits, setCancelVisits] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const pending = useRef(null), inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    api(`/training-credits?client=${encodeURIComponent(clientId)}`).then(r => {
      if (!active) return;
      setData(r); setTermId(current => r.terms.some(t => t.stripeId === current) ? current : r.terms[0]?.stripeId || '');
      setMissedDate(current => current || r.today); setError('');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [open, clientId, version]);
  const term = data?.terms.find(t => t.stripeId === termId), count = Number(days), validDays = Number.isInteger(count) && count >= 1 && count <= 31;
  const billingBlocked = term?.stripeId.startsWith('sub_') && !term.autoPayDisabled;
  let newEnd = null;
  if (term && validDays) newEnd = extendCalendarDays(term.validUntil, count).toISOString();
  const alreadyCredited = data?.credits.some(c => c.missedDate === missedDate);
  async function save(e) {
    e.preventDefault(); if (inFlight.current || !term || !validDays || billingBlocked || alreadyCredited) return;
    if (!window.confirm(`Credit ${count} day${count === 1 ? '' : 's'}? The membership will end ${date(newEnd)} (Aberdeen time).${cancelVisits ? ` Training visits on ${missedDate} will also be cancelled.` : ''} No charge will be made.`)) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    const values = { clientId, termId, days: count, missedDate, reason, note: note.trim(), cancelVisits, expectedEnd: term.validUntil };
    const serialized = JSON.stringify(values);
    if (pending.current?.serialized !== serialized) pending.current = { serialized, body: { ...values, requestKey: crypto.randomUUID() } };
    try {
      const r = await api('/admin/training-credits', { method: 'POST', body: pending.current.body });
      pending.current = null; setNotice(r.message); setVersion(v => v + 1); onSaved(r.message);
    } catch (e) { setError(e.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="day-credit-panel" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>{staff ? 'Credit training days' : 'Training day credits'}</summary>
    {open && <><Notice error>{error}</Notice><Notice>{notice}</Notice>{!data ? <p role="status">{error ? 'Credits could not be loaded.' : 'Loading day credits…'}</p> : <>
      {staff && (data.terms.length ? <form onSubmit={save}><fieldset disabled={busy}><legend className="sr-only">Credit a missed training day</legend><p>Add calendar days to this client’s membership. For example, 6 days left + 1 credited day = 7 days left. Replacement appointments are added separately.</p>
        <label>Training membership<select aria-label="Training membership" value={termId} onChange={e => { setTermId(e.target.value); setNotice(''); }} required>{data.terms.map(t => <option key={t.stripeId} value={t.stripeId}>Ends {date(t.validUntil)} · {t.dogCount || 1} dog(s){new Date(t.validUntil) <= new Date() ? ' · Expired' : ''}</option>)}</select></label>
        <div className="day-credit-fields"><label>Missed training date<input type="date" value={missedDate} required min={term ? DateTime.fromISO(term.validFrom, { zone: 'America/Chicago' }).toISODate() : undefined} max={term ? DateTime.fromISO(term.validUntil, { zone: 'America/Chicago' }).minus({ milliseconds: 1 }).toISODate() : undefined} onChange={e => setMissedDate(e.target.value)}/></label><label>Days to credit<input type="number" min="1" max="31" step="1" value={days} required onChange={e => setDays(e.target.value)}/></label><label>Reason<select aria-label="Reason" value={reason} onChange={e => setReason(e.target.value)}>{Object.entries(CREDIT_REASONS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
        <label>Note to the client {reason !== 'other' && '(optional)'}<textarea aria-label={`Note to the client${reason !== 'other' ? ' (optional)' : ''}`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} required={reason === 'other'}/></label>
        <label className="check-label"><input type="checkbox" checked={cancelVisits} onChange={e => setCancelVisits(e.target.checked)}/>Also cancel this client’s training visits on the missed date</label>
        {newEnd && <div className="day-credit-preview" role="status"><strong>{trainingDaysRemaining(term.validUntil)} → {trainingDaysRemaining(newEnd)} calendar days remaining</strong><p>Current end: {date(term.validUntil)}<br/>New end: <strong>{date(newEnd)}</strong><br/>All dates and times are local to Aberdeen.</p></div>}
        {billingBlocked && <Notice>This plan still renews automatically in Stripe. An administrator must switch it to manual renewal before a day credit can be applied.</Notice>}
        {alreadyCredited && <Notice>This date has already been credited. It cannot be credited twice.</Notice>}
        <p className="helper">Credits extend the selected month, not the number of appointments. A missed date is credited once per client, even with multiple dogs or trainers. Past credits do not restart an expired month from today.</p>
        <button className="button" disabled={busy || !term || !validDays || !missedDate || billingBlocked || alreadyCredited}>{busy ? 'Saving credit…' : 'Save day credit & notify client'}</button>
      </fieldset></form> : <p>No eligible training membership. Activate training access before crediting days.</p>)}
      <h3>Credit history</h3>{data.credits.length ? data.credits.map(c => <article className="day-credit-history" key={c.id}><strong>+{c.days} day{c.days === 1 ? '' : 's'} · {c.reason}</strong><p>Missed date: {c.missedDate}<br/>Membership extended to {date(c.newEnd)}<br/>Credited by {c.actorName} on {date(c.createdAt)}</p>{c.note && <p>{c.note}</p>}{c.cancelledVisits?.length > 0 && <p>{c.cancelledVisits.length} training visit(s) cancelled on this date.</p>}</article>) : <p>No day credits yet.</p>}
    </>}<button type="button" className="quiet-button" disabled={busy} onClick={() => { pending.current = null; setVersion(v => v + 1); }}>Refresh day credits</button></>}
  </details>;
}
