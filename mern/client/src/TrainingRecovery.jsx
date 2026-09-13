import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';
import { membershipDate } from '../../shared/membership-terms';

export default function TrainingRecovery({ client, onSaved }) {
  const [access, setAccess] = useState(null), [dogs, setDogs] = useState(1), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true; setAccess(null); setError('');
    api(`/admin/memberships?ids=${client.id}`).then(result => {
      if (current) { const next = result.memberships[client.id]; setAccess(next); setDogs(next.trainingDogCount || 1); }
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [client.id, revision]);
  async function enable(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api(`/admin/memberships/${client.id}/training-setup`, { method: 'POST', body: { expectedRevision: access.revision, trainingDogCount: Number(dogs) } });
      onSaved(result.message);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="panel training-recovery" aria-label="Enable existing client training">
    <h3>Finish this client’s training setup</h3>
    <Notice error>{error}</Notice>
    {!access && !error && <p role="status">Checking saved membership dates…</p>}
    {error && <button type="button" className="quiet-button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Reload membership</button>}
    {access?.enabled && access.startsAt && access.endsAt ? <form onSubmit={enable}>
      <p>This client has Member access but no training request to schedule. Enable covered training to assign a trainer and add visits.</p>
      <p><strong>Saved membership:</strong> {membershipDate(access.startsAt)} to {membershipDate(access.endsAt)} (end date not included).</p>
      <label>Dogs covered<input type="number" min="1" max="10" step="1" required disabled={busy} value={dogs} onChange={event=>setDogs(event.target.value)}/></label>
      <p className="helper">Keeps these exact dates. No new payment or renewal is created.</p>
      <button className="button" disabled={busy}>{busy ? 'Enabling training…' : 'Enable training & scheduling'}</button>
    </form> : access && <p>Set this client’s membership dates using Make Member in <Link className="inline-link" to="/admin?tab=people">People &amp; permissions</Link>.</p>}
  </section>;
}
