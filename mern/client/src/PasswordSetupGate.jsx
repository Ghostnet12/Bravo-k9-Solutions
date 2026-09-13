import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice } from './ui';

export default function PasswordSetupGate({ children }) {
  const { user, refreshUser, signOut } = useBravo(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!user?.mustChangePassword) return children;
  async function save(event) {
    event.preventDefault(); setError('');
    const form = event.currentTarget, fields = new FormData(form);
    if (fields.get('password') !== fields.get('confirm')) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await api('/auth/password-setup', { method: 'POST', body: { password: fields.get('password') } });
      form.reset(); await refreshUser(); navigate('/schedule', { replace: true });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Page title="Create your password." eyebrow="WELCOME TO BRAVO" intro={`Welcome, ${user.name}. Choose your own password to open your membership and saved schedule.`}>
    <section className="panel account-auth"><Notice error>{error}</Notice>
      <form onSubmit={save}>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength="12" maxLength="128" required autoFocus/></label>
        <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength="12" maxLength="128" required/></label>
        <p className="helper">Use at least 12 characters. Choose a password different from the temporary one Bravo sent you. Your temporary password will stop working when you save.</p>
        <button className="button" disabled={busy}>{busy ? 'Saving password…' : 'Save password & open schedule'}</button>
      </form>
      <button type="button" className="quiet-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await signOut(); navigate('/account'); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Sign out</button>
    </section>
  </Page>;
}
