import { useState } from 'react';
import { api } from './api';
import { Notice, AppointmentNotice, formatTime } from './ui';
import { today } from './BookingPage';
import { useBravo } from './context';
import { SERVICES, TRAINING_FOCUSES, money } from '../../shared/catalog';

export default function StaffBooking({ team, onSaved }) {
  const { config } = useBravo();
  const catalog = config?.services || SERVICES;
  const [query, setQuery] = useState(''), [clients, setClients] = useState([]), [client, setClient] = useState(null);
  const [date, setDate] = useState(''), [slots, setSlots] = useState([]), [time, setTime] = useState('');
  const [service, setService] = useState('training');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  async function search(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { setClients((await api(`/admin/clients?q=${encodeURIComponent(query)}`)).clients); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function chooseDate(value) {
    setDate(value); setSlots([]); setTime(''); setError(''); if (!value) return;
    setBusy(true);
    try { const data = await api(`/availability?from=${value}&to=${value}`); setSlots(data.days[0]?.slots || []); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(e) {
    e.preventDefault(); const form = e.currentTarget, fields = Object.fromEntries(new FormData(form));
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/admin/bookings', { method: 'POST', body: { requestKey, userId: client._id, staffId: fields.staffId || null, serviceIds: [fields.service], visits: [{ date, time, service: fields.service }], trainingFocus: fields.service === 'training' ? fields.trainingFocus : undefined, dogCount: ['training', 'walking'].includes(fields.service) ? Number(fields.dogCount) : 1, dogName: fields.dogName, phone: fields.phone, address: fields.address, notes: fields.notes } });
      setRequestKey(crypto.randomUUID()); setNotice('Visit requested. Review it below and confirm when agreed with the client. No payment was taken.');
      setClient(null); setDate(''); setSlots([]); setTime(''); await onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <details className="panel staff-create"><summary>Add a visit for a client</summary>
    <p>Find their existing account, select an opening, and assign a trainer. All trainers share one booking calendar.</p>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <form className="owner-search" onSubmit={search}><label>Client name or email<input type="search" value={query} minLength="2" required onChange={e => setQuery(e.target.value)}/></label><button className="button button-small button-ghost" disabled={busy}>Find client</button></form>
    {clients.length > 0 && <label>Choose client<select value={client?._id || ''} disabled={busy} onChange={e => { setClient(clients.find(person => person._id === e.target.value) || null); setRequestKey(crypto.randomUUID()); }}><option value="">Select a person</option>{clients.map(person => <option key={person._id} value={person._id}>{person.name} · {person.email}</option>)}</select></label>}
    {client && <form key={client._id} onSubmit={save}><div className="form-grid">
      <label>Service<select name="service" value={service} onChange={e => setService(e.target.value)}>{catalog.filter(item => item.id !== 'online' && item.enabled !== false).map(item => <option key={item.id} value={item.id}>{item.name} · {money(item.cents)}{item.interval === 'walk' ? '/dog · 30 min' : item.interval === 'month' ? '/month' : ''}</option>)}</select></label>
      {service === 'training' && <label>Training focus<select name="trainingFocus" defaultValue="basic-obedience">{TRAINING_FOCUSES.map(focus => <option key={focus.id} value={focus.id}>{focus.name}</option>)}</select></label>}
      <label>Trainer<select name="staffId"><option value="">Unassigned</option>{team.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
      <label>Date<input type="date" min={today()} value={date} required disabled={busy} onChange={e => chooseDate(e.target.value)}/></label>
      <label>Opening (Aberdeen time)<select value={time} required disabled={busy || !slots.length} onChange={e => setTime(e.target.value)}><option value="">{date && !slots.length ? 'No openings that day' : 'Choose a time'}</option>{slots.map(value => <option key={value} value={value}>{formatTime(value)}</option>)}</select></label>
      <label>Dog’s name<input name="dogName" required maxLength="80" defaultValue={client.dogName}/></label>
      <label>Client phone<input type="tel" name="phone" required minLength="7" maxLength="30" defaultValue={client.phone}/></label>
      <label>Number of dogs<input name="dogCount" type="number" min="1" max="10" defaultValue="1"/><small>Training: $200/month for the first dog, then $100/month per additional dog. Walking: {money(catalog.find(service => service.id === 'walking')?.cents ?? 2500)} per dog.</small></label>
    </div><label>Visit address<input name="address" required minLength="5" maxLength="300" defaultValue={client.address}/></label><label>Private booking notes<textarea name="notes" maxLength="1500" rows="3"/></label><AppointmentNotice compact/><button className="button" disabled={busy || !time}>{busy ? 'Working…' : 'Add visit request'}</button></form>}
  </details>;
}
