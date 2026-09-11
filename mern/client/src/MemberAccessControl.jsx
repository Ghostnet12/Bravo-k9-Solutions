import { useState } from 'react';
import { api } from './api';
import { Notice } from './ui';

export default function MemberAccessControl({ person, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const access = person.membership;
  if (person.role !== 'member' && !access?.manual) return null;
  async function change() {
    if (!access || busy) return;
    const enabled = !access.manual;
    const prompt = enabled
      ? `Make ${person.name} a Member? This unlocks published member lessons without creating a charge or giving them staff permissions.`
      : `Remove manual Member access for ${person.name}? Any active paid subscriptions will stay unchanged.`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/admin/memberships/${person._id}`, { method: 'PATCH', body: { enabled, expectedRevision: access.revision } });
      await onSaved(); setNotice(result.message);
    } catch (e) { setError(e.message); if (e.status === 409) { try { await onSaved(); } catch { /* Keep the actionable conflict message. */ } } }
    finally { setBusy(false); }
  }
  return <section className="member-access-control" aria-label={`Member access for ${person.name}`}>
    <div className="member-access-heading"><div><p className="kicker gold">EXISTING CUSTOMERS</p><h3>Member access</h3></div><span className="badge">{!access ? 'Not loaded' : access.manual ? 'Member · manual access' : access.paidMembership ? 'Paid membership' : 'Client · no manual access'}</span></div>
    <p>Current customers can create their own account, then you can make them Members here. Member access unlocks published online lessons, not staff tools or media editing.</p>
    <p className="helper">No charge or new subscription is created. Training, walks, and existing billing stay unchanged. Manual access lasts until an administrator or owner removes it.</p>
    {access?.paidOnline && <p className="helper">This account also has paid online access. Removing manual access will not cancel or remove that subscription.</p>}
    {person.blocked && <Notice>This account is blocked. Restore it before granting Member access.</Notice>}
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <button type="button" className={`button button-small ${access?.manual ? 'button-ghost' : ''}`} disabled={busy || !access || (!access.manual && (person.blocked || person.role !== 'member'))} onClick={change}>{busy ? 'Saving Member access…' : access?.manual ? 'Remove manual Member access' : 'Make Member'}</button>
  </section>;
}
