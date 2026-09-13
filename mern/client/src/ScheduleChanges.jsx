import { trainerOptions, trainerChoice } from '../../shared/trainers';
import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import { Notice, formatDate, formatTime } from './ui';
import { ALL_SERVICES } from '../../shared/catalog';
import { TRAINER_HOURS } from '../../shared/trainer-schedule';
import BulkTimes from './BulkTimes';
import ScheduleDayGrid from './ScheduleDayGrid';

const trainingIds=ALL_SERVICES.filter(s=>s.includes.includes('training')).map(s=>s.id);
const at=(date,time)=>DateTime.fromISO(`${date}T${time}`,{zone:'America/Chicago'});
const same=(a,b)=>a.length===b.length && a.every(t=>b.includes(t));

export default function ScheduleChanges({data,initialMonth,onSaved,onClose}) {
  const {user}=useBravo(),isStaff=['staff','owner'].includes(user.role),bookings=data.trainingBookings||[];
  const [bookingId,setBookingId]=useState(bookings[0]?._id||''),[month,setMonth]=useState(initialMonth),[draft,setDraft]=useState({}),[day,setDay]=useState('');
  const [batchDates,setBatchDates]=useState([]);
  const [hours,setHours]=useState({}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
  const [team,setTeam]=useState([]),[chosenTrainer,setChosenTrainer]=useState(user.id),[openWeekends,setOpenWeekends]=useState(true);
  const booking=bookings.find(b=>b._id===bookingId),trainer=trainerChoice(booking)||(isStaff?chosenTrainer:null);
  const canOpen=isStaff && (user.role==='owner'||trainer===user.id);
  const original={};
  for(const v of booking?.visits||[]) if(v.service==='training' && at(v.date,v.time)>DateTime.now()) (original[v.date]||=[]).push(v.time);
  const selected=date=>draft[date]??original[date]??[];
  const additions=[],removals=[];
  for(const [date,times] of Object.entries(draft)) {for(const time of times) if(!original[date]?.includes(time)) additions.push({date,time});for(const time of original[date]||[]) if(!times.includes(time)) removals.push({date,time});}
  const dirty=additions.length+removals.length>0;
  useEffect(()=>{if(!isStaff)return;let current=true;api('/team').then(r=>{if(current)setTeam(trainerOptions(r.team))}).catch(e=>{if(current)setError(e.message)});return()=>{current=false}},[isStaff]);
  const months=[...new Set([month,...batchDates.map(date=>date.slice(0,7)),...(day?[day.slice(0,7)]:[])])].sort().join(',');
  useEffect(()=>{
    let current=true;setLoading(true);setHours({});setError('');
    const refresh=()=>Promise.all(months.split(',').map(value=>{
      const start=DateTime.fromISO(`${value}-01`);
      return api(`/availability?from=${start.toISODate()}&to=${start.endOf('month').toISODate()}${trainer?`&staffId=${trainer}`:''}`);
    })).then(results=>{if(current)setHours(Object.fromEntries(results.flatMap(r=>(r.days||[]).map(d=>[d.date,d]))))}).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setLoading(false)});
    refresh();
    const onFocus=()=>{if(!document.hidden)refresh();};
    const timer=setInterval(onFocus,20000);window.addEventListener('focus',onFocus);
    return()=>{current=false;clearInterval(timer);window.removeEventListener('focus',onFocus)};
  },[months,trainer]);
  function paid(date,time) {const instant=at(date,time);return (!booking?.termStartsAt||instant>=DateTime.fromISO(booking.termStartsAt))&&(!booking?.termEndsAt||instant<DateTime.fromISO(booking.termEndsAt))&&instant>DateTime.now() && instant.diffNow('days').days<=92 && data.terms.some(t=>['active','trialing','canceled'].includes(t.status)&&t.serviceIds.some(id=>trainingIds.includes(id))&&(t.dogCount||1)>=(booking?.dogCount||1)&&t.validFrom&&instant>=DateTime.fromISO(t.validFrom)&&instant<DateTime.fromISO(t.validUntil));}
  function options(date) {
    const weekend=at(date,'12:00').weekday>=6;
    const offered=canOpen&&openWeekends&&weekend?TRAINER_HOURS:(hours[date]?.businessHours||hours[date]?.workingHours||hours[date]?.slots||[]);
    return [...new Set([...(original[date]||[]),...offered.filter(t=>paid(date,t))])].sort();
  }
  function available(date,time) {
    if(original[date]?.includes(time)) return true;
    if(hours[date]?.reservedTimes?.includes(time)) return false;
    return !!hours[date]?.slots?.includes(time) || (canOpen && openWeekends && at(date,'12:00').weekday>=6);
  }
  function toggleDay(date) {
    setError('');setBatchDates(dates=>dates.includes(date)?dates.filter(d=>d!==date):[...dates,date].sort());
  }
  function applyTime(time) {
    if(loading||batchDates.some(date=>!options(date).includes(time)||!available(date,time))) return;
    setDraft(d=>({...d,...Object.fromEntries(batchDates.map(date=>[date,[time]]))}));setError('');
  }
  const pendingDates=batchDates.filter(date=>draft[date]===undefined&&!selected(date).length);
  const editableDates=[...new Set([...Object.keys(original),...Object.keys(draft),...batchDates])].sort();
  async function save(e) {
    e.preventDefault();setBusy(true);setError('');
    try {const r=await api('/client-schedule/changes',{method:'POST',body:{bookingId,revision:booking.updatedAt,additions,removals,note,openWeekends:canOpen&&openWeekends,...(isStaff&&!booking.staffId&&!booking.requestedStaffId?{staffId:chosenTrainer}:{})}});onSaved(r.message)}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="schedule-change-editor" aria-label="Add Days and Times"><button type="button" className="button button-ghost editor-back" disabled={busy} onClick={onClose}>{dirty ? 'Discard changes & back' : 'Back to calendar'}</button><h3>Add Days and Times</h3><p>1. Select all the dates you want. 2. Tap one time below to apply it to those dates. 3. Review and save. To give one date a different time, use “Change one date”.</p>
    {!bookings.length?<p>No paid training request is available to edit. Contact Bravo for help.</p>:<form onSubmit={save}>
      <label>Training request<select aria-label="Training request" value={bookingId} disabled={busy||dirty||batchDates.length>0} onChange={e=>{setBookingId(e.target.value);setDraft({});setDay('')}}>{bookings.map(b=><option key={b._id} value={b._id}>{b.dogName} · #{b._id.slice(-6)}</option>)}</select></label>
      {isStaff&&!booking?.staffId&&!booking?.requestedStaffId&&<label>Trainer<select aria-label="Trainer" value={chosenTrainer} disabled={busy||dirty||batchDates.length>0} onChange={e=>setChosenTrainer(e.target.value)}>{user.role==='owner'?team.map(t=><option key={t.id} value={t.id} disabled={t.disabled}>{t.name}</option>):<option value={user.id}>{user.name}</option>}</select></label>}
      {canOpen&&<label className="check-label"><input type="checkbox" checked={openWeekends} disabled={busy} onChange={e=>setOpenWeekends(e.target.checked)}/>Open the selected weekend times when saving</label>}
      <p className="helper">Times follow the assigned trainer’s working hours. Unavailable times stay visible and are labelled “Reserved” or “Outside trainer hours”. Gold days are selected for editing. Tapping again deselects a date without cancelling its visit. “+” marks a change; “×” marks a cancellation; numbers show saved or drafted visits. {isStaff?'Your note will go to the client and the team.':'Your note will go to all staff, administrators and owners.'}</p>
      {loading&&<p role="status">Checking available times…</p>}
      <ScheduleDayGrid month={month} onMonth={setMonth} disabled={busy||loading} onDay={toggleDay} dayState={date=>{
        const times=selected(date),base=original[date]||[],changed=!same(times,base),free=options(date).filter(time=>available(date,time));
        return {selected:batchDates.includes(date),changed,disabled:!booking||(!times.length&&!base.length&&!free.length),marker:changed?(times.length?'+':'×'):(times.length||''),label:`${times.length} saved or drafted visit${times.length===1?'':'s'}${changed?(times.length?', pending changes':', pending cancellation'):''}`};
      }}/>
      <div className="batch-date-actions"><button type="button" className="quiet-button" disabled={busy||!batchDates.length} onClick={()=>setBatchDates([])}>Clear date selection</button><button type="button" className="quiet-button" disabled={busy||!batchDates.some(date=>selected(date).length)} onClick={()=>{setDraft(d=>({...d,...Object.fromEntries(batchDates.map(date=>[date,[]]))}));setBatchDates([]);setDay('')}}>Cancel visits on selected dates</button></div>
      <BulkTimes dates={batchDates} options={options} available={available} onApply={applyTime} selectedTimes={selected} disabled={busy||loading}/>
      {editableDates.length>0&&<details className="single-date-editor"><summary>Change one date</summary><p>Choose a date, then check its time. Uncheck an old time to replace it; uncheck every time to cancel that day.</p><label>Date to change<select aria-label="Date to change" value={day} disabled={busy} onChange={e=>setDay(e.target.value)}><option value="">Choose one date</option>{editableDates.map(date=><option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
      {day&&<fieldset disabled={busy||loading} className="calendar-time-options"><legend>Times for {formatDate(day)}</legend>{!selected(day).length&&<p>Choose a time to add this day to your draft.</p>}<div className="check-grid">{options(day).map(time=><label className="check-label" key={time}><input type="checkbox" disabled={!selected(day).includes(time)&&!available(day,time)} checked={selected(day).includes(time)} onChange={()=>setDraft(d=>({...d,[day]:selected(day).includes(time)?selected(day).filter(t=>t!==time):[...selected(day),time].sort()}))}/>{formatTime(time)}{!available(day,time)&&!selected(day).includes(time)&&(hours[day]?.reservedTimes?.includes(time)?' · Reserved':' · Outside trainer hours')}</label>)}</div></fieldset>}
      </details>}
      {pendingDates.length>0&&<p role="status">Choose a time for {pendingDates.length} selected {pendingDates.length===1?'date':'dates'} before saving, or clear the date selection.</p>}
      <div className="schedule-change-summary" role="status"><strong>{additions.length} to add · {removals.length} to cancel</strong>{dirty&&<ul>{Object.keys(draft).sort().filter(date=>!same(selected(date),original[date]||[])).map(date=><li key={date}>{formatDate(date)}: {selected(date).length?selected(date).map(formatTime).join(', '):'Day off'}</li>)}</ul>}</div>
      <label>{isStaff?'Note to the client':'Note to Bravo'}<textarea aria-label={isStaff?'Note to the client':'Note to Bravo'} required maxLength={1200} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <p className="helper">Changes within 24 hours follow Bravo’s appointment policy. Cancelling visits does not refund payment or extend the paid month.</p>
      <Notice error>{error}</Notice><div className="record-actions"><button className="button" disabled={busy||loading||!dirty||pendingDates.length>0||!note.trim()}>{busy?'Saving…':'Save changes'}</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>{setDraft({});setBatchDates([]);setDay('');setNote('');setError('')}}>Reset changes</button></div>
    </form>}
    <button type="button" className="quiet-button" disabled={busy} onClick={onClose}>{dirty?'Discard changes & return':'Back to saved schedule'}</button>
  </section>;
}
