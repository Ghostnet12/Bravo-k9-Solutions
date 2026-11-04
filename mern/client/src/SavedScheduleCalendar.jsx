import { useEffect, useState } from 'react';
import { useBravo } from './context';
import ScheduleChanges from './ScheduleChanges';
import CreditActions from './CreditActions';
import { CreditHistory } from './MembershipDayCredits';
import { DateTime } from 'luxon';
import { api } from './api';
import { formatDate, formatTime, Notice } from './ui';
import CreditedCalendarDays from './CreditedCalendarDays';
import { creditedCalendarDates } from '../../shared/day-credits';
import { trainingFocusName } from '../../shared/catalog';

export default function SavedScheduleCalendar({ data, month, reload, onMonth, startEditing=false, focusDate, onCloseEditor }) {
  const [creditBusy,setCreditBusy]=useState(false);
  const [editData,setEditData]=useState(null), [openingData]=useState(data);
  const [startRoutine,setStartRoutine]=useState(false), [editDate,setEditDate]=useState(''), [view,setView]=useState('calendar');
  const now = DateTime.now().setZone('America/Chicago');
  const upcoming = data.visits.filter(visit => ['confirmed','requested'].includes(visit.status) && DateTime.fromISO(`${visit.date}T${visit.time}`, {zone:'America/Chicago'}) > now).sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const activeEditData=editData||(startEditing?openingData:null);
  const [day, setDay] = useState(focusDate || upcoming[0]?.date || (now.toFormat('yyyy-MM') === month ? now.toISODate() : `${month}-01`));
  const trainingDays = new Set(data.visits.filter(v=>v.service==='training' && v.status!=='cancelled' && v.status!=='waitlisted').map(v=>v.date));
  const creditDates = creditedCalendarDates(data.terms, data.dayCredits), credited = new Set(creditDates);
  const start = DateTime.fromISO(`${month}-01`), padding = start.weekday % 7;
  const canPlan = data.trainingBookings?.length > 0;
  const visibleVisits = view === 'upcoming' ? upcoming : data.visits.filter(visit => visit.date === day);
  function openEditor({routine=false,date=''}={}) { setStartRoutine(routine);setEditDate(date);setEditData(data); }
  if(activeEditData) return <ScheduleChanges data={activeEditData} initialMonth={month} initialDate={editDate} startRoutine={startRoutine} onSaved={reload} onClose={()=>{setEditData(null);setStartRoutine(false);setEditDate('');onCloseEditor?.()}}/>;
  return <>
    {upcoming[0] && <div className="schedule-next-visit"><div><span className="kicker gold">NEXT VISIT THIS MONTH</span><h3>{formatDate(upcoming[0].date)} · {formatTime(upcoming[0].time)}</h3><p>{upcoming[0].dogName} · {upcoming[0].trainer}</p><VisitStatus status={upcoming[0].status}/></div><button type="button" className="button button-ghost" onClick={()=>{setDay(upcoming[0].date);setView('calendar');requestAnimationFrame(()=>document.getElementById('selected-schedule-day')?.scrollIntoView({block:'start',behavior:'smooth'}));}}>View or change visit</button></div>}
    <div className="schedule-edit-actions"><button type="button" className="button schedule-edit-toggle" disabled={creditBusy || !canPlan} onClick={()=>openEditor()}>Add or Cancel Date</button>{canPlan && <button type="button" className="button button-ghost" disabled={creditBusy} onClick={()=>openEditor({routine:true})}>Plan my weekly routine</button>}</div>
    {!canPlan && <p>No training schedule is ready to edit yet. Bravo will help you get started from your account.</p>}
    <div className="calendar-month-nav"><button type="button" className="quiet-button" aria-label="Previous month" disabled={creditBusy} onClick={()=>onMonth(start.minus({months:1}).toFormat('yyyy-MM'))}>←</button><h3>{start.toFormat('MMMM yyyy')}</h3><button type="button" className="quiet-button" aria-label="Next month" disabled={creditBusy} onClick={()=>onMonth(start.plus({months:1}).toFormat('yyyy-MM'))}>→</button></div>
    <div className="schedule-mode-switch" role="group" aria-label="Schedule view"><button type="button" aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}>Calendar</button><button type="button" aria-pressed={view==='upcoming'} onClick={()=>setView('upcoming')}>Upcoming visits ({upcoming.length})</button></div>
    <CreditedCalendarDays dates={creditDates} month={month} onMonth={onMonth}/>
    {view==='calendar' && <><p className="calendar-legend"><span className="calendar-key"/> {trainingDays.size} training days this month. Tap any date to see visits or add one. Each visit shows whether Bravo has confirmed it.</p><div className="saved-calendar" aria-label="Saved monthly schedule">
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <span className="calendar-weekday" key={d}>{d}</span>)}
      {Array.from({ length: padding }, (_,i) => <span key={`empty-${i}`}/>)}
      {Array.from({ length: start.daysInMonth }, (_,i) => {
        const date = start.plus({days:i}).toISODate(), visits = data.visits.filter(v => v.date === date), active = visits.filter(v => v.status !== 'cancelled');
        return <button type="button" key={date} disabled={creditBusy} aria-current={date===now.toISODate()?'date':undefined} aria-pressed={day === date} aria-label={`${formatDate(date)}, ${active.length} visit${active.length === 1 ? '' : 's'}${visits.length > active.length ? ', cancelled visits' : ''}${credited.has(date) ? ', credited membership day' : ''}`} className={`${active.length ? 'has-visits' : ''} ${credited.has(date) ? 'credited-day' : ''}`} onClick={() => setDay(date)}><strong>{i+1}</strong>{visits.length > 0 && <small>{active.length || '×'}<span className="sr-only"> visits</span></small>}{credited.has(date) && <small className="credit-day-label">Credit</small>}</button>;
      })}
    </div><div className="schedule-day-toolbar" id="selected-schedule-day"><h3 role="status">{formatDate(day)}</h3>{canPlan && day >= now.toISODate() && <button type="button" className="button button-ghost" disabled={creditBusy} onClick={()=>openEditor({date:day})}>Add a visit on this date</button>}</div>
    {!visibleVisits.length && <p>{credited.has(day) ? 'Credited membership day. Choose an available time to schedule a visit.' : 'No saved visits on this day.'}</p>}
    <CreditActions key={`move-${day}`} data={data} date={day} onSaved={reload} disabled={creditBusy} onBusyChange={setCreditBusy}/></>}
    {view==='upcoming' && !visibleVisits.length && <p>No upcoming visits in this month. Choose another month or plan your next dates.</p>}
    <div className="schedule-list">{data.visits.map((visit,i) => <article hidden={!visibleVisits.includes(visit)} className="schedule-visit" key={`${visit.bookingId}-${visit.date}-${visit.time}-${i}`}>
      <h3>{formatDate(visit.date)} · {formatTime(visit.time)}</h3><p>{visit.service === 'training' ? trainingFocusName(visit.trainingFocus) : visit.service} · {visit.dogName}</p><p>Trainer: {visit.trainer}</p><VisitStatus status={visit.status}/><p className="helper">{visit.paymentStatus === 'covered' ? 'Covered by your membership' : visit.paymentStatus === 'paid' ? 'Paid' : 'Payment pending'} · Central Time</p>
      {visit.status !== 'cancelled' && <VisitEditor visit={visit} reload={reload}/>}
    </article>)}</div>
    <CreditActions data={data} onSaved={reload} disabled={creditBusy} onBusyChange={setCreditBusy}/><CreditHistory credits={data.dayCredits}/>
  </>;
}
function VisitStatus({status}) { return <span className={`visit-status visit-status-${status}`}>{({confirmed:'Confirmed',requested:'Awaiting Bravo confirmation',waitlisted:'Waiting list · no time reserved',cancelled:'Cancelled'})[status] || status}</span>; }
function VisitEditor({ visit, reload }) {
  const {user}=useBravo(),isStaff=['staff','owner'].includes(user.role);
  const [action, setAction] = useState(''), [date, setDate] = useState(visit.date), [time, setTime] = useState(''), [hours, setHours] = useState([]), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const editable = ['paid','covered'].includes(visit.paymentStatus) && ['requested','confirmed'].includes(visit.status) && DateTime.fromISO(`${visit.date}T${visit.time}`, {zone:'America/Chicago'}) > DateTime.now();
  useEffect(() => {
    if (action !== 'change' || !date) return;
    let current = true; setBusy(true);setError('');setTime('');setHours([]);
    api(`/availability?from=${date}&to=${date}${visit.trainerChoice || visit.staffId ? `&staffId=${visit.trainerChoice || visit.staffId}` : ''}`)
      .then(result => { if(current) { const values=result.days?.[0]?.slots || [];setHours(values);if(!values.length)setError('No available times on this date. Choose another day.'); } })
      .catch(error => {if(current)setError(error.message);}).finally(()=>{if(current)setBusy(false);});
    return () => {current=false;};
  }, [action,date,visit.trainerChoice,visit.staffId]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/client-schedule/visit', {method:'POST',body:{ bookingId:visit.bookingId, action, original:{date:visit.date,time:visit.time,service:visit.service}, ...(action === 'change' ? {replacement:{date,time,service:visit.service}} : {}), note }}); setAction(''); setNote(''); reload(isStaff?'Saved. The client and Bravo team have been notified.':'Saved. The Bravo team has been notified.'); } catch(e) { setError(e.message); } finally {setBusy(false);}
  }
  return <div className="schedule-visit-actions"><div className="record-actions">{editable && <><button type="button" className="quiet-button" onClick={() => setAction('change')}>Change day or time</button><button type="button" className="quiet-button" onClick={() => setAction('cancel')}>Cancel this visit</button></>}<button type="button" className="quiet-button" onClick={() => setAction('note')}>{isStaff?'Note to client':'Note to staff'}</button></div>
  {action && <form onSubmit={submit}><h4>{action === 'change' ? 'Change visit' : action === 'cancel' ? 'Cancel visit' : 'Note to the team'}</h4><Notice error>{error}</Notice>
    {action === 'change' && <><label>New date<input type="date" required min={DateTime.now().setZone('America/Chicago').toISODate()} value={date} onChange={e => {setDate(e.target.value);setTime('');setHours([]);}}/></label><p className="helper" role="status">{busy ? 'Checking available times…' : 'Available times load when you choose a date.'}</p><label>New time<select required disabled={busy || !hours.length} value={time} onChange={e => setTime(e.target.value)}><option value="">Choose an available time</option>{hours.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}</select></label></>}
    <label>{isStaff?'Note to the client and Bravo team':'Note to all staff, administrators and owners'}{action !== 'note' && ' (optional)'}<textarea aria-label={isStaff?'Note to the client and Bravo team':'Note to all staff, administrators and owners'} required={action === 'note'} maxLength={1200} value={note} onChange={e => setNote(e.target.value)}/></label>
    {action !== 'note' && <p className="helper">Changes within 24 hours are subject to Bravo’s appointment policy. Cancelling a visit does not refund payment or extend your membership.</p>}
    <button className="button" disabled={busy || (action === 'note' && !note.trim()) || (action === 'change' && (!time || !hours.includes(time)))}>{busy ? 'Saving…' : action === 'cancel' ? 'Confirm cancellation & notify team' : 'Save & notify team'}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setAction('')}>Keep current visit</button>
  </form>}</div>;
}
