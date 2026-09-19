import { Editable } from './SiteContent';
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
    <Editable as="div" contentKey="communitypage-1" className="thread-tools"><Editable as="p" contentKey="communitypage-2" className="helper">Latest {direct || path !== '/community' ? '200' : '100'} messages · Updates every 10 seconds</Editable><Editable as="div" contentKey="communitypage-3" className="reset-actions"><Editable as="button" contentKey="communitypage-4" canEditText type="button" className="quiet-button" disabled={busy || clearing} onClick={() => resetHistory()}>Refresh & clear history</Editable>{user.role === 'owner' && <Editable as="button" contentKey="communitypage-5" canEditText type="button" className="quiet-button danger-link" disabled={busy || clearing} onClick={() => resetHistory('delete')}>Delete conversation history</Editable>}</Editable></Editable>
    <Editable as="div" contentKey="communitypage-6" className="chat-history panel" role="region" tabIndex={0} aria-label="Conversation">
      {loading ? <Editable as="p" contentKey="communitypage-7" canEditText role="status">Loading messages…</Editable> : messages.length ? messages.map(message => <MessageCard message={message} key={message._id}>
        {user.role === 'owner' && !direct && <Editable as="button" contentKey="communitypage-8" canEditText className="quiet-button" disabled={busy || clearing} onClick={() => hide(message._id)}>Hide message</Editable>}
      </MessageCard>) : <Editable as="div" contentKey="communitypage-9" className="empty-state"><Editable as="h3" contentKey="communitypage-10" canEditText>Start the conversation.</Editable><Editable as="p" contentKey="communitypage-11" canEditText>No messages in your current history. New messages will appear here.</Editable></Editable>}
    </Editable>
    <form className="panel chat-composer" onSubmit={send}>
      {direct && <Editable as="label" contentKey="communitypage-12">Who would you like to reach?<select value={recipientId} disabled={busy || clearing} onChange={e => setRecipient(e.target.value)}><option value="">Any available Bravo team member</option>{team.map(person => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></Editable>}
      {path === '/community' && ['staff', 'owner'].includes(user.role) && <Editable as="label" contentKey="communitypage-13">Post type<select value={kind} disabled={busy || clearing} onChange={e => setKind(e.target.value)}><option value="message">Conversation</option><option value="announcement">Team announcement</option><option value="alert">Urgent alert</option></select></Editable>}
      <Editable as="label" contentKey="communitypage-14">Your message<textarea rows="3" maxLength={direct ? 1200 : 700} required disabled={busy || clearing} value={body} onChange={e => setBody(e.target.value)} placeholder={direct ? 'How can Bravo help?' : 'Write a useful, respectful message…'}/></Editable>
      <Editable as="button" contentKey="communitypage-15" className="button button-small" disabled={busy || clearing || !body.trim()}>{busy ? 'Sending…' : 'Send message'}</Editable>
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
    {!authReady ? <Editable as="p" contentKey="communitypage-16" canEditText role="status">Checking your account…</Editable> : !user ? <Editable as="div" contentKey="communitypage-17" className="panel empty-state"><Editable as="h2" contentKey="communitypage-18" canEditText>You’re welcome here.</Editable><Editable as="p" contentKey="communitypage-19" canEditText>Create a profile or sign in to join the conversation.</Editable><Editable as={Link} contentKey="communitypage-20" canEditLink canEditText className="button" to="/account">Sign in to Bravo</Editable></Editable> : <>
      <Editable as="nav" contentKey="communitypage-21" className="community-tabs" aria-label="Community sections">{[['room', 'Bravo Room'], ['direct', 'Message Bravo'], ['groups', user.role === 'owner' ? 'Groups & moderation' : 'My groups']].map(([id, label]) => <Editable as="button" contentKey="communitypage-22" key={id} disabled={busy} aria-pressed={tab === id} onClick={() => { setParams({ tab: id }); setNotice(''); setError(''); }}>{label}</Editable>)}</Editable>
      <Editable as="div" contentKey="communitypage-23" className="community-layout"><Editable as="section" contentKey="communitypage-24">
        {tab === 'room' && <Editable as="div" contentKey="communitypage-25" className="panel thread-intro"><Editable as="h2" contentKey="communitypage-26" canEditText>Open to every Bravo member.</Editable><Editable as="p" contentKey="communitypage-27" canEditText>Share progress, ask questions, and encourage each other. Messages show your profile name. Open 24/7; staff are not always online.</Editable></Editable>}
        {tab === 'direct' && <Editable as="div" contentKey="communitypage-28" className="panel thread-intro"><Editable as="p" contentKey="communitypage-29" canEditText className="kicker gold">PRIVATE SUPPORT</Editable><Editable as="h2" contentKey="communitypage-30" canEditText>Message the Bravo team.</Editable><Editable as="p" contentKey="communitypage-31">This is your shared support thread with Bravo. Only you and the Bravo team can read it, including messages addressed to a particular trainer. For urgent needs, <Editable as={Link} contentKey="communitypage-32" canEditLink canEditText to="/contact">call a trainer</Editable>.</Editable></Editable>}
        {tab === 'groups' && <><Editable as="div" contentKey="communitypage-33" className="panel"><Editable as="h2" contentKey="communitypage-34" canEditText>Your group conversations.</Editable><Editable as="p" contentKey="communitypage-35" canEditText>Groups are visible to their members and Bravo administrators. Administrators can review and moderate every group. Do not share sensitive personal details.</Editable><Editable as="button" contentKey="communitypage-36" canEditText className="quiet-button" disabled={busy} onClick={() => refreshGroups().catch(e => setError(e.message))}>Refresh groups</Editable></Editable><Editable as="div" contentKey="communitypage-37" className="group-switcher">{groups.map(group => <Editable as="button" contentKey="communitypage-38" key={group._id} aria-pressed={groupId === group._id} className={groupId === group._id ? 'selected' : ''} onClick={() => setGroupId(group._id)}>{group.name}</Editable>)}</Editable>{activeGroup && <Editable as="h2" contentKey="communitypage-39">{activeGroup.name}</Editable>}{!activeGroup && <Editable as="div" contentKey="communitypage-40" className="panel empty-state"><Editable as="h3" contentKey="communitypage-41" canEditText>Bring your people together.</Editable><Editable as="p" contentKey="communitypage-42" canEditText>Create a group using the form below.</Editable></Editable>}</>}
        {path && <Conversation key={user.id + path} path={path} user={user} direct={tab === 'direct'} team={team} initialRecipient={params.get('to') || ''} body={drafts[path] || ''} setBody={value => setDrafts(current => ({ ...current, [path]: value }))}/>}
      </Editable><Editable as="aside" contentKey="communitypage-43">
        {tab === 'groups' ? <>
          {activeGroup && (user.role === 'owner' || activeGroup.ownerId === user.id) && <form key={activeGroup._id + activeGroup.members.join(',')} className="panel group-members" onSubmit={updateGroup}><Editable as="p" contentKey="communitypage-44" canEditText className="kicker gold">GROUP MEMBERS</Editable><Editable as="h2" contentKey="communitypage-45">{activeGroup.name}</Editable><Editable as="div" contentKey="communitypage-46" className="member-checks">{people.filter(person => person.id !== activeGroup.ownerId).map(person => <Editable as="label" contentKey="communitypage-47" className="check-label" key={person.id}><input type="checkbox" name="members" value={person.id} defaultChecked={activeGroup.members.includes(person.id)}/>{person.name}</Editable>)}</Editable><Editable as="button" contentKey="communitypage-48" canEditText className="button button-small button-ghost" disabled={busy}>Update members</Editable></form>}
          <form className="panel" onSubmit={createGroup}><Editable as="p" contentKey="communitypage-49" canEditText className="kicker gold">NEW GROUP</Editable><Editable as="h2" contentKey="communitypage-50" canEditText>Bring people together.</Editable><Editable as="label" contentKey="communitypage-51">Group name<input name="name" minLength="2" maxLength="60" required/></Editable><Editable as="div" contentKey="communitypage-52" className="member-checks">{people.filter(person => person.id !== user.id).map(person => <Editable as="label" contentKey="communitypage-53" className="check-label" key={person.id}><input type="checkbox" name="members" value={person.id}/>{person.name}</Editable>)}</Editable><Editable as="p" contentKey="communitypage-54" canEditText className="helper">Add up to 30 people. The group creator and Bravo owner can change members later.</Editable><Editable as="button" contentKey="communitypage-55" canEditText className="button button-ghost" disabled={busy}>Create group</Editable></form>
        </> : <Editable as="section" contentKey="communitypage-56" className="panel prose"><Editable as="h3" contentKey="communitypage-57" canEditText>Keep it welcoming.</Editable><Editable as="p" contentKey="communitypage-58" canEditText>Be useful, be respectful, and keep addresses, passwords, payment details, and medical records private.</Editable><Editable as="p" contentKey="communitypage-59" canEditText>The owner can hide messages, mute posting, or block an account. This space is available 24/7 but is not monitored continuously.</Editable><Editable as={Link} contentKey="communitypage-60" canEditLink canEditText className="inline-link" to="/contact">Contact Bravo →</Editable></Editable>}
      </Editable></Editable>
    </>}
  </Page>;
}
