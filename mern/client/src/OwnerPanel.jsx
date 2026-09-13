import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import { accessLabel } from '../../shared/access';
import { Link } from 'react-router-dom';
import MembershipSetup from './MembershipSetup';
import TrainerClients from './TrainerClients';
import RecoveryControl from './RecoveryControl';
import MemberAccessControl from './MemberAccessControl';
import MembershipDateFields from './MembershipDateFields';
import RemoveClientButton from './RemoveClientButton';
import MemberTrainingSetup from './MemberTrainingSetup';

function PersonCard({ person, currentUserId, onSaved, onRemoved }) {
  const [draft, setDraft] = useState(person), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { setDraft(person); }, [person]);
  const update = (name, next) => setDraft(current => ({ ...current, [name]: next }));
  async function save(extra = {}) {
    const grantsOwnerAccess = draft.role === 'owner' && person.role !== 'owner';
    if (grantsOwnerAccess && !window.confirm(`Give ${person.name} full owner-level privileges? They can manage people, change access and pricing, moderate content, and issue refunds. They will appear publicly as staff, not an owner.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/users/${person._id}`, { method: 'PATCH', body: { role: draft.role === person.role ? undefined : draft.role, confirmOwnerAccess: grantsOwnerAccess || undefined, name: draft.name, phone: draft.phone || '', ...(person.role === 'member' ? { dogName: draft.dogName || '', address: draft.address || '', ...(!person.email && draft.email?.trim() ? { email: draft.email.trim() } : {}) } : {}), title: draft.title || '', bio: draft.bio || '', showPhone: !!draft.showPhone, ...extra } });
      await onSaved();
      setNotice('Profile and access saved. New permissions apply on the next request; refresh their page to see updated controls.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const isSelf = person._id === currentUserId, protectedAccess = person.isPrimaryOwner || isSelf;
  const label = person.role === 'member' && (person.membership?.manual || person.membership?.paidMembership) ? 'Member' : accessLabel(person);
  return <details className="panel owner-person"><summary>{person.name}<RemoveClientButton client={person} onRemoved={onRemoved} disabled={busy}/> <span className="badge">{label}</span>{person.blocked ? ' · Blocked' : ''}</summary><div className="record-top"><span className={`badge ${draft.role}`}>{accessLabel(person, draft.role)}</span>{draft.blocked && <span className="badge cancelled">BLOCKED</span>}{draft.mutedUntil && new Date(draft.mutedUntil) > new Date() && <span className="badge">MUTED</span>}</div><Notice error>{error}</Notice><Notice>{notice}</Notice>
    <Link className="button button-small" to={`/schedule?client=${person._id}`}>Schedule & PDF</Link><RecoveryControl person={person}/><MemberAccessControl person={person} onSaved={onSaved}/>
    {['staff','owner'].includes(person.role)&&!person.blocked&&<TrainerClients staffId={person._id}/>}
    <div className="form-grid"><label>Name<input value={draft.name} onChange={e => update('name', e.target.value)}/></label><label>Email<input type="email" value={draft.email || ''} disabled={!!person.email || person.role !== 'member' || busy} maxLength="254" placeholder="Optional — add for client sign-in" onChange={e => update('email', e.target.value)}/></label>{person.role === 'member' && <><label>Dog’s name<input value={draft.dogName || ''} maxLength="80" onChange={e => update('dogName', e.target.value)}/></label><label>Visit address<input value={draft.address || ''} maxLength="300" onChange={e => update('address', e.target.value)}/></label></>}<label>Work permissions<select value={draft.role} disabled={protectedAccess || busy} onChange={e => update('role', e.target.value)}><option value="member">Client — no staff permissions</option><option value="staff">Staff</option>{person.isPrimaryOwner ? <option value="owner">Owner</option> : ['staff', 'owner'].includes(person.role) && <option value="owner" disabled={person.blocked}>Administrator — owner privileges</option>}</select></label><label>Phone<input type="tel" value={draft.phone || ''} onChange={e => update('phone', e.target.value)}/></label><label>Public title<input value={draft.title || ''} onChange={e => update('title', e.target.value)} placeholder="Trainer · Behavior specialist"/></label><label className="check-label owner-phone"><input type="checkbox" checked={!!draft.showPhone} onChange={e => update('showPhone', e.target.checked)}/>Show phone under Call a trainer</label></div>
    <p className="helper">{person.isPrimaryOwner ? 'The primary owner’s access is protected.' : isSelf ? 'You cannot remove your own administrator access.' : person.role === 'member' ? 'Use Make Member above for existing customers. Work permissions are separate: save as Staff first only when granting employee access, then choose Administrator for full management privileges.' : 'Administrator grants owner-level controls without changing the public title or listing this person as an owner. Choose Staff or Client to remove those privileges.'}</p>
    <label>Profile details<textarea rows="3" value={draft.bio || ''} onChange={e => update('bio', e.target.value)} placeholder="Specialties and a short introduction"/></label>
    <div className="record-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => { setDraft(person); setError(''); setNotice('Unsaved profile changes discarded. Saved profile and permissions are unchanged.'); }}>Reset profile edits</button><button className="button button-small" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save profile & access'}</button>{!protectedAccess && <button className="quiet-button" disabled={busy} onClick={() => { const muted = draft.mutedUntil && new Date(draft.mutedUntil) > new Date(); save({ mutedUntil: muted ? null : new Date(Date.now() + 24 * 3600000).toISOString() }); }}>{draft.mutedUntil && new Date(draft.mutedUntil) > new Date() ? 'Restore messaging' : 'Silence for 24 hours'}</button>}{!protectedAccess && <button className="quiet-button danger-link" disabled={busy} onClick={() => { if (window.confirm(draft.blocked ? 'Restore this account?' : 'Block this account and sign it out?')) save({ blocked: !draft.blocked }); }}>{draft.blocked ? 'Restore account' : 'Block account'}</button>}</div>
  </details>;
}

export default function OwnerPanel({ user }) {
  const [users, setUsers] = useState([]), [query, setQuery] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [creating, setCreating] = useState(false), [created, setCreated] = useState(null);
  const [clientStartDate, setClientStartDate] = useState('');
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);
  const [resetVersion, setResetVersion] = useState(0);
  const load = async (silent = false, searchQuery = query) => {
    if (user?.role !== 'owner') return;
    const current = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const data = await api(`/admin/users?q=${encodeURIComponent(searchQuery)}`);
      const access = data.users.length ? await api(`/admin/memberships?ids=${data.users.map(person => person._id).join(',')}`) : { memberships: {} };
      if (current === requestId.current) { setUsers(data.users.map(person => ({ ...person, membership: access.memberships[person._id] }))); setError(''); }
    } catch (e) { if (current === requestId.current) setError(e.message); if (silent) throw e; }
    finally { if (current === requestId.current) setLoading(false); }
  };
  useEffect(() => { load(); return () => { requestId.current++; }; }, [user?.id, user?.role]);
  async function addClient(event) {
    event.preventDefault(); setCreating(true); setError(''); setCreated(null);
    const form = event.currentTarget;
    try {
      const result = await api('/admin/users', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      setCreated(result); form.reset(); setClientStartDate(''); setQuery(result.user.email || result.user.name); setUsers([{ ...result.user, _id: result.user.id, membership: result.membership }]);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  }
  if (user?.role !== 'owner') return null;
  return <section id="owner-controls"><div className="section-label"><div><p className="kicker gold">ACCESS MANAGEMENT</p><h2>People & permissions.</h2></div></div><p>Find an existing customer by name or email, or use assisted onboarding to create a client account for someone who needs help. Member access is separate from Staff and Administrator work permissions.</p><Notice error>{error}</Notice><Notice>{notice}</Notice>
    <MembershipSetup/>
    <details className="panel add-client-panel" key={`add-client-${resetVersion}`}>
      <summary>Add a client</summary>
      <p>Enter the client’s name and dog’s name. Saving creates their member profile, covered training, and online lesson access. No charge is made.</p>
      <form onSubmit={addClient}>
        <div className="form-grid">
          <label>Client name<input name="name" autoComplete="name" minLength="2" maxLength="80" required/></label>
          <label>Dog’s name<input name="dogName" autoComplete="off" minLength="1" maxLength="80" required/></label>
          <label>Email (optional)<input name="email" type="email" autoComplete="email" maxLength="254"/></label>
          <label>Phone (optional)<input name="phone" type="tel" autoComplete="tel" maxLength="30"/></label>
          <label className="full-width">Visit address (optional)<input name="address" autoComplete="street-address" maxLength="300"/></label>
        </div>
        <MembershipDateFields value={clientStartDate} onChange={setClientStartDate} disabled={creating} optional name="membershipStartDate" label="Training membership start date"/>
        <label>Dogs covered by this training month<input name="trainingDogCount" type="number" min="1" max="10" defaultValue="1" disabled={creating}/></label>
        <button className="button button-small" disabled={creating}>{creating ? 'Creating member…' : 'Create client & member'}</button>
      </form>
      {created && <div className="created-client notice" role="status">
        <h3>Client account created.</h3>
        <p><strong>{created.user.name}</strong> · {created.user.dogName}</p>
        <p>{created.membership?.active ? 'Member access is active. Assign a trainer and add days and times below.' : 'Membership is saved for the chosen dates. A past month stays expired; a future month starts on its saved date.'} No charge or automatic renewal was created.</p>
        {created.temporaryPassword ? <>
          <p>The client can sign in with {created.user.email} and the temporary password below.</p>
          <label>Temporary password<input value={created.temporaryPassword} readOnly onFocus={event => event.currentTarget.select()}/></label>
          <p className="helper"><strong>This password is shown only here.</strong> Share it privately and ask the client to change it from their Account page after signing in.</p>
        </> : <p>Email, phone, and address can be added to the profile later. You can manage the member’s schedule now.</p>}
        <button className="quiet-button" type="button" onClick={() => setCreated(null)}>{created.temporaryPassword ? 'Hide temporary password' : 'Dismiss confirmation'}</button>
      </div>}
      {created?.membership?.trainingBookingId && <MemberTrainingSetup person={{ ...created.user, _id: created.user.id }} access={created.membership}/>}
    </details>
    <button type="button" className="quiet-button" disabled={loading || creating} onClick={async () => { setQuery(''); setCreated(null); setClientStartDate(''); setUsers([]); setError(''); setResetVersion(value => value + 1); await load(false, ''); }}>Refresh & reset people search</button><form className="owner-search panel" onSubmit={e => { e.preventDefault(); load(); }}><label>Find a person<input type="search" value={query} maxLength="100" onChange={e => setQuery(e.target.value)} placeholder="Search name or email"/></label><button className="button button-small" disabled={loading}>Search accounts</button></form>{loading ? <p role="status">Loading accounts…</p> : !users.length ? <div className="panel empty-state"><p>No account matches that search.</p></div> : <div className="owner-people">{users.map(person => <PersonCard key={`${person._id}-${resetVersion}`} person={person} currentUserId={user.id} onSaved={() => load(true)} onRemoved={async message => { setNotice(message); await load(true); }}/>)}</div>}</section>;
}
