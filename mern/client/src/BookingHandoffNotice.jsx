import { Link, useNavigate } from 'react-router-dom';
import { useBravo } from './context';

export default function BookingHandoffNotice() {
  const { user, hasPendingBookingHandoff, resumeBookingHandoff, discardBookingDraft } = useBravo();
  const navigate = useNavigate();
  if (!hasPendingBookingHandoff) return null;
  return <section className="booking-draft-actions" aria-label="Pending booking handoff">
    <h2>Resume your request?</h2>
    <p>An unfinished request was saved before sign-in. Resume it for {user.name}, or discard it to start again.</p>
    <div className="first-visit-actions">
      <button type="button" className="button" onClick={() => { if (resumeBookingHandoff()) navigate('/portal?resume=1'); }}>Resume request for this account</button>
      <button type="button" className="button button-ghost" onClick={() => { discardBookingDraft(); navigate('/portal?new=1'); }}>Discard pending request</button>
    </div>
    <Link className="booking-guide-link" to="/how-to#chapter-signin">Help with signing in →</Link>
  </section>;
}
