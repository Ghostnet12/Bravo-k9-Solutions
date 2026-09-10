import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, SetupNotice } from './ui';
export default function CommunityPage() {
  const { user, authReady } = useBravo();
  const [messages, setMessages] = useState([]), [body, setBody] = useState(''), [kind, setKind] = useState('message'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { const data = await api('/community'); setMessages(data.messages); }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () => { if (document.hidden) return; refresh().then(() => { if (active) setError(''); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); };
    load(); const timer = setInterval(load, 10000); document.addEventListener('visibilitychange', load);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [user, refresh]);
  async function send(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/community', { method: 'POST', body: { body, kind } }); setBody(''); setNotice('Message posted.'); await refresh(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove(id) { if (!window.confirm('Hide this message from the Bravo Room?')) return; try { await api(`/community/${id}`, { method: 'DELETE', body: {} }); await refresh(); } catch (e) { setError(e.message); } }
  const alerts = messages.filter(m => m.kind !== 'message');
  return <Page className="community-page" title="The Bravo Room." eyebrow="TEAM UPDATES & COMMUNITY" intro="Ask a question, share progress, and stay in touch with Bravo and fellow dog owners."><SetupNotice/><Notice error>{error}</Notice>{!authReady ? <p role="status">Checking your account…</p> : !user ? <div className="panel empty-state"><h2>You’re welcome here.</h2><p>Sign in to read updates and join the conversation.</p><Link className="button" to="/account">Sign in to Bravo</Link></div> : <div className="community-layout"><section><div className="chat-history panel" aria-label="Community messages">{loading ? <p role="status">Loading messages…</p> : !messages.length ? <div className="empty-state"><h3>Start a conversation.</h3><p>No messages yet. Share a training win or ask the team a question.</p></div> : messages.map(message => <article className={`chat-message ${message.kind}`} key={message._id}><header><strong>{message.authorName}</strong>{message.role === 'staff' && <span className="badge">BRAVO STAFF</span>}<time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></header>{message.kind !== 'message' && <span className="message-kind">{message.kind}</span>}<p>{message.body}</p>{user.role === 'staff' && <button className="quiet-button" onClick={() => remove(message._id)}>Hide message</button>}</article>)}</div><form className="panel chat-composer" onSubmit={send}>{user.role === 'staff' && <label>Post type<select value={kind} onChange={e => setKind(e.target.value)}><option value="message">Conversation</option><option value="announcement">Staff announcement</option><option value="alert">Urgent alert</option></select></label>}<label>Your message<textarea rows="3" maxLength="700" required value={body} onChange={e => setBody(e.target.value)} placeholder="What’s happening with your dog?"/></label><div className="section-label"><small>{body.length}/700 · Visible to signed-in members</small><button className="button button-small" disabled={busy || !body.trim()}>{busy ? 'Posting…' : 'Post message'}</button></div><Notice>{notice}</Notice></form></section><aside><section className="panel"><p className="kicker gold">FROM THE BRAVO TEAM</p><h2>Announcements.</h2>{alerts.length ? [...alerts].reverse().slice(0,5).map(alert => <div className={`alert-card ${alert.kind}`} key={alert._id}><span className="badge">{alert.kind}</span><p>{alert.body}</p></div>) : <p>No announcements right now.</p>}</section><section className="panel prose"><h3>Keep it useful. Keep it kind.</h3><p>Don’t share addresses, payment information, or sensitive personal details here. Use your account for booking information.</p><p>This room is not monitored continuously. For urgent scheduling concerns, call <a href="tel:+16058242767">(605) 824-2767</a>.</p></section></aside></div>}</Page>;
}
