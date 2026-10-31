import { useState } from 'react';
import { Editable } from './SiteContent';
import { formatDate, formatTime } from './ui';
import { previewRoutine } from '../../shared/booking-routine';
import './booking-ease.css';

const weekdays = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday']];
const times = Array.from({ length: 13 }, (_, index) => `${index + 9}:00`.padStart(5, '0'));
export default function RoutinePlanner({ from, to, canUse, existing = [], onApply, disabled, savedPattern = {}, service = 'training', contextKey = '' }) {
  const [pattern, setPattern] = useState({ 1: '17:00', 3: '17:00', 5: '17:00' });
  const [time, setTime] = useState('17:00'), [preview, setPreview] = useState(null), [applied, setApplied] = useState(false);
  const signature = JSON.stringify([from, to, pattern, contextKey]);
  const current = preview?.signature === signature ? preview : null;
  const build = (next = pattern) => { setPattern(next); if (Object.values(next)[0]) setTime(Object.values(next)[0]); setApplied(false); setPreview({ ...previewRoutine({ from, to, pattern: next, existing, canUse, service }), signature: JSON.stringify([from, to, next, contextKey]) }); };
  return <section className="routine-planner" aria-label="Plan a weekly routine">
    <Editable as="h3" contentKey="booking-routine-title" canEditText>Make room for a routine.</Editable>
    <Editable as="p" contentKey="booking-routine-intro" canEditText>Choose your usual days and time. Preview the dates, then add the available visits to your draft.</Editable>
    {Object.keys(savedPattern).length > 0 && <button type="button" className="button button-ghost" disabled={disabled} onClick={() => build(savedPattern)}>Repeat my usual schedule</button>}
    <fieldset disabled={disabled} className="routine-weekdays"><legend>Days that work for you</legend><div>{weekdays.map(([day, label]) => <label className="check-label" key={day}><input type="checkbox" checked={!!pattern[day]} onChange={() => { setPattern(previous => { const next = { ...previous }; if (next[day]) delete next[day]; else next[day] = time; return next; }); setApplied(false); }}/><span>{label}</span></label>)}</div></fieldset>
    <label>Usual visit time<select aria-label="Usual visit time" value={time} disabled={disabled} onChange={event => { const value = event.target.value; setTime(value); setPattern(previous => Object.fromEntries(Object.keys(previous).map(day => [day, value]))); setApplied(false); }}>{times.map(value => <option key={value} value={value}>{formatTime(value)}</option>)}</select></label>
    <p className="helper">{formatDate(from)} – {formatDate(to)} · Central Time. Weekends stay off. Saved visits stay as they are.</p>
    <button type="button" className="button" disabled={disabled || !Object.keys(pattern).length} onClick={() => build()}>Preview my routine</button>
    {current && <div className="routine-preview" aria-live="polite">
      <p><strong>{current.visits.length} available · {current.conflicts.length} need another time · {current.kept.length} already planned</strong></p>
      <ul className="routine-pattern">{weekdays.filter(([day]) => pattern[day]).map(([day, label]) => <li key={day}>{label} · {formatTime(pattern[day])}</li>)}</ul>
      {!current.visits.length && !current.conflicts.length && !current.kept.length && <p>No matching dates in this range. Change the dates or weekdays.</p>}
      {current.visits.length > 0 && <details><summary>Review {current.visits.length} available visits</summary><ul>{current.visits.map(visit => <li key={visit.date}>{formatDate(visit.date)} · {formatTime(visit.time)}</li>)}</ul></details>}
      {current.conflicts.length > 0 && <div className="routine-conflicts"><p>These dates will not be added:</p><ul tabIndex="0" aria-label="Dates that need another time">{current.conflicts.map(visit => <li key={visit.date}><strong>{formatDate(visit.date)} · {formatTime(visit.time)}</strong><br/>{visit.reason}</li>)}</ul><p>Choose alternatives in the calendar below. No substitute time is chosen for you.</p></div>}
      {current.visits.length > 0 && <button type="button" className="button" disabled={disabled || applied} onClick={() => { const fresh = previewRoutine({ from, to, pattern, existing, canUse, service }); setPreview({ ...fresh, signature }); setApplied(onApply(fresh.visits) !== false); }}>{applied ? 'Added to your draft' : 'Add available visits to draft'}</button>}
      {applied && <p role="status">Review your draft below and save when ready. Nothing has been booked or charged.</p>}
    </div>}
  </section>;
}
