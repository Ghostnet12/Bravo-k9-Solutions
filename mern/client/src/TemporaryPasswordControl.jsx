import { useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import { SITE_ORIGIN } from '../../shared/page-metadata';

export default function TemporaryPasswordControl({ person, initialCredential = null }) {
  const [credential, setCredential] = useState(initialCredential), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  if (person.role !== 'member' || person.blocked || !person.mustChangePassword) return null;
  async function replace() {
    if (!window.confirm(`Create a new temporary password for ${person.name}? Any previous temporary password will stop working.`)) return;
    setBusy(true); setError(''); setNotice(''); setCredential(null);
    try { setCredential(await api(`/admin/clients/${person._id || person.id}/temporary-password`, { method: 'POST', body: { confirmReplacement: true } })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function copy(instructions) {
    setError(''); setNotice('');
    const text = instructions ? `Your Bravo account is ready.\nSign in: ${SITE_ORIGIN}/account\nName: ${person.name}${person.email ? `\nOr email: ${person.email}` : ''}\nTemporary password: ${credential.temporaryPassword}\nChoose your own password when prompted. Temporary password expires: ${new Date(credential.temporaryPasswordExpiresAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} (Aberdeen time).` : credential.temporaryPassword;
    try { await navigator.clipboard.writeText(text); setNotice(instructions ? 'Sign-in instructions copied. Paste them into your message to this client.' : 'Temporary password copied.'); }
    catch { setError('Copy is unavailable in this browser. Select the temporary password below and copy it manually.'); }
  }
  return <section className="panel temporary-password" aria-label={`Client sign-in for ${person.name}`}>
    <h3>Client sign-in</h3>
    <p>Sign in with <strong>{person.name}</strong>{person.email && <> or <strong>{person.email}</strong></>} at <a className="inline-link" href="/account">Your Bravo account</a>. The client must create their own password before opening their schedule.</p>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    {credential ? <>
      <label>Temporary password<input className="temporary-password-value" value={credential.temporaryPassword} readOnly autoComplete="off" spellCheck="false" onFocus={e => e.currentTarget.select()}/></label>
      <p className="helper">Expires {new Date(credential.temporaryPasswordExpiresAt).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} · Aberdeen time. Share privately with this client.</p>
      <div className="record-actions"><button type="button" className="button button-small" onClick={() => copy(false)}>Copy temporary password</button><button type="button" className="button button-small button-ghost" onClick={() => copy(true)}>Copy sign-in instructions</button><button type="button" className="quiet-button" onClick={() => { setCredential(null); setNotice(''); }}>Hide temporary password</button></div>
    </> : <>
      <p className="helper">Waiting for the client to choose their password. If you no longer have their temporary password, create a new one to copy and share.</p>
      <button type="button" className="button button-small" disabled={busy} onClick={replace}>{busy ? 'Creating password…' : 'Create new temporary password'}</button>
    </>}
  </section>;
}
