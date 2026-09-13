import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import MembershipDateFields from './MembershipDateFields';
import MemberTrainingSetup from './MemberTrainingSetup';
import { manualMonthTerm, membershipDate, membershipToday } from '../../shared/membership-terms';

export default function MemberAccessControl({ person, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const access = person.membership;
  const [startDate, setStartDate] = useState(() => access?.startsAt ? membershipDate(access.startsAt) : membershipToday());
  const [dogCount, setDogCount] = useState(access?.trainingDogCount || 1), [savedAccess, setSavedAccess] = useState(null);
  useEffect(() => { setStartDate(access?.startsAt ? membershipDate(access.startsAt) : membershipToday()); }, [person._id, access?.startsAt]);
  useEffect(() => { setDogCount(access?.trainingDogCount || 1); setSavedAccess(null); }, [person._id, access?.revision, access?.trainingDogCount]);
  if (person.role !== 'member' && !access?.manual) return null;
  const enabledNow = access?.enabled ?? access?.manual;
  async function change(enabled) {
    if (!access || busy) return;
    let end;
    try { if (enabled) end = membershipDate(manualMonthTerm(startDate).validUntil); } catch (e) { setError(e.message); return; }
    const prompt = enabled
      ? `Save training membership for ${person.name}, covering ${dogCount} dog(s), from ${startDate} until ${end} (end date not included)? This enables covered training and published online lessons. No charge, automatic renewal, or staff permissions are created.`
      : `Remove manual Member access for ${person.name}? Training access and paid subscriptions will stay unchanged.`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/admin/memberships/${person._id}`, { method: 'PATCH', body: { enabled, expectedRevision: (savedAccess || access).revision, ...(enabled ? { startDate, trainingDogCount: Number(dogCount) } : {}) } });
      setSavedAccess(result.membership); setNotice(result.message);
      try { await onSaved(); } catch { setError('Membership saved. The people list could not refresh; reload it when you finish setting up training.'); }
    } catch (e) { setError(e.message); if (e.status === 409) { try { await onSaved(); } catch { /* Preserve the conflict message. */ } } }
    finally { setBusy(false); }
  }
  return <section className="member-access-control" aria-label={`Member access for ${person.name}`}>
    <div className="member-access-heading"><div><p className="kicker gold">EXISTING CUSTOMERS</p><h3>Member access</h3></div><span className="badge">{!access ? 'Not loaded' : access.manual ? 'Member · manual access' : enabledNow ? 'Manual access · outside its dates' : access.paidMembership ? 'Paid membership' : 'Client · no manual access'}</span></div>
    <p>Set this customer’s training membership dates and dogs covered. After saving, assign David, Ashley, or David and Ashley, then add their days and times below.</p>
    <p className="helper">Includes covered training and published online lessons. No charge or automatic renewal is created. Choose the actual starting day; access expires one calendar month later.</p>
    <MembershipDateFields value={startDate} onChange={setStartDate} disabled={busy || person.blocked}/>
    <label>Dogs covered by this training membership<input type="number" min="1" max="10" step="1" required value={dogCount} disabled={busy || person.blocked} onChange={event => setDogCount(event.target.value)}/></label>
    {access?.endsAt && <p className="helper">Saved access ends {membershipDate(access.endsAt)} (Aberdeen time).</p>}{access?.paidOnline && <p className="helper">This account also has paid online access. Removing manual access will not cancel that subscription.</p>}
    {person.blocked && <Notice>This account is blocked. Restore it before granting Member access.</Notice>}
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    <div className="record-actions"><button type="button" className="button button-small" disabled={busy || !access || !startDate || !Number.isInteger(Number(dogCount)) || Number(dogCount) < 1 || Number(dogCount) > 10 || person.blocked || person.role !== 'member'} onClick={() => change(true)}>{busy ? 'Saving membership…' : enabledNow ? 'Save Member dates' : 'Make Member'}</button>
    {enabledNow && <button type="button" className="button button-small button-ghost" disabled={busy || !access} onClick={() => change(false)}>Remove manual online access</button>}</div>
    {(savedAccess || access)?.trainingBookingId && <MemberTrainingSetup key={`${person._id}-${(savedAccess || access).revision}`} person={person} access={savedAccess || access}/>}
  </section>;
}
