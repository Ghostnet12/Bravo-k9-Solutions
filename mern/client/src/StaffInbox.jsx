import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import { useBravo } from './context';
import { useChatHistory } from './chat-history';
import MessageCard from './MessageCard';

export default function StaffInbox({ inbox = [], refreshInbox }) {
  const { user } = useBravo();
  const [memberId, setMemberId] = useState(''), [drafts, setDrafts] = useState({}), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [resettingInbox, setResettingInbox] = useState(false);
  const history = useChatHistory(memberId && !resettingInbox ? `/direct?memberId=${memberId}` : null);
  const working = busy || history.clearing || resettingInbox;
  useEffect(() => {
    if (!resettingInbox && !inbox.some(thread => String(thread._id) === memberId)) setMemberId(inbox[0]?._id ? String(inbox[0]._id) : '');
  }, [inbox, memberId, resettingInbox]);
  async function send(e) {
    e.preventDefault(); if (working || !memberId) return;
    setBusy(true); setError(''); setNotice('');
    try { await api('/direct', { method: 'POST', body: { memberId, body: drafts[memberId] || '' } }); setDrafts(current => ({ ...current, [memberId]: '' })); await history.load(); await refreshInbox(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function clearInbox() {
    if (!window.confirm('Clear all inbox history and unsent replies from YOUR view? This stays cleared after signing in again. Other people keep their copies, and new messages will still arrive.')) return;
    setResettingInbox(true); setError(''); setNotice('');
    try { await api('/chat/reset', { method: 'POST', body: { scope: 'inbox', mode: 'clear' } }); setDrafts({}); setMemberId(''); await refreshInbox(); setNotice('Inbox history and drafts cleared for your account. New messages will still arrive.'); }
    catch (err) { setError(err.message); } finally { setResettingInbox(false); }
  }
  async function clearThread(mode) {
    const prompt = mode === 'delete' ? 'Permanently DELETE all history in this selected client conversation for the client and the whole team? This cannot be undone. No bookings or payments will be changed.' : 'Clear this conversation and its unsent reply from YOUR history? Other people keep their copies. New messages will still arrive.';
    if (!window.confirm(prompt)) return;
    setError(''); setNotice('');
    if (await history.clear(mode)) {
      setDrafts(current => ({ ...current, [memberId]: '' }));
      try { await refreshInbox(); setNotice(mode === 'delete' ? 'Selected conversation history permanently deleted.' : 'Selected conversation cleared from your history.'); } catch (err) { setError(`History cleared, but the inbox could not reload: ${err.message}`); }
    }
  }
  return <section id="staff-inbox" className="panel"><div className="section-label"><div><p className="kicker gold">TEAM SUPPORT INBOX</p><h2>Messages to Bravo.</h2></div><button type="button" className="quiet-button" disabled={working} onClick={clearInbox}>Refresh & clear inbox</button></div><p className="helper">Clear removes old history from your account, not other people’s copies. New messages update every 10 seconds.</p><Notice error>{error || history.error}</Notice><Notice>{notice}</Notice>
    {resettingInbox ? <p role="status">Clearing your inbox…</p> : !inbox.length ? <p>No client messages in your current inbox.</p> : <>
      <label>Conversation<select disabled={working} value={memberId} onChange={e => { setMemberId(e.target.value); setError(''); setNotice(''); }}>{inbox.map(thread => <option value={String(thread._id)} key={String(thread._id)}>{thread.memberName}{inbox.some(other => other._id !== thread._id && other.memberName === thread.memberName) ? ` · ${String(thread._id).slice(-6)}` : ''}</option>)}</select></label>
      <div className="reset-actions"><button type="button" className="quiet-button" disabled={working || !memberId} onClick={() => clearThread('clear')}>Refresh & clear conversation</button>{user?.role === 'owner' && <button type="button" className="quiet-button danger-link" disabled={working || !memberId} onClick={() => clearThread('delete')}>Delete conversation history</button>}</div>
      <p className="conversation-preview"><strong>Latest message:</strong> {inbox.find(thread => String(thread._id) === memberId)?.lastMessage || 'No message preview available.'}</p>
      <div className="direct-history" role="region" tabIndex={0} aria-label="Client conversation">{history.loading ? <p role="status">Loading messages…</p> : history.messages.length ? history.messages.map(message => <MessageCard key={message._id} message={message} showClientRole/>) : <p>No messages in your current history.</p>}</div>
      <form onSubmit={send}><label>Reply<textarea required disabled={working} maxLength="1200" rows="3" value={drafts[memberId] || ''} onChange={e => setDrafts(current => ({ ...current, [memberId]: e.target.value }))}/></label><button className="button button-small" disabled={working || !(drafts[memberId] || '').trim()}>Send private reply</button></form>
    </>}
  </section>;
}
