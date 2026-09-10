import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';

function PersonCard({ person, currentUserId, onSaved }) {
  const [draft, setDraft] = useState(person), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setDraft(person); }, [person]);
  const update = (name, next) => setDraft(current => ({ ...current, [name]: next }));
  async function save(extra = {}) {
    setBusy(true); setError('');
    try {
      await api(`/admin/users/${person._id}`, { method: 'PATCH', body: { role: draft.role === 'owner' ? undefined : draft.role, name: draft.name, phone: draft.phone || '', title: draft.title || '', bio: draft.bio || '', showPhone: !!draft.showPhone, ...extra } });
      await onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const isOwner = person.role === 'owner', isSelf = person._id === currentUserId;
  return <details className="panel owner-person"><summary>{person.name} <span className="badge">{person.role}</span>{person.blocked ? " · Blocked" : ""}</summary><div className="record-top"><span className={`badge ${draft.role}`}>{draft.role.toUpperCase()}</span>{draft.blocked && <span className="badge cancelled">BLOCKED</span>}{draft.mutedUntil && new Date(draft.mutedUntil) > new Date() && <span className="badge">MUTED</span>}</div><Notice error>{error}</Notice>
    <div className="form-grid"><label>Name<input value={draft.name} onChange={e => update('name', e.target.value)}/></label><label>Email<input value={draft.email} disabled/></label><label>Access<select value={draft.role} disabled={isOwner} onChange={e => update('role', e.target.value)}><option value="member">Client</option><option value="staff">Staff</option>{isOwner && <option value="owner">Owner</option>}</select></label><label>Phone<input type="tel" value={draft.phone || ''} onChange={e => update('phone', e.target.value)}/></label><label>Public title<input value={draft.title || ''} onChange={e => update('title', e.target.value)} placeholder="Trainer · Behavior specialist"/></label><label className="check-label owner-phone"><input type="checkbox" checked={!!draft.showPhone} onChange={e => update('showPhone', e.target.checked)}/>Show phone under Call a trainer</label></div>
    <label>Profile details<textarea rows="3" value={draft.bio || ''} onChange={e => update('bio', e.target.value)} placeholder="Specialties and a short introduction"/></label>
    <div className="record-actions"><button className="button button-small" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save profile & access'}</button>{!isOwner && <button className="quiet-button" disabled={busy} onClick={() => { const muted = draft.mutedUntil && new Date(draft.mutedUntil) > new Date(); save({ mutedUntil: muted ? null : new Date(Date.now() + 24 * 3600000).toISOString() }); }}>{draft.mutedUntil && new Date(draft.mutedUntil) > new Date() ? 'Restore messaging' : 'Silence for 24 hours'}</button>}{!isSelf && !isOwner && <button className="quiet-button danger-link" disabled={busy} onClick={() => { if (window.confirm(draft.blocked ? 'Restore this account?' : 'Block this account and sign it out?')) save({ blocked: !draft.blocked }); }}>{draft.blocked ? 'Restore account' : 'Block account'}</button>}</div>
  </details>;
}

export default function OwnerPanel({ user }) {
  const [users, setUsers] = useState([]), [query, setQuery] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const data = await api(`/admin/users?q=${encodeURIComponent(query)}`); setUsers(data.users); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return <section id="owner-controls"><div className="section-label"><div><p className="kicker gold">OWNER ONLY</p><h2>People & permissions.</h2></div></div><p>Find any registered account, promote it to staff, update public contact details, or remove access. Staff never receive owner controls.</p><Notice error>{error}</Notice><form className="owner-search panel" onSubmit={e => { e.preventDefault(); load(); }}><label>Find a person<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email"/></label><button className="button button-small">Search accounts</button></form>{loading ? <p role="status">Loading accounts…</p> : !users.length ? <div className="panel empty-state"><p>No account matches that search.</p></div> : <div className="owner-people">{users.map(person => <PersonCard key={person._id} person={person} currentUserId={user.id} onSaved={load}/>)}</div>}</section>;
}
