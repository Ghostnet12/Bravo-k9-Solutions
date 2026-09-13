import { useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
export default function RecoveryControl({ person }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (person.role !== 'member' || person.blocked || person.mustChangePassword) return null;
  return <details className="panel"><summary>Account recovery</summary><p>Verify the client’s identity before issuing a private recovery link. Passwords are securely hashed and cannot be displayed. Each link works once and expires after 30 minutes.</p><Notice error>{error}</Notice><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const currentPassword = new FormData(form).get('currentPassword'); form.reset(); setBusy(true); setError(''); setUrl(''); try { const result = await api(`/admin/recovery/${person._id}`, { method: 'POST', body: { currentPassword } }); setUrl(result.url); } catch (err) { setError(err.message); } finally { setBusy(false); } }}><label>Your administrator password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength="128"/></label><button className="button button-small" disabled={busy}>Create recovery link</button></form>{url && <div><label>Private recovery link<input readOnly value={url} onFocus={e => e.currentTarget.select()}/></label><p>Share privately with this client. Generating another link invalidates this one.</p><button className="quiet-button" onClick={() => setUrl('')}>Hide link</button></div>}</details>;
}
