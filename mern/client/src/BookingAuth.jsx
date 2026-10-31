import { useLayoutEffect, useRef, useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import { Editable } from './SiteContent';
import { Notice } from './ui';

// Credentials remain only in this form and go to the existing authentication
// endpoint. The existing account-scoped draft handoff owns the transition.
export default function BookingAuth({ mode, onMode }) {
  const { refreshUser, beginBookingHandoff, config } = useBravo();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [mfaRequired, setMfaRequired] = useState(false), [authenticated, setAuthenticated] = useState(false);
  const inFlight = useRef(false);
  const panel = useRef(null);
  useLayoutEffect(() => {
    const heading = panel.current?.querySelector('h3');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    panel.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);
  async function authenticate(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const form = event.currentTarget;
    try {
      beginBookingHandoff();
      if (!authenticated) {
        await api(`/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
        setAuthenticated(true); form.reset();
      }
      await refreshUser({ claimBookingDraft: true });
    } catch (e) { if (e.code === 'MFA_REQUIRED') setMfaRequired(true); setError(e.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section ref={panel} className="booking-inline-auth" aria-label="Sign in without leaving booking">
    <Editable as="h3" contentKey="booking-inline-auth-title" canEditText>Keep your visit right here.</Editable>
    <p>Your dog, trainer and time stay saved. Signing in or creating an account does not send a request or take payment.</p>
    {!authenticated && <div className="tab-row">{['register', 'login'].map(value => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => { onMode(value); setError(''); setMfaRequired(false); }}>{value === 'register' ? 'Create account' : 'Sign in'}</button>)}</div>}
    <Notice error>{error}</Notice>
    <form onSubmit={authenticate}>
      {!authenticated && <fieldset disabled={busy} className="booking-auth-fields">
        {mode === 'register' && <label>Your name<input name="name" autoComplete="name" minLength="2" maxLength="80" required/></label>}
        <label>{mode === 'register' ? 'Email' : 'Name or email'}<input key={mode} name={mode === 'register' ? 'email' : 'identifier'} type={mode === 'register' ? 'email' : 'text'} autoComplete={mode === 'register' ? 'email' : 'username'} maxLength="254" required onChange={() => setMfaRequired(false)}/></label>
        {mode === 'login' && <p className="helper">Clients can use their name or email. Staff must use their email.</p>}
        <label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength="12" maxLength="128" required/></label>
        {mode === 'register' && <p className="helper">Use at least 12 characters to keep your account secure.</p>}
        {mode === 'login' && mfaRequired && <label>Authenticator or recovery code<input name="code" autoComplete="one-time-code" autoFocus maxLength="40" required spellCheck="false" autoCapitalize="none"/></label>}
      </fieldset>}
      <button className="button" disabled={busy || !config?.connected}>{busy ? 'Checking your account…' : authenticated ? 'Retry account check' : mode === 'register' ? 'Create my account' : 'Sign in'}</button>
    </form>
    <p className="helper">Need account recovery? <a href="tel:+16058242767">Contact Bravo</a> to verify your identity.</p>
  </section>;
}
