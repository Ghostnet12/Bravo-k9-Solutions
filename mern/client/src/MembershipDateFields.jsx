import { useState } from 'react';
import { businessDate, manualMembershipDates } from '../../shared/manual-membership';

export default function MembershipDateFields({ optional = false, initialStart, initialServices = [optional ? 'training' : 'online'], initialDogCount = 1, disabled = false }) {
  const [enabled, setEnabled] = useState(!optional);
  const [start, setStart] = useState(initialStart || businessDate());
  const [services, setServices] = useState(initialServices.includes('training') ? (initialServices.includes('online') ? 'training,online' : 'training') : 'online');
  let dates, error;
  try { dates = manualMembershipDates(start); } catch (e) { error = e.message; }
  return <fieldset className="membership-date-fields" disabled={disabled}>
    <legend>{optional ? 'Existing client membership (optional)' : 'Membership month'}</legend>
    {optional && <label className="check-label"><input type="checkbox" name="manualMembershipEnabled" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>Set this client’s membership dates now</label>}
    {enabled && <><div className="form-grid">
      <label>Membership start date<input aria-label="Membership start date" name="membershipStartDate" type="date" value={start} onChange={e => setStart(e.target.value)} required/><small>Past, present, or future dates are allowed.</small></label>
      <label>Membership end date<input aria-label="Membership end date" type="date" value={dates?.endDate || ''} readOnly/><small>Automatically ends at the start of this date, Aberdeen time.</small></label>
      <label>Member services<select aria-label="Member services" name="membershipServices" value={services} onChange={e => setServices(e.target.value)}><option value="training">Training membership</option><option value="online">Online lessons</option><option value="training,online">Training and online lessons</option></select></label>
      {services.includes('training') && <label>Dogs covered<input aria-label="Dogs covered" type="number" name="membershipDogCount" min="1" max="10" defaultValue={initialDogCount} required/></label>}
    </div><p className="helper" role="status">{error || (dates.expired ? 'This month has already ended. It will be saved as expired, without granting current access.' : start > businessDate() ? 'Access begins on the selected future start date.' : 'Access covers the selected month only; entering an older date does not restart the month today.')}</p>
    <p className="helper">One calendar month: January 1 → February 1. For shorter months, the end date uses the last valid day. This records access you approve; it does not charge a card or change existing payments.</p></>}
  </fieldset>;
}
export function membershipFromForm(fields) {
  return { startDate: fields.membershipStartDate, serviceIds: (fields.membershipServices || 'online').split(','), dogCount: Number(fields.membershipDogCount || 1) };
}
