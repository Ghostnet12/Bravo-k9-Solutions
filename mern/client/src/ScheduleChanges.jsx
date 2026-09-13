import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import { Notice, formatDate, formatTime } from './ui';
import { ALL_SERVICES } from '../../shared/catalog';
import { TRAINER_HOURS } from '../../shared/trainer-schedule';
import ScheduleDayGrid from './ScheduleDayGrid';

const trainingIds=ALL_SERVICES.filter(s=>s.includes.includes('training')).map(s=>s.id);
const at=(date,time)=>DateTime.fromISO(`${date}T${time}`,{zone:'America/Chicago'});
const same=(a,b)=>a.length===b.length && a.every(t=>b.includes(t));

export default function ScheduleChanges({data,initialMonth,onSaved,onClose}) {
  const {user}=useBravo(),isStaff=['staff','owner'].includes(user.role),bookings=data.trainingBookings||[];
  const [bookingId,setBookingId]=useState(bookings[0]?._id||''),[month,setMonth]=useState(initialMonth),[draft,setDraft]=useState({}),[day,setDay]=useState('');
  const [hours,setHours]=useState({}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
  const [team,setTeam]=useState([]),[chosenTrainer,setChosenTrainer]=useState(user.id),[openWeekends,setOpenWeekends]=useState(true);
  const booking=bookings.find(b=>b._id===bookingId),trainer=booking?.staffId||booking?.requestedStaffId||(isStaff?chosenTrainer:null);
  const canOpen=isStaff && (user.role==='owner'||trainer===user.id);
  const original={};
  for(const v of booking?.visits||[]) if(v.service==='training' && at(v.date,v.time)>DateTime.now()) (original[v.date]||=[]).push(v.time);
  const selected=date=>draft[date]??original[date]??[];
  const additions=[],removals=[];
  for(const [date,times] of Object.entries(draft)) {for(const time of times) if(!original[date]?.includes(time)) additions.push({date,time});for(const time of original[date]||[]) if(!times.includes(time)) removals.push({date,time});}
  const dirty=additions.length+removals.length>0;
  useEffect(()=>{if(!isStaff)return;let current=true;api('/team').then(r=>{if(current)setTeam(r.team)}).catch(e=>{if(current)setError(e.message)});return()=>{current=false}},[isStaff]);
  useEffect(()=>{
    let current=true;setLoading(true);setHours({});setError('');
    const start=DateTime.fromISO(`${month}-01`);
    api(`/availability?from=${start.toISODate()}&to=${start.endOf('month').toISODate()}${trainer?`&staffId=${trainer}`:''}`).then(r=>{if(current)setHours(Object.fromEntries((r.days||[]).map(d=>[d.date,d.slots])))}).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setLoading(false)});
    return()=>{current=false};
  },[month,trainer]);
  function paid(date,time) {const instant=at(date,time);return instant>DateTime.now() && instant.diffNow('days').days<=92 && data.terms.some(t=>['active','trialing','canceled'].includes(t.status)&&t.serviceIds.some(id=>trainingIds.includes(id))&&(t.dogCount||1)>=(booking?.dogCount||1)&&t.validFrom&&instant>=DateTime.fromISO(t.validFrom)&&instant<DateTime.fromISO(t.validUntil));}
  function options(date) {
    const weekend=at(date,'12:00').weekday>=6;
    const offered=canOpen&&openWeekends&&weekend?TRAINER_HOURS:(hours[date]||[]);
    return [...new Set([...(original[date]||[]),...offered.filter(t=>paid(date,t))])].sort();
  }
  function toggleDay(date) {
    setDay(date);setError('');
    if(selected(date).length) setDraft(d=>({...d,[date]:[]}));
    else {
      const available=options(date),usual=booking?.visits.find(v=>v.service==='training')?.time;
      const restored=original[date]?.length?original[date]:[available.includes(usual)?usual:available[0]].filter(Boolean);
      setDraft(d=>({...d,[date]:restored}));
    }
  }
  async function save(e) {
    e.preventDefault();setBusy(true);setError('');
    try {const r=await api('/client-schedule/changes',{method:'POST',body:{bookingId,revision:booking.updatedAt,additions,removals,note,openWeekends:canOpen&&openWeekends,...(isStaff&&!booking.staffId&&!booking.requestedStaffId?{staffId:chosenTrainer}:{})}});onSaved(r.message)}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="schedule-change-editor" aria-label="Add Days and Times"><h3>Add Days and Times</h3><p>Tap a day to add it. Tap again to take it off. Choose times below the calendar, then save all changes together.</p>
    {!bookings.length?<p>No paid training request is available to edit. Contact Bravo for help.</p>:<form onSubmit={save}>
      <label>Training request<select aria-label="Training request" value={bookingId} disabled={busy||dirty} onChange={e=>{setBookingId(e.target.value);setDraft({});setDay('')}}>{bookings.map(b=><option key={b._id} value={b._id}>{b.dogName} · #{b._id.slice(-6)}</option>)}</select></label>
      {isStaff&&!booking?.staffId&&!booking?.requestedStaffId&&<label>Trainer<select aria-label="Trainer" value={chosenTrainer} disabled={busy||dirty} onChange={e=>setChosenTrainer(e.target.value)}>{user.role==='owner'?team.map(t=><option key={t.id} value={t.id}>{t.name}</option>):<option value={user.id}>{user.name}</option>}</select></label>}
      {canOpen&&<label className="check-label"><input type="checkbox" checked={openWeekends} disabled={busy} onChange={e=>setOpenWeekends(e.target.checked)}/>Open the selected weekend times when saving</label>}
      <p className="helper">Gold days are selected. “+” marks an addition; “×” marks a cancellation. {isStaff?'Your note will go to the client and the team.':'Your note will go to all staff, administrators and owners.'}</p>
      {loading&&<p role="status">Checking available times…</p>}
      <ScheduleDayGrid month={month} onMonth={setMonth} disabled={busy||loading} onDay={toggleDay} dayState={date=>{
        const times=selected(date),base=original[date]||[],changed=!same(times,base),available=options(date);
        return {selected:times.length>0,changed,disabled:!booking||(!times.length&&!base.length&&!available.length),marker:changed?(times.length?'+':'×'):(times.length||''),label:`${times.length} selected visit${times.length===1?'':'s'}${changed?(times.length?', pending changes':', pending cancellation'):''}`};
      }}/>
      {day&&<fieldset disabled={busy} className="calendar-time-options"><legend>Times for {formatDate(day)}</legend>{!selected(day).length&&<p>This day is off in your draft. Tap it again to restore it, or choose a time below.</p>}<div className="check-grid">{options(day).map(time=><label className="check-label" key={time}><input type="checkbox" checked={selected(day).includes(time)} onChange={()=>setDraft(d=>({...d,[day]:selected(day).includes(time)?selected(day).filter(t=>t!==time):[...selected(day),time].sort()}))}/>{formatTime(time)}</label>)}</div></fieldset>}
      <div className="schedule-change-summary" role="status"><strong>{additions.length} to add · {removals.length} to cancel</strong>{dirty&&<ul>{Object.keys(draft).sort().filter(date=>!same(selected(date),original[date]||[])).map(date=><li key={date}>{formatDate(date)}: {selected(date).length?selected(date).map(formatTime).join(', '):'Day off'}</li>)}</ul>}</div>
      <label>{isStaff?'Note to the client':'Note to Bravo'}<textarea aria-label={isStaff?'Note to the client':'Note to Bravo'} required maxLength={1200} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <p className="helper">Changes within 24 hours follow Bravo’s appointment policy. Cancelling visits does not refund payment or extend the paid month.</p>
      <Notice error>{error}</Notice><div className="record-actions"><button className="button" disabled={busy||!dirty||!note.trim()}>{busy?'Saving…':'Save changes'}</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>{setDraft({});setDay('');setNote('');setError('')}}>Reset changes</button></div>
    </form>}
    <button type="button" className="quiet-button" disabled={busy} onClick={onClose}>{dirty?'Discard changes & return':'Back to saved schedule'}</button>
  </section>;
}
