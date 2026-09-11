import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import { accessLabel } from '../../shared/access';

function PersonCard({ person, currentUserId, onSaved }) {
  const [draft, setDraft] = useState(person), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { setDraft(person); }, [person]);
  const update = (name, next) => setDraft(current => ({ ...current, [name]: next }));
  async function save(extra = {}) {
    const grantsOwnerAccess = draft.role === 'owner' && person.role !== 'owner';
    if (grantsOwnerAccess && !window.confirm(`Give ${person.name} full owner-level privileges? They can manage people, change access and pricing, moderate content, and issue refunds. They will appear publicly as staff, not an owner.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/users/${person._id}`, { method: 'PATCH', body: { role: draft.role === person.role ? undefined : draft.role, confirmOwnerAccess: grantsOwnerAccess || undefined, name: draft.name, phone: draft.phone || '', title: draft.title || '', bio: draft.bio || '', showPhone: !!draft.showPhone, ...extra } });
      await onSaved();
      setNotice('Profile and access saved. New permissions apply on the next request; refresh their page to see updated controls.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const isSelf = person._id === currentUserId, protectedAccess = person.isPrimaryOwner || isSelf;
  return <details className="panel owner-person"><summary>{person.name} <span className="badge">{accessLabel(person)}</span>{person.blocked ? " · Blocked" : ""}</summary><div className="record-top"><span className={`badge ${draft.role}`}>{accessLabel(person, draft.role)}</span>{draft.blocked && <span className="badge cancelled">BLOCKED</span>}{draft.mutedUntil && new Date(draft.mutedUntil) > new Date() && <span className="badge">MUTED</span>}</div><Notice error>{error}</Notice><Notice>{notice}</Notice>
    <div className="form-grid"><label>Name<input value={draft.name} onChange={e => update('name', e.target.value)}/></label><label>Email<input value={draft.email} disabled/></label><label>Access<select value={draft.role} disabled={protectedAccess || busy} onChange={e => update('role', e.target.value)}><option value="member">Client</option><option value="staff">Staff</option>{person.isPrimaryOwner ? <option value="owner">Owner</option> : ['staff', 'owner'].includes(person.role) && <option value="owner" disabled={person.blocked}>Administrator — owner privileges</option>}</select></label><label>Phone<input type="tel" value={draft.phone || ''} onChange={e => update('phone', e.target.value)}/></label><label>Public title<input value={draft.title || ''} onChange={e => update('title', e.target.value)} placeholder="Trainer · Behavior specialist"/></label><label className="check-label owner-phone"><input type="checkbox" checked={!!draft.showPhone} onChange={e => update('showPhone', e.target.checked)}/>Show phone under Call a trainer</label></div>
    <p className="helper">{person.isPrimaryOwner ? 'The primary owner’s access is protected.' : isSelf ? 'You cannot remove your own administrator access.' : person.role === 'member' ? 'To grant full access, save as Staff first, then choose Administrator.' : 'Administrator grants owner-level controls without changing the public title or listing this person as an owner. Choose Staff or Client to remove those privileges.'}</p>
    <label>Profile details<textarea rows="3" value={draft.bio || ''} onChange={e => update('bio', e.target.value)} placeholder="Specialties and a short introduction"/></label>
    <div className="record-actions"><button className="button button-small" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save profile & access'}</button>{!protectedAccess && <button className="quiet-button" disabled={busy} onClick={() => { const muted = draft.mutedUntil && new Date(draft.mutedUntil) > new Date(); save({ mutedUntil: muted ? null : new Date(Date.now() + 24 * 3600000).toISOString() }); }}>{draft.mutedUntil && new Date(draft.mutedUntil) > new Date() ? 'Restore messaging' : 'Silence for 24 hours'}</button>}{!protectedAccess && <button className="quiet-button danger-link" disabled={busy} onClick={() => { if (window.confirm(draft.blocked ? 'Restore this account?' : 'Block this account and sign it out?')) save({ blocked: !draft.blocked }); }}>{draft.blocked ? 'Restore account' : 'Block account'}</button>}</div>
  </details>;
}

export default function OwnerPanel({ user }) {
  const [users, setUsers] = useState([]), [query, setQuery] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const load = async (silent = false) => { if (!silent) setLoading(true); try { const data = await api(`/admin/users?q=${encodeURIComponent(query)}`); setUsers(data.users); setError(''); } catch (e) { setError(e.message); if (silent) throw e; } finally { if (!silent) setLoading(false); } };
  useEffect(() => { load(); }, []);
  return <section id="owner-controls"><div className="section-label"><div><p className="kicker gold">ACCESS MANAGEMENT</p><h2>People & permissions.</h2></div></div><p>Find a customer by name or email and promote them to Staff. Grant staff Administrator access for full owner-level privileges while keeping their public trainer title. You can remove those privileges here too.</p><Notice error>{error}</Notice><form className="owner-search panel" onSubmit={e => { e.preventDefault(); load(); }}><label>Find a person<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email"/></label><button className="button button-small" disabled={loading}>Search accounts</button></form>{loading ? <p role="status">Loading accounts…</p> : !users.length ? <div className="panel empty-state"><p>No account matches that search.</p></div> : <div className="owner-people">{users.map(person => <PersonCard key={person._id} person={person} currentUserId={user.id} onSaved={() => load(true)}/>)}</div>}</section>;
}
