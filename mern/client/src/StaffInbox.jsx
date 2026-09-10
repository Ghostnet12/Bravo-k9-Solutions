import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';

export default function StaffInbox({ inbox = [], refreshInbox }) {
  const [memberId, setMemberId] = useState(''), [messages, setMessages] = useState([]), [drafts, setDrafts] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false), [version, setVersion] = useState(0);
  useEffect(() => { if (!memberId && inbox[0]?._id) setMemberId(String(inbox[0]._id)); }, [inbox, memberId]);
  useEffect(() => {
    if (!memberId) return;
    let active = true; setMessages([]); setError('');
    const load = async () => {
      if (document.hidden) return;
      try { const data = await api(`/direct?memberId=${memberId}`); if (active) setMessages(data.messages); }
      catch (err) { if (active) setError(err.message); }
    };
    load(); const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [memberId, version]);
  async function send(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/direct', { method: 'POST', body: { memberId, body: drafts[memberId] || '' } }); setDrafts(current => ({ ...current, [memberId]: '' })); setVersion(value => value + 1); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section id="staff-inbox" className="panel"><div className="section-label"><div><p className="kicker gold">TEAM SUPPORT INBOX</p><h2>Messages to Bravo.</h2></div><button className="quiet-button" disabled={busy} onClick={async () => { try { await refreshInbox(); setVersion(value => value + 1); } catch (err) { setError(err.message); } }}>Refresh inbox</button></div><p className="helper">Private to the client and Bravo team. The selected thread updates every 10 seconds.</p><Notice error>{error}</Notice>
    {!inbox.length ? <p>No client messages yet.</p> : <>
      <label>Conversation<select disabled={busy} value={memberId} onChange={e => setMemberId(e.target.value)}>{inbox.map(thread => <option value={String(thread._id)} key={String(thread._id)}>{thread.memberName} · {thread.lastMessage.slice(0, 42)}</option>)}</select></label>
      <div className="direct-history">{messages.map(message => <article key={message._id}><strong>{message.senderName}</strong><span className="badge">{message.senderRole}</span><small>{new Date(message.createdAt).toLocaleString()}{message.recipientName ? ` · For ${message.recipientName}` : ''}</small><p>{message.body}</p></article>)}</div>
      <form onSubmit={send}><label>Reply<textarea required disabled={busy} maxLength="1200" rows="3" value={drafts[memberId] || ''} onChange={e => setDrafts(current => ({ ...current, [memberId]: e.target.value }))}/></label><button className="button button-small" disabled={busy || !(drafts[memberId] || '').trim()}>Send private reply</button></form>
    </>}
  </section>;
}
