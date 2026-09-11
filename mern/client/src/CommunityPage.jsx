import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, SetupNotice } from './ui';
import MessageCard from './MessageCard';
import { useChatHistory } from './chat-history';

function Conversation({ path, user, body, setBody, direct = false, team = [], initialRecipient = '' }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [kind, setKind] = useState('message'), [recipientId, setRecipient] = useState(initialRecipient);
  const history = useChatHistory(path);
  const { messages, loading, load, clearing } = history;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function resetHistory(mode = 'clear') {
    const prompt = mode === 'delete' ? 'Permanently DELETE all messages in this conversation for EVERYONE? This cannot be undone. Bookings, accounts and payments are not affected.' : 'Clear the old messages and unsent draft from YOUR history? This stays cleared after signing in again. Other people keep their copies, and new messages will still arrive.';
    if (!window.confirm(prompt)) return;
    setError(''); setNotice('');
    if (await history.clear(mode)) {
      setBody(''); setKind('message'); setRecipient(initialRecipient);
      setNotice(mode === 'delete' ? 'Conversation history permanently deleted.' : 'History and draft cleared for your account. New messages will still arrive.');
    }
  }
  async function send(e) {
    e.preventDefault(); if (clearing || !body.trim()) return; setBusy(true); setError('');
    try {
      await api(path, { method: 'POST', body: { body, ...(path === '/community' ? { kind } : {}), ...(direct && recipientId ? { recipientId } : {}) } });
      setBody(''); await load();
    } catch (err) { if (alive.current) setError(err.message); } finally { if (alive.current) setBusy(false); }
  }
  async function hide(id) {
    if (!window.confirm('Hide this message from the conversation?')) return;
    setBusy(true);
    try { await api(`${path}/${id}`, { method: 'DELETE', body: {} }); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <>
    <Notice error>{error || history.error}</Notice><Notice>{notice}</Notice>
    <div className="thread-tools"><p className="helper">Latest {direct || path !== '/community' ? '200' : '100'} messages · Updates every 10 seconds</p><div className="reset-actions"><button type="button" className="quiet-button" disabled={busy || clearing} onClick={() => resetHistory()}>Refresh & clear history</button>{user.role === 'owner' && <button type="button" className="quiet-button danger-link" disabled={busy || clearing} onClick={() => resetHistory('delete')}>Delete conversation history</button>}</div></div>
    <div className="chat-history panel" role="region" tabIndex={0} aria-label="Conversation">
      {loading ? <p role="status">Loading messages…</p> : messages.length ? messages.map(message => <MessageCard message={message} key={message._id}>
        {user.role === 'owner' && !direct && <button className="quiet-button" disabled={busy || clearing} onClick={() => hide(message._id)}>Hide message</button>}
      </MessageCard>) : <div className="empty-state"><h3>Start the conversation.</h3><p>No messages in your current history. New messages will appear here.</p></div>}
    </div>
    <form className="panel chat-composer" onSubmit={send}>
      {direct && <label>Who would you like to reach?<select value={recipientId} disabled={busy || clearing} onChange={e => setRecipient(e.target.value)}><option value="">Any available Bravo team member</option>{team.map(person => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>}
      {path === '/community' && ['staff', 'owner'].includes(user.role) && <label>Post type<select value={kind} disabled={busy || clearing} onChange={e => setKind(e.target.value)}><option value="message">Conversation</option><option value="announcement">Team announcement</option><option value="alert">Urgent alert</option></select></label>}
      <label>Your message<textarea rows="3" maxLength={direct ? 1200 : 700} required disabled={busy || clearing} value={body} onChange={e => setBody(e.target.value)} placeholder={direct ? 'How can Bravo help?' : 'Write a useful, respectful message…'}/></label>
      <button className="button button-small" disabled={busy || clearing || !body.trim()}>{busy ? 'Sending…' : 'Send message'}</button>
    </form>
  </>;
}

export default function CommunityPage() {
  const { user, authReady } = useBravo(), [params, setParams] = useSearchParams();
  const tab = ['room', 'direct', 'groups'].includes(params.get('tab')) ? params.get('tab') : 'room';
  const [groups, setGroups] = useState([]), [people, setPeople] = useState([]), [team, setTeam] = useState([]), [groupId, setGroupId] = useState('');
  const [drafts, setDrafts] = useState({}), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const activeGroup = groups.find(group => group._id === groupId);
  const refreshGroups = useCallback(async () => { const data = await api('/groups'); setGroups(data.groups); setPeople(data.people); setGroupId(id => data.groups.some(group => group._id === id) ? id : data.groups[0]?._id || ''); }, []);
  useEffect(() => {
    if (!user) { setDrafts({}); return; }
    api('/team').then(data => setTeam(data.team)).catch(e => setError(e.message));
    if (tab === 'groups') refreshGroups().catch(e => setError(e.message));
  }, [user?.id, tab, refreshGroups]);
  async function createGroup(e) {
    e.preventDefault(); const element = e.currentTarget, form = new FormData(element);
    setBusy(true); setError('');
    try {
      const result = await api('/groups', { method: 'POST', body: { name: form.get('name'), members: form.getAll('members') } });
      element.reset(); await refreshGroups(); setGroupId(result.group._id); setNotice('Group created.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function updateGroup(e) {
    e.preventDefault(); const members = new FormData(e.currentTarget).getAll('members');
    setBusy(true); setError('');
    try { await api(`/groups/${groupId}`, { method: 'PATCH', body: { members } }); await refreshGroups(); setNotice('Group members updated.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const path = tab === 'room' ? '/community' : tab === 'direct' ? '/direct' : activeGroup ? `/groups/${groupId}/messages` : null;
  return <Page className="community-page" title="The Bravo community." eyebrow="CONVERSATION, GROUPS & SUPPORT" intro="Meet other owners, keep your group together, or ask the Bravo team for help."><SetupNotice/><Notice error>{error}</Notice><Notice>{notice}</Notice>
    {!authReady ? <p role="status">Checking your account…</p> : !user ? <div className="panel empty-state"><h2>You’re welcome here.</h2><p>Create a profile or sign in to join the conversation.</p><Link className="button" to="/account">Sign in to Bravo</Link></div> : <>
      <nav className="community-tabs" aria-label="Community sections">{[['room', 'Bravo Room'], ['direct', 'Message Bravo'], ['groups', user.role === 'owner' ? 'Groups & moderation' : 'My groups']].map(([id, label]) => <button key={id} disabled={busy} aria-pressed={tab === id} onClick={() => { setParams({ tab: id }); setNotice(''); setError(''); }}>{label}</button>)}</nav>
      <div className="community-layout"><section>
        {tab === 'room' && <div className="panel thread-intro"><h2>Open to every Bravo member.</h2><p>Share progress, ask questions, and encourage each other. Messages show your profile name. Open 24/7; staff are not always online.</p></div>}
        {tab === 'direct' && <div className="panel thread-intro"><p className="kicker gold">PRIVATE SUPPORT</p><h2>Message the Bravo team.</h2><p>This is your shared support thread with Bravo. Only you and the Bravo team can read it, including messages addressed to a particular trainer. For urgent needs, <Link to="/contact">call a trainer</Link>.</p></div>}
        {tab === 'groups' && <><div className="panel"><h2>Your group conversations.</h2><p>Groups are visible to their members and Bravo administrators. Administrators can review and moderate every group. Do not share sensitive personal details.</p><button className="quiet-button" disabled={busy} onClick={() => refreshGroups().catch(e => setError(e.message))}>Refresh groups</button></div><div className="group-switcher">{groups.map(group => <button key={group._id} aria-pressed={groupId === group._id} className={groupId === group._id ? 'selected' : ''} onClick={() => setGroupId(group._id)}>{group.name}</button>)}</div>{activeGroup && <h2>{activeGroup.name}</h2>}{!activeGroup && <div className="panel empty-state"><h3>Bring your people together.</h3><p>Create a group using the form below.</p></div>}</>}
        {path && <Conversation key={user.id + path} path={path} user={user} direct={tab === 'direct'} team={team} initialRecipient={params.get('to') || ''} body={drafts[path] || ''} setBody={value => setDrafts(current => ({ ...current, [path]: value }))}/>}
      </section><aside>
        {tab === 'groups' ? <>
          {activeGroup && (user.role === 'owner' || activeGroup.ownerId === user.id) && <form key={activeGroup._id + activeGroup.members.join(',')} className="panel group-members" onSubmit={updateGroup}><p className="kicker gold">GROUP MEMBERS</p><h2>{activeGroup.name}</h2><div className="member-checks">{people.filter(person => person.id !== activeGroup.ownerId).map(person => <label className="check-label" key={person.id}><input type="checkbox" name="members" value={person.id} defaultChecked={activeGroup.members.includes(person.id)}/>{person.name}</label>)}</div><button className="button button-small button-ghost" disabled={busy}>Update members</button></form>}
          <form className="panel" onSubmit={createGroup}><p className="kicker gold">NEW GROUP</p><h2>Bring people together.</h2><label>Group name<input name="name" minLength="2" maxLength="60" required/></label><div className="member-checks">{people.filter(person => person.id !== user.id).map(person => <label className="check-label" key={person.id}><input type="checkbox" name="members" value={person.id}/>{person.name}</label>)}</div><p className="helper">Add up to 30 people. The group creator and Bravo owner can change members later.</p><button className="button button-ghost" disabled={busy}>Create group</button></form>
        </> : <section className="panel prose"><h3>Keep it welcoming.</h3><p>Be useful, be respectful, and keep addresses, passwords, payment details, and medical records private.</p><p>The owner can hide messages, mute posting, or block an account. This space is available 24/7 but is not monitored continuously.</p><Link className="inline-link" to="/contact">Contact Bravo →</Link></section>}
      </aside></div>
    </>}
  </Page>;
}
