import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Notice } from './ui';
import { api } from './api';
export default function ResetPasswordPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Page title="Reset your password."><Notice error>{error}</Notice>{done ? <><p>Your password has been changed and previous sessions have been signed out.</p><Link to="/account">Sign in with your new password</Link></> : <form className="panel" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget, fields = new FormData(form); if (fields.get('password') !== fields.get('confirm')) return setError('The passwords do not match.'); setBusy(true); setError(''); try { await api('/auth/recover', { method: 'POST', body: { token, password: fields.get('password') } }); form.reset(); window.history.replaceState(null, '', '/reset-password'); setDone(true); } catch (err) { setError(err.message); } finally { setBusy(false); } }}><label>New password<input name="password" type="password" autoComplete="new-password" minLength="12" maxLength="128" required/></label><label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength="12" maxLength="128" required/></label><button className="button" disabled={busy || !token}>Save new password</button></form>}</Page>;
}
