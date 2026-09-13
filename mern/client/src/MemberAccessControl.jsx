import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import MembershipDateFields from './MembershipDateFields';
import { manualMonthTerm, membershipDate, membershipToday } from '../../shared/membership-terms';

export default function MemberAccessControl({ person, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const access = person.membership;
  const [startDate, setStartDate] = useState(() => access?.startsAt ? membershipDate(access.startsAt) : membershipToday());
  useEffect(() => { setStartDate(access?.startsAt ? membershipDate(access.startsAt) : membershipToday()); }, [person._id, access?.startsAt]);
  if (person.role !== 'member' && !access?.manual) return null;
  const enabledNow = access?.enabled ?? access?.manual;
  async function change(enabled) {
    if (!access || busy) return;
    let end;
    try { if (enabled) end = membershipDate(manualMonthTerm(startDate).validUntil); } catch (e) { setError(e.message); return; }
    const prompt = enabled
      ? `Save Member access for ${person.name} from ${startDate} until ${end} (end date not included)? This unlocks published online lessons during those dates, with no new charge or staff permissions.`
      : `Remove manual Member access for ${person.name}? Training access and paid subscriptions will stay unchanged.`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/admin/memberships/${person._id}`, { method: 'PATCH', body: { enabled, expectedRevision: access.revision, ...(enabled ? { startDate } : {}) } });
      await onSaved(); setNotice(result.message);
    } catch (e) { setError(e.message); if (e.status === 409) { try { await onSaved(); } catch { /* Preserve the conflict message. */ } } }
    finally { setBusy(false); }
  }
  return <section className="member-access-control" aria-label={`Member access for ${person.name}`}>
    <div className="member-access-heading"><div><p className="kicker gold">EXISTING CUSTOMERS</p><h3>Member access</h3></div><span className="badge">{!access ? 'Not loaded' : access.manual ? 'Member · manual access' : enabledNow ? 'Manual access · outside its dates' : access.paidMembership ? 'Paid membership' : 'Client · no manual access'}</span></div>
    <p>Current customers can create their own account, then you can make them Members here. This access unlocks published online lessons, not staff tools or media editing.</p>
    <p className="helper">No charge or automatic renewal is created. Training, walks, and existing billing stay unchanged. Choose the actual starting day; access expires one calendar month later.</p>
    <MembershipDateFields value={startDate} onChange={setStartDate} disabled={busy || person.blocked}/>
    {access?.endsAt && <p className="helper">Saved access ends {membershipDate(access.endsAt)} (Aberdeen time).</p>}{access?.paidOnline && <p className="helper">This account also has paid online access. Removing manual access will not cancel that subscription.</p>}
    {person.blocked && <Notice>This account is blocked. Restore it before granting Member access.</Notice>}
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <div className="record-actions"><button type="button" className="button button-small" disabled={busy || !access || !startDate || person.blocked || person.role !== 'member'} onClick={() => change(true)}>{busy ? 'Saving Member access…' : enabledNow ? 'Save Member dates' : 'Make Member'}</button>
    {enabledNow && <button type="button" className="button button-small button-ghost" disabled={busy || !access} onClick={() => change(false)}>Remove manual Member access</button>}</div>
  </section>;
}
