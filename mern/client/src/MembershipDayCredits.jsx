import { DateTime } from 'luxon';
import { formatDate } from './ui';
import { MEMBERSHIP_ZONE } from '../../shared/membership-terms';
import './day-credits.css';
import { creditPlacementDates } from '../../shared/day-credits';

const dateLabel = value => DateTime.fromJSDate(new Date(value), { zone: MEMBERSHIP_ZONE }).toFormat('LLL d, yyyy · h:mm a');

export function CreditHistory({ credits = [] }) {
  if (!credits.length) return null;
  return <details className="credit-history"><summary>Credited days history</summary><ul>{credits.map(credit => <li key={credit._id}>
    <strong>+{credit.days} {credit.days === 1 ? 'day' : 'days'}{credit.reason&&credit.reason!=='Other'&&<> · {credit.reason}</>}</strong> — saved {dateLabel(credit.createdAt)}.
    {(credit.missedDate||credit.missedDates?.length>0) && <> Missed training: {(credit.missedDates||[credit.missedDate]).map(formatDate).join(', ')}.</>} Original extension ended {dateLabel(credit.afterEnd)}. Credit dates: {creditPlacementDates(credit).map(formatDate).join(', ')}.
    {credit.note && <p>{credit.note}</p>}
  </li>)}</ul></details>;
}
