import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';
import RemoveClientButton from './RemoveClientButton';

export default function TrainerClients({staffId}) {
  const [bookings,setBookings]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function load() {setError('');try{const r=await api(`/admin/trainers/${staffId}/clients`);setBookings(r.bookings)}catch(e){setError(e.message)}}
  async function accept(booking) {setBusy(true);setError('');setNotice('');try{const r=await api(`/admin/bookings/${booking._id}/accept-client`,{method:'POST',body:{staffId,revision:booking.updatedAt}});setNotice(r.message);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <details className="panel trainer-clients" onToggle={e=>{if(e.currentTarget.open&&!bookings)load()}}><summary>Training clients · accept assignments</summary><p>Accept clients assigned to this trainer. Acceptance updates every visit on that client’s training request. The five-dog limit and working hours still apply.</p><Notice error>{error}</Notice><Notice>{notice}</Notice><button type="button" className="quiet-button" disabled={busy} onClick={load}>Refresh assigned clients</button>
    {!bookings?<p role="status">Loading assigned clients…</p>:!bookings.length?<p>No clients assigned yet. Choose a trainer from the client’s schedule first.</p>:bookings.map(b=><article className="trainer-client" key={b._id}><h3>{b.clientName}<RemoveClientButton client={{ id: b.clientId, name: b.clientName, role: b.clientRole }} disabled={busy} onRemoved={async message => { setNotice(message); await load(); }}/> · {b.dogName}</h3><p>{b.dogCount||1} dog(s) · #{b._id.slice(-6)} · {b.status}</p>{b.acceptedByThisTrainer||b.trainerAcceptedAt&&!b.trainerAcceptanceRequired?<p className="badge">{b.trainerAcceptanceRequired?'Accepted here · awaiting other trainer':'Client accepted'}</p>:<button type="button" className="button button-small" disabled={busy} onClick={()=>accept(b)}>Accept client</button>}{b.clientId&&<Link className="inline-link" to={`/schedule?client=${b.clientId}`}>Client schedule</Link>}</article>)}
  </details>;
}
