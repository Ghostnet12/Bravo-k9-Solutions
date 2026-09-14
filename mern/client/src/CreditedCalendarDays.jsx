import { formatDate } from './ui';

export default function CreditedCalendarDays({ dates, month, onMonth, editing = false }) {
  if (!dates.length) return null;
  const inMonth = dates.filter(date => date.startsWith(month));
  const months = [...new Set(dates.map(date => date.slice(0, 7)))];
  return <div className="credited-calendar-summary" role="status">
    <p><span className="calendar-key credit-key"/><strong>{inMonth.length} credited membership {inMonth.length === 1 ? 'day' : 'days'} highlighted this month.</strong></p>
    <p>Gold borders and “Credit” mark extra membership days. {editing ? 'Filled gold marks dates selected for editing. Choose a time below to book them.' : 'Filled gold marks a saved visit. Choose Add or Cancel Date to book a trainer’s available time.'}</p>
    {onMonth && months.filter(value => value !== month).map(value => <button key={value} type="button" className="quiet-button" onClick={() => onMonth(value)}>View credited days in {new Date(`${value}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</button>)}
    <p className="helper">Latest credited day: {formatDate(dates.at(-1))}. Times must be before the membership’s end time.</p>
  </div>;
}
