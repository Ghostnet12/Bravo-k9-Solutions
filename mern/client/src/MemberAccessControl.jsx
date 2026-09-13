import { useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import MembershipDateFields, { membershipFromForm } from './MembershipDateFields';
import { businessDate } from '../../shared/manual-membership';

export default function MemberAccessControl({ person, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const access = person.membership;
  if (person.role !== 'member' && !access?.enabled && !access?.manual) return null;
  async function change(enabled, fields = {}) {
    if (!access || busy) return;
    const membership = enabled ? membershipFromForm(fields) : {};
    if (!window.confirm(enabled ? `Save ${person.name}’s membership month starting ${membership.startDate}? This grants only the selected services for that month. No card is charged and existing payments stay unchanged.` : `Remove manual Member access for ${person.name}? Any active paid subscriptions will stay unchanged.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/admin/memberships/${person._id}`, { method: 'PATCH', body: { enabled, expectedRevision: access.revision || 0, ...membership } });
      await onSaved(); setNotice(result.message);
    } catch (e) { setError(e.message); if (e.status === 409) { try { await onSaved(); } catch {} } }
    finally { setBusy(false); }
  }
  return <section className="member-access-control" aria-label={`Member access for ${person.name}`}>
    <div className="member-access-heading"><div><p className="kicker gold">EXISTING CUSTOMERS</p><h3>Member access</h3></div><span className="badge">{!access ? 'Not loaded' : access.manual ? 'Member · manual access' : access.enabled ? 'Manual month · not currently active' : access.paidMembership ? 'Paid membership' : 'Client · no manual access'}</span></div>
    <p>Set an existing customer’s start date, including a date in the past. Select the services already arranged with Bravo. Staff tools and payment records stay separate.</p>
    {access?.startsAt && access?.endsAt && <p className="helper">Saved month: {businessDate(access.startsAt)} → {businessDate(access.endsAt)} (end date exclusive).</p>}
    {access?.paidOnline && <p className="helper">This account also has paid online access. Removing manual access will not cancel that paid access.</p>}
    {person.blocked && <Notice>This account is blocked. Restore it before granting Member access.</Notice>}
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <form onSubmit={e => {e.preventDefault(); change(true, Object.fromEntries(new FormData(e.currentTarget)));}}>
      <MembershipDateFields key={`${person._id}-${access?.revision || 0}`} initialStart={access?.startsAt ? businessDate(access.startsAt) : undefined} initialServices={access?.serviceIds || ['online']} initialDogCount={access?.dogCount || 1} disabled={busy || !access || person.blocked || person.role !== 'member'}/>
      <div className="record-actions"><button type="submit" className="button button-small" disabled={busy || !access || person.blocked || person.role !== 'member'}>{busy ? 'Saving Member access…' : access?.enabled || access?.manual ? 'Save membership dates' : 'Make Member'}</button>
      {(access?.enabled || access?.manual) && <button type="button" className="button button-small button-ghost" disabled={busy} onClick={() => change(false)}>Remove manual Member access</button>}</div>
    </form>
  </section>;
}
