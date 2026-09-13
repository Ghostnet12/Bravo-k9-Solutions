import { DateTime } from 'luxon';
import { formatDate } from './ui';

export default function ScheduleDayGrid({month,onMonth,dayState,onDay,disabled=false}) {
  const start=DateTime.fromISO(`${month}-01`);
  return <><div className="calendar-month-nav"><button type="button" className="quiet-button" aria-label="Previous month" disabled={disabled} onClick={()=>onMonth(start.minus({months:1}).toFormat('yyyy-MM'))}>←</button><h3>{start.toFormat('MMMM yyyy')}</h3><button type="button" className="quiet-button" aria-label="Next month" disabled={disabled} onClick={()=>onMonth(start.plus({months:1}).toFormat('yyyy-MM'))}>→</button></div>
    <div className="saved-calendar edit-calendar" aria-label="Choose training days">
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span className="calendar-weekday" key={d}>{d}</span>)}
      {Array.from({length:start.weekday%7},(_,i)=><span key={`pad-${i}`}/>)}
      {Array.from({length:start.daysInMonth},(_,i)=>{
        const date=start.plus({days:i}).toISODate(),state=dayState(date);
        return <button type="button" key={date} disabled={disabled||state.disabled} aria-pressed={!!state.selected} aria-label={`${formatDate(date)}, ${state.label}`} className={`${state.selected?'has-visits':''} ${state.changed?'pending-day':''}`} onClick={()=>onDay(date)}><strong>{i+1}</strong><small>{state.marker||'\u00a0'}</small></button>;
      })}
    </div></>;
}
