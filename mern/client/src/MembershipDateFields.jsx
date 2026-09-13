import { useId } from 'react';
import { manualMonthTerm, membershipDate } from '../../shared/membership-terms';

export default function MembershipDateFields({ value, onChange, disabled = false, optional = false, name, label = 'Membership start date' }) {
  const id = useId();
  let end = '';
  try { if (value) end = membershipDate(manualMonthTerm(value).validUntil); } catch { /* The input and server validate the chosen date. */ }
  return <section className="membership-date-fields" aria-label="Membership dates">
    <div className="form-grid">
      <label htmlFor={`${id}-start`}>{label}{optional ? ' (optional)' : ''}<input id={`${id}-start`} name={name} type="date" value={value} required={!optional} disabled={disabled} onChange={event => onChange(event.target.value)} aria-describedby={`${id}-help`}/></label>
      <label htmlFor={`${id}-end`}>Membership end date<input id={`${id}-end`} type="date" value={end} readOnly aria-readonly="true" tabIndex={-1}/></label>
    </div>
    <p id={`${id}-help`} className="helper">Past, present, and future start dates are allowed. One calendar month: January 1 ends February 1. Access ends at the start of the end date in Aberdeen time; month-end dates use the last valid day of the next month.{optional && ' Leave the start date blank to create an account without training membership.'}</p>
    {value && <p className="helper" role="status">{end ? `Membership dates: ${value} through ${end} (end date not included). No payment or automatic renewal is created.` : 'Choose a valid start date.'}</p>}
  </section>;
}
