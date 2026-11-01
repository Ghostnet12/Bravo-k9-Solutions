import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BookingDraftSummary from './BookingDraftSummary';
import './booking-continuity.css';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice } from './ui';

export default function PasswordSetupGate({ children }) {
  const { user, refreshUser, signOut, bookingDraft, hasPendingBookingHandoff } = useBravo(), navigate = useNavigate(), { pathname, search } = useLocation();
  const next = new URLSearchParams(search).get('next');
  const transportNext = /^\/transport(?:\?[^#]*)?$/.test(next || '') ? next : pathname === '/transport' ? pathname + search : null;
  const returningBooking = (!!bookingDraft || hasPendingBookingHandoff) && (pathname === '/portal' || /^\/portal(?:\?|$)/.test(next || '') || (pathname === '/account' && !next));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // The public guide explains first-time password setup without unlocking member screens.
  if (!user?.mustChangePassword || pathname === '/how-to') return children;
  async function save(event) {
    event.preventDefault(); setError('');
    const form = event.currentTarget, fields = new FormData(form);
    if (fields.get('password') !== fields.get('confirm')) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await api('/auth/password-setup', { method: 'POST', body: { password: fields.get('password') } });
      form.reset(); await refreshUser(); navigate(transportNext || (returningBooking ? '/portal?resume=1' : '/schedule'), { replace: true });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Page title="Create your password." eyebrow="WELCOME TO BRAVO" intro={`Welcome, ${user.name}. ${transportNext ? 'Choose your own password to open your private transport portal.' : returningBooking ? 'Choose your own password to return to your saved training request.' : 'Choose your own password to open your membership and saved schedule.'}`}>
    {returningBooking && (bookingDraft ? <BookingDraftSummary draft={bookingDraft}/> : <p>Your unfinished request is saved. After creating your password, choose whether to resume it for this account or discard it.</p>)}
    <section className="panel account-auth"><Notice error>{error}</Notice>
      <form onSubmit={save}>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength="12" maxLength="128" required autoFocus/></label>
        <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength="12" maxLength="128" required/></label>
        <p className="helper">Use at least 12 characters. Choose a password different from the temporary one Bravo sent you. Your temporary password will stop working when you save.</p>
        <button className="button" disabled={busy}>{busy ? 'Saving password…' : transportNext ? 'Save password & open transport' : returningBooking ? 'Save password & return to request' : 'Save password & open schedule'}</button>
      </form>
      {returningBooking && <Link className="booking-guide-link" to="/how-to#chapter-signin">Help creating your password →</Link>}
      <button type="button" className="quiet-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await signOut(); navigate('/account'); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Sign out</button>
    </section>
  </Page>;
}
