import { trainerOptions, trainerChoice } from '../../shared/trainers';
import { useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import { Notice, formatDate, formatTime } from './ui';
import { ALL_SERVICES } from '../../shared/catalog';
import { TRAINER_HOURS } from '../../shared/trainer-schedule';
import BulkTimes from './BulkTimes';
import CreditedCalendarDays from './CreditedCalendarDays';
import { creditedCalendarDates, planCreditDays, lastCoveredDay, termForDayCredit } from '../../shared/day-credits';
import ScheduleDayGrid from './ScheduleDayGrid';
import CreditActions from './CreditActions';

const trainingIds=ALL_SERVICES.filter(s=>s.includes.includes('training')).map(s=>s.id);
const at=(date,time)=>DateTime.fromISO(`${date}T${time}`,{zone:'America/Chicago'});
const same=(a,b)=>a.length===b.length && a.every(t=>b.includes(t));

export default function ScheduleChanges({data,initialMonth,onSaved,onClose}) {
  const {user}=useBravo(),isStaff=['staff','owner'].includes(user.role),bookings=data.trainingBookings||[];
  const [bookingId,setBookingId]=useState(bookings[0]?._id||''),[month,setMonth]=useState(initialMonth),[draft,setDraft]=useState({}),[day,setDay]=useState('');
  const [batchDates,setBatchDates]=useState([]),[giveCredit,setGiveCredit]=useState(false),[movingCredit,setMovingCredit]=useState(false);
  const pendingCredit=useRef(null);
  const [hours,setHours]=useState({}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
  const [team,setTeam]=useState([]),[chosenTrainer,setChosenTrainer]=useState(user.id),[openWeekends,setOpenWeekends]=useState(false);
  const booking=bookings.find(b=>b._id===bookingId),trainer=trainerChoice(booking)||(isStaff?chosenTrainer:null);
  const canOpen=isStaff && (user.role==='owner'||trainer===user.id);
  const creditDates = creditedCalendarDates(data.terms, data.dayCredits).filter(date => (!booking?.termStartsAt || at(date, '23:59') >= DateTime.fromISO(booking.termStartsAt)) && (!booking?.termEndsAt || at(date, '00:00') < DateTime.fromISO(booking.termEndsAt)));
  const credited = new Set(creditDates);
  const original={};
  for(const v of booking?.visits||[]) if(v.service==='training' && at(v.date,v.time)>DateTime.now()) (original[v.date]||=[]).push(v.time);
  const selected=date=>draft[date]??original[date]??[];
  const additions=[],removals=[];
  for(const [date,times] of Object.entries(draft)) {for(const time of times) if(!original[date]?.includes(time)) additions.push({date,time});for(const time of original[date]||[]) if(!times.includes(time)) removals.push({date,time});}
  const dirty=additions.length+removals.length>0;
  const savedCounts={};
  for(const visit of booking?.visits||[])if(visit.service==='training')savedCounts[visit.date]=(savedCounts[visit.date]||0)+1;
  const savedDates=new Set([...(booking?.visits||[]),...(booking?.cancelledVisits||[])].filter(v=>v.service==='training').map(v=>v.date));
  const missedDates=batchDates.filter(date=>savedDates.has(date));
  const creditTerms=missedDates.map(date=>isStaff?termForDayCredit(data.terms,booking,date):null);
  const creditTerm=creditTerms[0]&&creditTerms.every(term=>term?.stripeId===creditTerms[0].stripeId)?creditTerms[0]:null;
  const alreadyCredited=missedDates.some(date=>(data.dayCredits||[]).some(credit=>credit.missedDate===date||credit.missedDates?.includes(date)));
  const canCredit=!!creditTerm&&missedDates.length===batchDates.length&&!alreadyCredited&&!dirty&&missedDates.length<=366;
  const creditPlan=creditTerm&&missedDates.length<=366?planCreditDays(creditTerm.validUntil,missedDates.length,openWeekends):null;
  const pastSelection=batchDates.some(date=>savedDates.has(date)&&!original[date]?.length&&at(date,'23:59')<DateTime.now());
  const creditMode=giveCredit&&canCredit;
  const hasChanges=dirty||creditMode;
  const showTimes=!creditMode&&!pastSelection;
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
    if(isStaff&&weekend&&!openWeekends)return original[date]||[];
    const offered=canOpen&&openWeekends&&weekend?TRAINER_HOURS:(hours[date]?.businessHours||hours[date]?.workingHours||hours[date]?.slots||[]);
    return [...new Set([...(original[date]||[]),...offered.filter(t=>paid(date,t))])].sort();
  }
  function available(date,time) {
    if(original[date]?.includes(time)) return true;
    if(isStaff&&!openWeekends&&at(date,'12:00').weekday>=6)return false;
    if(hours[date]?.reservedTimes?.includes(time)) return false;
    return !!hours[date]?.slots?.includes(time) || (canOpen && openWeekends && at(date,'12:00').weekday>=6);
  }
  function toggleDay(date) {
    setError('');setGiveCredit(false);setMovingCredit(false);setBatchDates(dates=>dates.includes(date)?dates.filter(d=>d!==date):[...dates,date].sort());
  }
  function applyTime(time) {
    if(creditMode||pastSelection||loading||batchDates.some(date=>!options(date).includes(time)||!available(date,time))) return;
    setDraft(d=>({...d,...Object.fromEntries(batchDates.map(date=>[date,[time]]))}));setError('');
  }
  const pendingDates=creditMode||pastSelection?[]:batchDates.filter(date=>draft[date]===undefined&&!selected(date).length);
  const editableDates=[...new Set([...Object.keys(original),...Object.keys(draft),...batchDates])].sort();
  async function save(e) {
    e.preventDefault();if(busy||!hasChanges||pendingDates.length||(!creditMode&&pastSelection))return;
    setBusy(true);setError('');
    if(creditMode){
      const body={clientId:data.client.id,termId:creditTerm.stripeId,expectedEnd:creditTerm.validUntil,days:missedDates.length,missedDates,includeWeekends:openWeekends,note};
      const signature=JSON.stringify(body);
      if(pendingCredit.current?.signature!==signature)pendingCredit.current={signature,requestKey:crypto.randomUUID()};
      try{
        const r=await api('/client-schedule/credits',{method:'POST',body:{...body,requestKey:pendingCredit.current.requestKey}});
        const focusDate=r.credit.creditDates?.at(-1)||lastCoveredDay(r.credit.afterEnd);
        onSaved(`Saved. Training on ${missedDates.map(formatDate).join(', ')} is cancelled. ${formatDate(focusDate)} is marked Credit at the end of the membership.`,focusDate);
      }catch(e){setError(e.message)}finally{setBusy(false)}
      return;
    }
    try {const r=await api('/client-schedule/changes',{method:'POST',body:{bookingId,revision:booking.updatedAt,additions,removals,note,openWeekends:canOpen&&openWeekends,...(isStaff&&!booking.staffId&&!booking.requestedStaffId?{staffId:chosenTrainer}:{})}});onSaved(r.message)}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="schedule-change-editor" aria-label="Add or Cancel Date"><button type="button" className="button button-ghost editor-back" disabled={busy} onClick={onClose}>{hasChanges ? 'Discard changes & back' : 'Back to calendar'}</button><h3>Add or Cancel Date</h3><ol className="schedule-help" aria-label="Scheduling steps"><li>Select your dates</li><li>{isStaff?'Choose a time, cancel, or give credit':'Choose a time or cancel'}</li><li>Review and save</li></ol><p className="helper">{isStaff?'To credit a missed day, select its date, choose “Give credit for this day”, then save.':'For a different time on one day, open “Change one date” below.'}</p>
    {!bookings.length?<p>No paid training request is available to edit. Contact Bravo for help.</p>:<form onSubmit={save}>
      {bookings.length>1&&<label>Training request<select aria-label="Training request" value={bookingId} disabled={busy||dirty||batchDates.length>0} onChange={e=>{setBookingId(e.target.value);setDraft({});setDay('')}}>{bookings.map(b=><option key={b._id} value={b._id}>{b.dogName} · #{b._id.slice(-6)}</option>)}</select></label>}
      {isStaff&&!booking?.staffId&&!booking?.requestedStaffId&&<label>Trainer<select aria-label="Trainer" value={chosenTrainer} disabled={busy||dirty||batchDates.length>0} onChange={e=>setChosenTrainer(e.target.value)}>{user.role==='owner'?team.map(t=><option key={t.id} value={t.id} disabled={t.disabled}>{t.name}</option>):<option value={user.id}>{user.name}</option>}</select></label>}
      {canOpen&&!movingCredit&&<label className="check-label"><input type="checkbox" checked={openWeekends} disabled={busy} onChange={e=>setOpenWeekends(e.target.checked)}/>Open the selected weekend times when saving</label>}
      <details className="schedule-more-help"><summary>Calendar symbols &amp; trainer availability</summary><p className="helper">Times follow the assigned trainer’s working hours. Unavailable times stay visible and are labelled “Reserved” or “Outside trainer hours”. Gold days are selected for editing. Tapping again deselects a date without cancelling its visit. “+” marks a change; “×” marks a cancellation; numbers show saved or drafted visits. {isStaff?'Your note will go to the client and the team.':'Your note will go to all staff, administrators and owners.'}</p></details>
      {loading&&<p role="status">Checking available times…</p>}
      <CreditedCalendarDays editing dates={creditDates} month={month} onMonth={setMonth}/>
      <ScheduleDayGrid month={month} onMonth={setMonth} disabled={busy||loading} onDay={toggleDay} dayState={date=>{
        const times=selected(date),base=original[date]||[],changed=!same(times,base),free=options(date).filter(time=>available(date,time));
        return {selected:batchDates.includes(date),changed,credited:credited.has(date),disabled:!booking||(!times.length&&!base.length&&!free.length&&!(isStaff&&(savedDates.has(date)||credited.has(date)))),marker:creditMode&&missedDates.includes(date)?'×':changed?(times.length?'+':'×'):(times.length||savedCounts[date]||(savedDates.has(date)?'×':'')),label:`${creditMode&&missedDates.includes(date)?'Cancel and credit, ':''}${savedDates.has(date)?`${savedCounts[date]||0} scheduled training visits, `:''}${times.length} saved or drafted visit${times.length===1?'':'s'}${changed?(times.length?', pending changes':', pending cancellation'):''}${credited.has(date)?', credited membership day':''}`};
      }}/>
      {batchDates.length===1&&<CreditActions embedded key={`move-${batchDates[0]}`} data={data} date={batchDates[0]} disabled={busy||dirty||creditMode} onSaved={onSaved} onBusyChange={setBusy} onOpenChange={setMovingCredit}/>}
      {!movingCredit&&<>
      {isStaff&&<div className="calendar-credit-action">
        <label className="check-label"><input type="checkbox" checked={creditMode} disabled={busy||!canCredit} onChange={e=>{setGiveCredit(e.target.checked);setError('')}}/>{batchDates.length>1?'Give credit for selected days':'Give credit for this day'}</label>
        {creditMode?<div className="credit-preview" role="status"><p>Cancel training on <strong>{missedDates.map(formatDate).join(', ')}</strong>.</p><p>Add <strong>{creditPlan.dates.map(formatDate).join(', ')} · Credit</strong> at the end of the membership.</p></div>:<p className="helper">{dirty?'Save or reset your time changes before giving a day credit.':alreadyCredited?'A selected day has already been credited.':!missedDates.length||missedDates.length!==batchDates.length?'Select scheduled training dates to cancel them and add one credit for each day.':!creditTerm?'This date needs one linked training membership with manual renewal. Ask the owner to check its membership dates.':'Cancel the selected training dates and add their credits at the end. Weekends are skipped unless you turn them on. Your note is optional.'}</p>}
      </div>}
      <div className="batch-date-actions"><button type="button" className="quiet-button" disabled={busy||!batchDates.length} onClick={()=>{setBatchDates([]);setGiveCredit(false)}}>Clear date selection</button>{!creditMode&&<button type="button" className="quiet-button" disabled={busy||pastSelection||!batchDates.some(date=>selected(date).length)} onClick={()=>{setDraft(d=>({...d,...Object.fromEntries(batchDates.map(date=>[date,[]]))}));setBatchDates([]);setDay('')}}>Cancel visits on selected dates</button>}</div>
      {showTimes&&<BulkTimes dates={batchDates} options={options} available={available} onApply={applyTime} selectedTimes={selected} disabled={busy||loading}/>}
      {showTimes&&editableDates.length>0&&<details className="single-date-editor"><summary>Change one date</summary><p>Choose a date, then check its time. Uncheck an old time to replace it; uncheck every time to cancel that day.</p><label>Date to change<select aria-label="Date to change" value={day} disabled={busy} onChange={e=>setDay(e.target.value)}><option value="">Choose one date</option>{editableDates.map(date=><option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
      {day&&<fieldset disabled={busy||loading} className="calendar-time-options"><legend>Times for {formatDate(day)}</legend>{!selected(day).length&&<p>Choose a time to add this day to your draft.</p>}<div className="check-grid">{options(day).map(time=><label className="check-label" key={time}><input type="checkbox" disabled={!selected(day).includes(time)&&!available(day,time)} checked={selected(day).includes(time)} onChange={()=>setDraft(d=>({...d,[day]:selected(day).includes(time)?selected(day).filter(t=>t!==time):[...selected(day),time].sort()}))}/>{formatTime(time)}{!available(day,time)&&!selected(day).includes(time)&&(hours[day]?.reservedTimes?.includes(time)?' · Reserved':' · Outside trainer hours')}</label>)}</div></fieldset>}
      </details>}
      {pendingDates.length>0&&<p role="status">Choose a time for {pendingDates.length} selected {pendingDates.length===1?'date':'dates'} before saving, or clear the date selection.</p>}
      {!creditMode&&<><h4>3. Review &amp; save</h4><div className="schedule-change-summary" role="status"><strong>{additions.length} to add · {removals.length} to cancel</strong>{dirty&&<ul>{Object.keys(draft).sort().filter(date=>!same(selected(date),original[date]||[])).map(date=><li key={date}>{formatDate(date)}: {selected(date).length?selected(date).map(formatTime).join(', '):'Day off'}</li>)}</ul>}</div></>}
      <label>{isStaff?'Note to the client':'Note to Bravo'} (optional)<textarea aria-label={isStaff?'Note to the client':'Note to Bravo'} maxLength={1200} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label>
      {!creditMode&&<p className="helper">Changes within 24 hours follow Bravo’s appointment policy. Cancelling visits does not automatically extend membership. {isStaff ? 'Select scheduled dates and choose “Give credit for this day” to extend the membership.' : 'Bravo can credit days for missed training.'}</p>}
      {!hasChanges && !pendingDates.length && <p className="helper">No changes to save yet. Select dates and choose a time, or cancel selected visits.</p>}<Notice error>{error}</Notice><div className="record-actions"><button className="button" disabled={busy||(!creditMode&&loading)||!hasChanges||pendingDates.length>0||(!creditMode&&pastSelection)}>{busy?'Saving…':creditMode?'Save':'Save changes'}</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>{setDraft({});setBatchDates([]);setGiveCredit(false);setDay('');setNote('');setError('')}}>Reset changes</button></div>
      </>}
    </form>}
    {!movingCredit&&<CreditActions data={data} disabled={busy||hasChanges||batchDates.length>0} onSaved={onSaved} onBusyChange={setBusy}/>}
    <button type="button" className="quiet-button" disabled={busy} onClick={onClose}>{hasChanges?'Discard changes & return':'Back to saved schedule'}</button>
  </section>;
}
