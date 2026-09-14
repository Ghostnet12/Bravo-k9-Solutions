import { useState } from 'react';
import { useBravo } from './context';
import ScheduleChanges from './ScheduleChanges';
import { CreditHistory } from './MembershipDayCredits';
import { DateTime } from 'luxon';
import { api } from './api';
import { formatDate, formatTime, Notice } from './ui';
import CreditedCalendarDays from './CreditedCalendarDays';
import { creditedCalendarDates } from '../../shared/day-credits';
import { trainingFocusName } from '../../shared/catalog';

export default function SavedScheduleCalendar({ data, month, reload, onMonth, startEditing=false, focusDate, onCloseEditor }) {
  const [editData,setEditData]=useState(startEditing?data:null);
  const [day, setDay] = useState(focusDate||data.visits[0]?.date || `${month}-01`);
  const trainingDays = new Set(data.visits.filter(v=>v.service==='training' && v.status!=='cancelled').map(v=>v.date));
  const creditDates = creditedCalendarDates(data.terms, data.dayCredits);
  const credited = new Set(creditDates);
  const start = DateTime.fromISO(`${month}-01`), padding = start.weekday % 7;
  if(editData) return <ScheduleChanges data={editData} initialMonth={month} onSaved={reload} onClose={()=>{setEditData(null);onCloseEditor?.()}}/>;
  return <><button type="button" className="button schedule-edit-toggle" onClick={()=>setEditData(data)}>Add or Cancel Date</button><p className="calendar-legend"><span className="calendar-key"/> {trainingDays.size} training days saved this month. Filled gold highlights saved visits; the outline marks the day you are viewing.</p><CreditedCalendarDays dates={creditDates} month={month} onMonth={onMonth}/><div className="saved-calendar" aria-label="Saved monthly schedule">
    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <span className="calendar-weekday" key={d}>{d}</span>)}
    {Array.from({ length: padding }, (_,i) => <span key={`empty-${i}`}/>)}
    {Array.from({ length: start.daysInMonth }, (_,i) => {
      const date = start.plus({days:i}).toISODate(), visits = data.visits.filter(v => v.date === date), active = visits.filter(v => v.status !== 'cancelled');
      return <button type="button" key={date} aria-pressed={day === date} aria-label={`${formatDate(date)}, ${active.length} visit${active.length === 1 ? '' : 's'}${visits.length > active.length ? ', cancelled visits' : ''}${credited.has(date) ? ', credited membership day' : ''}`} className={`${active.length ? 'has-visits' : ''} ${credited.has(date) ? 'credited-day' : ''}`} onClick={() => setDay(date)}><strong>{i+1}</strong>{visits.length > 0 && <small>{active.length || '×'}<span className="sr-only"> visits</span></small>}{credited.has(date) && <small className="credit-day-label">Credit</small>}</button>;
    })}
  </div><p className="calendar-day-heading" role="status">{formatDate(day)} · Select a highlighted day to see its visits.</p>
  {!data.visits.some(v => v.date === day) && <p className="calendar-day-heading">{credited.has(day) ? 'Credited membership day. No visit booked yet—choose Add or Cancel Date to select a trainer’s available time.' : 'No saved visits on this day.'}</p>}
  <CreditHistory credits={data.dayCredits}/><div className="schedule-list">{data.visits.map((visit,i) => <article hidden={visit.date !== day} className="schedule-visit" key={`${visit.bookingId}-${i}`}>
    <h3>{formatDate(visit.date)} · {formatTime(visit.time)}</h3><p>{visit.service === 'training' ? trainingFocusName(visit.trainingFocus) : visit.service} · {visit.dogName}</p><p>Trainer: {visit.trainer}</p><p><strong>{visit.status.toUpperCase()}</strong> · {visit.paymentStatus === 'covered' ? 'Membership covered' : visit.paymentStatus} · #{visit.bookingId.slice(-6)}</p>
    {visit.status !== 'cancelled' && <VisitEditor visit={visit} reload={reload}/>}
  </article>)}</div></>;
}
function VisitEditor({ visit, reload }) {
  const {user}=useBravo(),isStaff=['staff','owner'].includes(user.role);
  const [action, setAction] = useState(''), [date, setDate] = useState(visit.date), [time, setTime] = useState(''), [hours, setHours] = useState([]), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const editable = ['paid','covered'].includes(visit.paymentStatus) && ['requested','confirmed'].includes(visit.status) && DateTime.fromISO(`${visit.date}T${visit.time}`, {zone:'America/Chicago'}) > DateTime.now();
  async function findTimes() {
    setBusy(true); setError(''); setTime(''); setHours([]);
    try { const result = await api(`/availability?from=${date}&to=${date}${visit.trainerChoice || visit.staffId ? `&staffId=${visit.trainerChoice || visit.staffId}` : ''}`); const values = result.days?.[0]?.slots || []; setHours(values); if (!values.length) setError('No available times on this date. Choose another day.'); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/client-schedule/visit', {method:'POST',body:{ bookingId:visit.bookingId, action, original:{date:visit.date,time:visit.time,service:visit.service}, ...(action === 'change' ? {replacement:{date,time,service:visit.service}} : {}), note }}); setAction(''); setNote(''); reload(isStaff?'Saved. The client and Bravo team have been notified.':'Saved. The Bravo team has been notified.'); } catch(e) { setError(e.message); } finally {setBusy(false);}
  }
  return <div className="schedule-visit-actions"><div className="record-actions">{editable && <><button type="button" className="quiet-button" onClick={() => setAction('change')}>Change day or time</button><button type="button" className="quiet-button" onClick={() => setAction('cancel')}>Cancel this visit</button></>}<button type="button" className="quiet-button" onClick={() => setAction('note')}>{isStaff?'Note to client':'Note to staff'}</button></div>
  {action && <form onSubmit={submit}><h4>{action === 'change' ? 'Change visit' : action === 'cancel' ? 'Cancel visit' : 'Note to the team'}</h4><Notice error>{error}</Notice>
    {action === 'change' && <><label>New date<input type="date" required value={date} onChange={e => {setDate(e.target.value);setTime('');setHours([]);}}/></label><button type="button" className="quiet-button" disabled={busy || !date} onClick={findTimes}>Find available times</button><label>New time<select required value={time} onChange={e => setTime(e.target.value)}><option value="">Choose an available time</option>{hours.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}</select></label></>}
    <label>{isStaff?'Note to the client and Bravo team':'Note to all staff, administrators and owners'}{action !== 'note' && ' (optional)'}<textarea aria-label={isStaff?'Note to the client and Bravo team':'Note to all staff, administrators and owners'} required={action === 'note'} maxLength={1200} value={note} onChange={e => setNote(e.target.value)}/></label>
    {action !== 'note' && <p className="helper">Changes within 24 hours are subject to Bravo’s appointment policy. Cancelling a visit does not refund payment or extend your membership.</p>}
    <button className="button" disabled={busy || (action === 'note' && !note.trim())}>{busy ? 'Saving…' : action === 'cancel' ? 'Confirm cancellation & notify team' : 'Save & notify team'}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setAction('')}>Keep current visit</button>
  </form>}</div>;
}
