import { useEffect, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { Notice, formatTime } from './ui';
import { TRAINER_HOURS } from '../../shared/trainer-schedule';

export default function WeekendSessions({ bookings, onSaved = () => {} }) {
  const { user } = useBravo();
  const [team,setTeam]=useState([]),[staffId,setStaffId]=useState(user.id),[date,setDate]=useState(''),[hours,setHours]=useState([]);
  const [bookingId,setBookingId]=useState(''),[visitDate,setVisitDate]=useState(''),[time,setTime]=useState(''),[available,setAvailable]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{let current=true;api('/team').then(r=>{if(current)setTeam(r.team)}).catch(e=>{if(current)setError(e.message)});return()=>{current=false}},[]);
  async function run(fn){setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(e.message)}finally{setBusy(false)}}
  const selected=bookings?.find(b=>b._id===bookingId);
  return <details className="panel weekend-tools"><summary>Weekend sessions & extra training visits</summary><p>Open a specific Saturday or Sunday and its session times. The normal weekly schedule stays unchanged.</p><Notice error>{error}</Notice><Notice>{notice}</Notice>
    <form onSubmit={e=>{e.preventDefault();run(async()=>{const r=await api('/admin/weekend-sessions',{method:'POST',body:{staffId,date,hours}});setNotice(r.message);setVisitDate(date);setTime('');setAvailable([]);});}}>
      <label>Trainer<select value={staffId} onChange={e=>setStaffId(e.target.value)}>{user.role!=='owner'?<option value={user.id}>{user.name}</option>:team.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Weekend date<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
      <fieldset><legend>Times to open (Aberdeen time)</legend><div className="check-grid">{TRAINER_HOURS.map(t=><label className="check-label" key={t}><input type="checkbox" checked={hours.includes(t)} onChange={()=>setHours(h=>h.includes(t)?h.filter(x=>x!==t):[...h,t])}/>{formatTime(t)}</label>)}</div></fieldset>
      <button className="button" disabled={busy||!date||!hours.length}>Open weekend hours</button>
    </form>
    {bookings && <form onSubmit={e=>{e.preventDefault();run(async()=>{const r=await api('/admin/training-visits',{method:'POST',body:{bookingId,date:visitDate,time}});setNotice(r.message);setTime('');setAvailable([]);onSaved(r.message);});}}><h3>Add a client’s training visit</h3><p>Choose any available date within the client’s paid month, including newly opened weekends.</p>
      <label>Paid training request<select required value={bookingId} onChange={e=>{setBookingId(e.target.value);setTime('');setAvailable([])}}><option value="">Choose request</option>{bookings.map(b=><option key={b._id} value={b._id}>{b.dogName} · #{b._id.slice(-6)}</option>)}</select></label>
      <label>Training date<input type="date" required value={visitDate} onChange={e=>{setVisitDate(e.target.value);setTime('');setAvailable([])}}/></label>
      <button type="button" className="quiet-button" disabled={busy||!selected||!visitDate} onClick={()=>run(async()=>{const trainer=selected.staffId||selected.requestedStaffId;const r=await api(`/availability?from=${visitDate}&to=${visitDate}${trainer?`&staffId=${trainer}`:''}`);setTime('');setAvailable(r.days?.[0]?.slots||[]);if(!r.days?.[0]?.slots.length)setError('No openings. Check the assigned trainer’s schedule and shared closures.');})}>Find available times</button>
      <label>Session time<select aria-label="Session time" required value={time} onChange={e=>setTime(e.target.value)}><option value="">Choose time</option>{available.map(t=><option key={t} value={t}>{formatTime(t)}</option>)}</select></label><button className="button" disabled={busy||!bookingId||!time}>Add training visit & notify client</button>
    </form>}
  </details>;
}
