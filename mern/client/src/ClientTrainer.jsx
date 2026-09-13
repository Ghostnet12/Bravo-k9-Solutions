import { useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { Notice } from './ui';
import { trainerOptions, trainerChoice, bookingTrainerIds, acceptedTrainerIds, JOINT_TRAINER_ID } from '../../shared/trainers';

export default function ClientTrainer({ bookings, onSaved }) {
  const { user } = useBravo();
  const [bookingId, setBookingId] = useState(bookings[0]?._id || ''), [trainer, setTrainer] = useState(trainerChoice(bookings[0]) || user.id), [team, setTeam] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const booking = bookings.find(b => b._id === bookingId), assigned = trainerChoice(booking);
  const mine = bookingTrainerIds(booking).includes(user.id), selected = team?.find(t => t.id === trainer);
  const alreadyAccepted = user.role === 'owner' ? !!booking?.trainerAcceptedAt && !booking?.trainerAcceptanceRequired : acceptedTrainerIds(booking).includes(user.id);
  async function load() { try { const r = await api('/team'); setTeam(trainerOptions(r.team)); } catch (e) { setError(e.message); } }
  async function save(accept) {
    setBusy(true); setError(''); try {
      if (accept) { const r = await api(`/admin/bookings/${bookingId}/accept-client`, { method: 'POST', body: { staffId: user.role === 'owner' ? trainer : user.id, revision: booking.updatedAt } }); onSaved(r.message); }
      else { await api(`/admin/bookings/${bookingId}/assignment`, { method: 'PATCH', body: { staffId: trainer } }); onSaved('Trainer assigned. Each assigned trainer can now accept from their staff profile.'); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <details className="panel trainer-assignment" onToggle={e => { if (e.currentTarget.open && !team) load(); }}><summary>Assign trainer & accept client</summary><Notice error>{error}</Notice>{!bookings.length ? <p>No active paid training request to assign.</p> : <>
    <label>Training request<select aria-label="Assignment training request" disabled={busy} value={bookingId} onChange={e => { const b = bookings.find(b => b._id === e.target.value); setBookingId(b._id); setTrainer(trainerChoice(b) || user.id); }}>{bookings.map(b => <option key={b._id} value={b._id}>{b.dogName} · #{b._id.slice(-6)}</option>)}</select></label>
    <label>Trainer<select aria-label="Assigned trainer" value={trainer} disabled={busy || !team} onChange={e => setTrainer(e.target.value)}>{(team || []).map(t => <option key={t.id} value={t.id} disabled={t.disabled}>{t.name}</option>)}</select></label>
    {team?.find(t => t.joint)?.disabled && <p className="helper">David and Ashley requires both real profiles to have active staff access. An administrator can activate the missing staff profile in People &amp; permissions.</p>}
    <p>{booking.trainerAcceptedAt && !booking.trainerAcceptanceRequired ? 'Client accepted by the assigned trainer(s).' : assigned ? 'Each assigned trainer can accept from their staff area. Administrators and owners can accept on their behalf.' : 'Choose a trainer, then assign or accept this client.'}</p>
    <div className="record-actions"><button type="button" className="button button-small" disabled={busy || !team?.length || !trainer || selected?.disabled || trainer === assigned} onClick={() => save(false)}>Assign trainer</button>
    {(user.role === 'owner' || trainer === user.id || mine) && (!assigned || assigned === trainer) && !alreadyAccepted && <button type="button" className="button button-small" disabled={busy || !team?.length || selected?.disabled} onClick={() => save(true)}>{user.role === 'owner' && trainer === JOINT_TRAINER_ID ? 'Accept for both trainers' : 'Accept client'}</button>}</div></>}
  </details>;
}
