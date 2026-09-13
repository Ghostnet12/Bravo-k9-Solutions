import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import { Notice, formatDate, formatTime } from './ui';
import { TRAINER_HOURS } from '../../shared/trainer-schedule';
import ScheduleDayGrid from './ScheduleDayGrid';

export default function WeekendSessions() {
  const {user}=useBravo();
  const [team,setTeam]=useState([]),[staffId,setStaffId]=useState(user.id),[month,setMonth]=useState(DateTime.now().setZone('America/Chicago').toFormat('yyyy-MM'));
  const [days,setDays]=useState({}),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{let current=true;api('/team').then(r=>{if(current)setTeam(r.team)}).catch(e=>{if(current)setError(e.message)});return()=>{current=false}},[]);
  const options=date=>TRAINER_HOURS.filter(t=>{const at=DateTime.fromISO(`${date}T${t}`,{zone:'America/Chicago'});return at>DateTime.now()&&at.diffNow('days').days<=92});
  const selected=Object.entries(days).filter(([,hours])=>hours.length);
  async function save(e) {e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await api('/admin/weekend-sessions',{method:'POST',body:{staffId,days:selected.map(([date,hours])=>({date,hours}))}});setNotice(r.message);setDays({});setDay('')}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <details className="panel weekend-tools"><summary>Add Days and Times</summary><p>Open several weekend dates for a trainer. To add or cancel a client’s visits and send a note, open their <a href="#customer-requests">client request below</a> and choose Add Days and Times.</p><Notice>{notice}</Notice><form onSubmit={save}>
    <label>Trainer<select aria-label="Trainer" value={staffId} disabled={busy||selected.length>0} onChange={e=>setStaffId(e.target.value)}>{user.role==='owner'?team.map(t=><option key={t.id} value={t.id}>{t.name}</option>):<option value={user.id}>{user.name}</option>}</select></label>
    <p>Tap Saturdays and Sundays to select them. Tap again to remove them before saving. Set the times for each selected day below.</p>
    <ScheduleDayGrid month={month} onMonth={setMonth} disabled={busy} onDay={date=>{setDay(date);setDays(d=>({...d,[date]:d[date]?.length?[]:(options(date).includes('13:00')?['13:00']:options(date).slice(0,1))}))}} dayState={date=>({selected:days[date]?.length>0,marker:days[date]?.length||'',label:days[date]?.length?'selected to open':'not selected',disabled:DateTime.fromISO(date).weekday<6||!options(date).length})}/>
    {day&&<fieldset disabled={busy}><legend>Times for {formatDate(day)}</legend><div className="check-grid">{options(day).map(t=><label className="check-label" key={t}><input type="checkbox" checked={days[day]?.includes(t)||false} onChange={()=>setDays(d=>({...d,[day]:d[day]?.includes(t)?d[day].filter(x=>x!==t):[...(d[day]||[]),t].sort()}))}/>{formatTime(t)}</label>)}</div></fieldset>}
    <ul>{selected.map(([date,hours])=><li key={date}>{formatDate(date)} · {hours.map(formatTime).join(', ')}</li>)}</ul><Notice error>{error}</Notice>
    <div className="record-actions"><button className="button" disabled={busy||!selected.length}>{busy?'Saving…':'Save weekend hours'}</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>{setDays({});setDay('')}}>Reset changes</button></div>
  </form></details>;
}
