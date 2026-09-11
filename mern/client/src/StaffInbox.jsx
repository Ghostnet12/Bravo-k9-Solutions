import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import MessageCard from './MessageCard';

export default function StaffInbox({ inbox = [], refreshInbox }) {
  const [memberId, setMemberId] = useState(''), [messages, setMessages] = useState([]), [drafts, setDrafts] = useState({}), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [version, setVersion] = useState(0);
  const epoch = useRef(0), paused = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  useEffect(() => {
    const current = ++epoch.current;
    setMessages([]); setError('');
    if (!memberId) return;
    let active = true, requestNumber = 0;
    const load = async () => {
      if (document.hidden || paused.current) return;
      const request = ++requestNumber;
      try { const data = await api(`/direct?memberId=${encodeURIComponent(memberId)}`); if (active && alive.current && epoch.current === current && request === requestNumber && !paused.current) setMessages(data.messages); }
      catch (err) { if (active && alive.current && epoch.current === current && request === requestNumber && !paused.current) setError(err.message); }
    };
    load(); const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [memberId, version]);
  async function clearInbox(all = true) {
    if (paused.current || (!all && !memberId)) return;
    if (!window.confirm(all ? 'Clear earlier inbox conversations and reply drafts from YOUR view? Other people keep their copies. New messages will still arrive.' : 'Clear earlier messages in this conversation from YOUR view? Other people keep their copies.')) return;
    paused.current = true; epoch.current++; setBusy(true); setError(''); setNotice('');
    try {
      await api('/chat/clear', { method: 'POST', body: { channel: all ? 'inbox' : 'direct', ...(all ? {} : { memberId }), confirm: true } });
      if (!alive.current) return;
      setMemberId(''); setMessages([]); setDrafts({});
      await refreshInbox();
      if (alive.current) setNotice('Earlier messages and drafts are cleared from your view. This stays cleared after reload; new messages will appear normally.');
    } catch (err) { if (alive.current) setError(err.message); }
    finally { paused.current = false; if (alive.current) { setBusy(false); setVersion(value => value + 1); } }
  }
  async function send(e) {
    e.preventDefault(); if (!memberId || paused.current) return; setBusy(true); setError('');
    try { await api('/direct', { method: 'POST', body: { memberId, body: drafts[memberId] || '' } }); if (alive.current) { setDrafts(current => ({ ...current, [memberId]: '' })); setVersion(value => value + 1); } }
    catch (err) { if (alive.current) setError(err.message); } finally { if (alive.current) setBusy(false); }
  }
  return <section id="staff-inbox" className="panel"><div className="section-label"><div><p className="kicker gold">TEAM SUPPORT INBOX</p><h2>Messages to Bravo.</h2></div><button type="button" className="quiet-button" disabled={busy} onClick={() => clearInbox(true)}>Refresh & clear my inbox</button></div><p className="helper">Private to the client and Bravo team. Clearing affects your view only, not anyone else’s messages. Choose a conversation to open it.</p><Notice error>{error}</Notice><Notice>{notice}</Notice>
    {!inbox.length ? <p>No uncleared client messages. New messages will appear here.</p> : <>
      <label>Conversation<select disabled={busy} value={memberId} onChange={e => { epoch.current++; setMemberId(e.target.value); setMessages([]); setNotice(''); }}><option value="">Choose a conversation</option>{inbox.map(thread => <option value={String(thread._id)} key={String(thread._id)}>{thread.memberName}{inbox.some(other => String(other._id) !== String(thread._id) && other.memberName === thread.memberName) ? ` · ${String(thread._id).slice(-6)}` : ''}</option>)}</select></label>
      {memberId && <><p className="conversation-preview"><strong>Latest message:</strong> {inbox.find(thread => String(thread._id) === memberId)?.lastMessage || 'No message preview available.'}</p>
      <button type="button" className="quiet-button" disabled={busy} onClick={() => clearInbox(false)}>Clear this conversation from my view</button>
      <div className="direct-history" role="region" tabIndex={0} aria-label="Client conversation">{messages.map(message => <MessageCard key={message._id} message={message} showClientRole/>)}</div>
      <form onSubmit={send}><label>Reply<textarea required disabled={busy} maxLength="1200" rows="3" value={drafts[memberId] || ''} onChange={e => setDrafts(current => ({ ...current, [memberId]: e.target.value }))}/></label><button className="button button-small" disabled={busy || !(drafts[memberId] || '').trim()}>Send private reply</button></form></>}
    </>}
  </section>;
}
