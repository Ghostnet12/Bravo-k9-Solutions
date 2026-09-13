import { formatDate, formatTime } from './ui';

export default function BulkTimes({ dates, options, available, onApply, selectedTimes = () => [], disabled = false }) {
  const times = [...new Set(dates.flatMap(options))].sort();
  return <fieldset className="bulk-times" disabled={disabled}>
    <legend>2. Choose one time for all selected dates</legend>
    <p>{dates.length ? `${dates.length} ${dates.length === 1 ? 'date selected' : 'dates selected'}. Tap a time to apply it to every selected date, replacing their current times.` : 'Select dates on the calendar first.'}</p>
    <div className="bulk-time-buttons">{times.map(time => {
      const selected = dates.length > 0 && dates.every(date => selectedTimes(date).includes(time));
      const blocked = dates.filter(date => !options(date).includes(time) || !available(date, time));
      return <div key={time}><button type="button" className={`button button-ghost ${selected ? 'time-selected' : ''}`} aria-pressed={selected} disabled={blocked.length > 0} onClick={() => onApply(time)}>{selected && <span aria-hidden="true">✓ </span>}{formatTime(time)}{selected && <span className="time-selected-label" aria-hidden="true">Selected</span>}</button>{blocked.length > 0 && <small>Unavailable: {blocked.map(formatDate).join(', ')}</small>}</div>;
    })}</div>
    {dates.length > 0 && times.length === 0 && <p>No available times for these dates. Choose different dates or check the trainer’s availability.</p>}
    <p className="helper">Need different times? Open “Change one date” below. Nothing is saved until you save your changes.</p>
  </fieldset>;
}
