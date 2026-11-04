import RoutinePlanner from './RoutinePlanner';
import { formatDate, formatTime } from './ui';

export default function GuidedRoutine({ from, to, min, max, onRange, visits, onVisits, days, disabled, trainerId, onReview, onBack }) {
  return <div className="guided-routine">
    <p>Choose your weekdays and a usual time. We’ll check each date with your trainer before you review the request.</p>
    <div className="form-grid">
      <label>First day<input type="date" aria-label="Routine first day" min={min} max={max} value={from} onChange={event => onRange(event.target.value, to)}/></label>
      <label>Last day<input type="date" aria-label="Routine last day" min={from} max={max} value={to} onChange={event => onRange(from, event.target.value)}/></label>
    </div>
    <RoutinePlanner from={from} to={to} existing={visits} contextKey={JSON.stringify([trainerId, days, visits])} disabled={disabled || !from || !to || from > to}
      canUse={(date, time) => days.find(day => day.date === date)?.slots.includes(time) ? true : 'Your trainer is unavailable at this time.'}
      onApply={next => { if (visits.length + next.length > 62) return false; onVisits([...visits, ...next].sort((a,b) => a.date.localeCompare(b.date))); return true; }}/>
    {visits.length > 0 && <section className="routine-draft" aria-label="Your planned visits">
      <h3>{visits.length} visits in your request</h3>
      <p>Change a time or remove a day here. These dates are still an unsent request.</p>
      <ul>{visits.map(visit => <li key={visit.date}>
        <strong>{formatDate(visit.date)}</strong>
        <label><span className="sr-only">Time on {visit.date}</span><select value={visit.time} disabled={disabled} onChange={event => onVisits(visits.map(item => item.date === visit.date ? { ...item, time: event.target.value } : item))}>
          {[...new Set([visit.time, ...(days.find(day => day.date === visit.date)?.slots || [])])].sort().map(time => <option key={time} value={time}>{formatTime(time)}</option>)}
        </select></label>
        <button type="button" className="quiet-button" disabled={disabled} aria-label={`Remove visit on ${visit.date}`} onClick={() => onVisits(visits.filter(item => item.date !== visit.date))}>Remove</button>
      </li>)}</ul>
    </section>}
    <div className="guided-step-actions"><button type="button" className="quiet-button" onClick={onBack}>← Change trainer</button><button type="button" className="button" disabled={disabled || !visits.length} onClick={onReview}>Review my request →</button></div>
  </div>;
}
