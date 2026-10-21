import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBravo } from './context';

export default function BookingHandoffNotice() {
  const { user, hasPendingBookingHandoff, hasLockedBookingDraft, resumeBookingHandoff, discardBookingDraft } = useBravo();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (hasLockedBookingDraft) return <section className="booking-draft-actions" aria-label="Saved account request">
    <h2>Sign in to resume your request.</h2>
    <p>A saved request belongs to a signed-out account. Sign in{pathname === '/account' ? ' below' : ''} with the same account to restore it, or discard it to start again. Its details stay hidden while you are signed out.</p>
    <div className="first-visit-actions">
      {pathname !== '/account' && <Link className="button" to="/account?next=%2Fportal%3Fresume%3D1">Sign in to restore request</Link>}
      <button type="button" className="button button-ghost" onClick={() => { discardBookingDraft(); navigate('/portal?new=1'); }}>Discard saved draft</button>
    </div>
    <Link className="booking-guide-link" to="/how-to#chapter-signin">Help with signing in →</Link>
  </section>;
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
