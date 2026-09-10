import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';

export default function StaffInbox({ inbox = [] }) {
  const [memberId, setMemberId] = useState(''), [messages, setMessages] = useState([]), [body, setBody] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const open = async id => { setMemberId(String(id)); setError(''); try { const data = await api(`/direct?memberId=${id}`); setMessages(data.messages); } catch (e) { setError(e.message); } };
  useEffect(() => { if (!memberId && inbox[0]?._id) open(inbox[0]._id); }, [inbox]);
  async function send(e) { e.preventDefault(); setBusy(true); try { await api('/direct', { method: 'POST', body: { memberId, body } }); setBody(''); await open(memberId); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <section id="staff-inbox" className="panel"><div className="section-label"><div><p className="kicker gold">PRIVATE</p><h2>Messages to Bravo.</h2></div></div><Notice error>{error}</Notice>{!inbox.length ? <p>No private client messages yet.</p> : <><label>Conversation<select value={memberId} onChange={e => open(e.target.value)}>{inbox.map(thread => <option value={String(thread._id)} key={String(thread._id)}>{thread.memberName} · {thread.lastMessage.slice(0, 42)}</option>)}</select></label><div className="direct-history">{messages.map(message => <article key={message._id}><strong>{message.senderName}</strong><span className="badge">{message.senderRole}</span><p>{message.body}</p></article>)}</div><form onSubmit={send}><label>Reply<textarea required maxLength="1200" rows="3" value={body} onChange={e => setBody(e.target.value)}/></label><button className="button button-small" disabled={busy || !body.trim()}>Send private reply</button></form></>}</section>;
}
