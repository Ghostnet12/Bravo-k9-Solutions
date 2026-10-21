import { Link } from 'react-router-dom';
import { formatDate, formatTime } from './ui';
import { trainingFocusName } from '../../shared/catalog';
export default function BookingDraftSummary({ draft, returnLink = false }) {
  if (!draft) return null;
  return <section className="booking-draft-summary" aria-label="Your unsent request">
    <strong>{draft.form.dogName || 'Your dog'} · {draft.dogCount} {draft.dogCount === 1 ? 'dog' : 'dogs'}</strong>
    <p>{draft.trainerName || 'Choose your trainer'}{draft.visits.length > 0 && <> · {formatDate(draft.visits[0].date)}{draft.timeConfirmed && <> at {formatTime(draft.visits[0].time)} Central</>}{draft.visits.length > 1 && <> · {draft.visits.length} visits</>}</>}</p>
    <p>{trainingFocusName(draft.trainingFocus)} · Nothing booked or charged.</p>
    {returnLink && <Link className="inline-link" to="/portal?resume=1">Return to my request →</Link>}
  </section>;
}
