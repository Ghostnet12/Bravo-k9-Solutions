import { useEffect, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import './mfa-settings.css';
export default function MfaSettings() {
  const { user, refreshUser } = useBravo();
  const [status, setStatus] = useState(null), [setup, setSetup] = useState(null), [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { let active = true; api('/auth/mfa').then(value => { if (active) setStatus(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, fields = Object.fromEntries(new FormData(form)); form.reset();
    setBusy(true); setError(''); setNotice('');
    try {
      if (status.enabled) {
        await api('/auth/mfa/disable', { method: 'POST', body: fields });
        setStatus(value => ({ ...value, enabled: false })); setNotice('Two-step verification disabled. Other sessions were signed out.'); await refreshUser();
      } else if (setup) {
        const result = await api('/auth/mfa/confirm', { method: 'POST', body: { ...fields, token: setup.token } });
        setSetup(null); setCodes(result.recoveryCodes); setStatus(value => ({ ...value, enabled: true })); await refreshUser();
      } else setSetup(await api('/auth/mfa/enroll', { method: 'POST', body: fields }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="panel mfa-settings" aria-labelledby="mfa-heading">
    <h2 id="mfa-heading">Two-step verification</h2>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!status ? <p>Checking security settings…</p> : codes ? <>
      <h3>Save your recovery codes</h3><p>Each code works once with your password if you lose your authenticator. Store these somewhere safe, separate from this device. They will not be shown again.</p>
      <ul className="mfa-recovery-codes">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
      <button className="button" onClick={() => { setCodes(null); setNotice('Two-step verification is on. Use a fresh authenticator code when you next sign in.'); }}>I saved my recovery codes</button>
    </> : <>
      <p>{status.enabled ? 'On. Your password and an authenticator code are required to sign in.' : 'Add a code from your authenticator app to protect your team account.'}</p>
      {!status.available && <p>Authenticator setup is temporarily unavailable. Contact Bravo.</p>}
      {setup && <div className="mfa-setup"><h3>Add Bravo to your authenticator</h3><p>Choose “Enter a setup key” in your authenticator. Use account <strong>{setup.account}</strong>, this key, and time-based codes (6 digits, 30 seconds).</p><code className="mfa-secret">{setup.secret}</code><p>Enter the app’s current code below to finish. Setup expires after 10 minutes.</p></div>}
      {(status.available || status.enabled) && <form onSubmit={submit}>
        <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required disabled={busy}/></label>
        {(setup || status.enabled) && <label>{status.enabled ? 'Authenticator or recovery code' : 'Authenticator code'}<input name="code" autoComplete="one-time-code" spellCheck={false} autoCapitalize="none" maxLength={40} required disabled={busy}/></label>}
        {status.enabled && <label className="mfa-confirm-disable"><input type="checkbox" required disabled={busy}/>I understand that turning this off removes my extra sign-in protection.</label>}
        <button className="button" disabled={busy}>{busy ? 'Saving…' : status.enabled ? 'Turn off two-step verification' : setup ? 'Confirm and enable' : 'Set up authenticator'}</button>
        {setup && <button type="button" className="button button-ghost" disabled={busy} onClick={() => { setSetup(null); setError(''); }}>Cancel setup</button>}
      </form>}
      {status.enabled && <p>Lost your phone? Sign in with your password and an unused recovery code. To replace your authenticator, turn verification off with a recovery code, then set it up again.</p>}
      {!status.enabled && user.role === 'member' && <p>Enrollment is available to Bravo’s team.</p>}
    </>}
  </section>;
}
