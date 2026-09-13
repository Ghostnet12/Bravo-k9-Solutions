import { trainerOptions, bookingTrainerIds, selectedTrainerId, SHARED_TRAINER_ID } from '../../shared/trainer-selection';
import { useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { Notice } from './ui';

export default function ClientTrainer({bookings,onSaved}) {
  const {user}=useBravo();
  const [bookingId,setBookingId]=useState(bookings[0]?._id||''),[trainer,setTrainer]=useState(selectedTrainerId(bookings[0])||user.id),[team,setTeam]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const booking=bookings.find(b=>b._id===bookingId),assigned=selectedTrainerId(booking);
  async function load(){try{const r=await api('/team');setTeam(trainerOptions(r.team))}catch(e){setError(e.message)}}
  async function save(accept) {
    setBusy(true);setError('');try{
      if(accept){const r=await api(`/admin/bookings/${bookingId}/accept-client`,{method:'POST',body:{staffId:user.role==='owner'?trainer:user.id,revision:booking.updatedAt}});onSaved(r.message)}
      else {await api(`/admin/bookings/${bookingId}/assignment`,{method:'PATCH',body:{staffId:trainer}});onSaved('Trainer assigned. Open their staff profile and choose Accept client, or accept below.');}
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <details className="panel trainer-assignment" onToggle={e=>{if(e.currentTarget.open&&!team)load()}}><summary>Assign trainer & accept client</summary><Notice error>{error}</Notice>{!bookings.length?<p>No active paid training request to assign.</p>:<><label>Training request<select aria-label="Assignment training request" disabled={busy} value={bookingId} onChange={e=>{const b=bookings.find(b=>b._id===e.target.value);setBookingId(b._id);setTrainer(selectedTrainerId(b)||user.id)}}>{bookings.map(b=><option key={b._id} value={b._id}>{b.dogName} · #{b._id.slice(-6)}</option>)}</select></label><label>Trainer<select aria-label="Assigned trainer" value={trainer} disabled={busy||!team} onChange={e=>setTrainer(e.target.value)}>{(team||[]).map(t=><option key={t.id} value={t.id} disabled={t.unavailable}>{t.name}{t.unavailable ? ' — activate both staff profiles' : ''}</option>)}</select></label>
    <p>{booking.trainerAcceptedAt&&!booking.trainerAcceptanceRequired?'Client accepted by the assigned trainer.':assigned?'This trainer can accept the client from their staff area. Administrators and owners can accept on their behalf.':'Choose a trainer, then assign or accept this client.'}</p>
    <div className="record-actions"><button type="button" className="button button-small" disabled={busy||!team?.length||!trainer||trainer===assigned} onClick={()=>save(false)}>Assign trainer</button>{(user.role==='owner'||trainer===user.id||bookingTrainerIds(booking).includes(user.id))&&(!assigned||assigned===trainer)&&(!booking.trainerAcceptedAt||booking.trainerAcceptanceRequired)&&<button type="button" className="button button-small" disabled={busy||!team?.length} onClick={()=>save(true)}>Accept client</button>}</div></>}
  </details>;
}
