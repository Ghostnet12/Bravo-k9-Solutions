import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';
import { ALL_SERVICES } from '../../shared/catalog';
const date = value => new Date(value).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
export default function MembershipTerms() {
  const [terms, setTerms] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function load() { const result = await api('/membership-terms'); setTerms(result.terms); }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function renew(term) {
    setBusy(true); setError('');
    try {
      const { booking } = await api('/membership-terms/renew', { method: 'POST', body: { termId: term.stripeId, requestKey: crypto.randomUUID() } });
      const result = await api(`/bookings/${booking._id}/checkout`, { method: 'POST', body: {} });
      window.location.assign(result.url);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="panel"><h2>Membership dates & renewal</h2><p>New memberships are paid one month at a time. Renew manually to continue; otherwise access expires. A reminder appears in Notifications the day before your end date.</p><Notice error>{error}</Notice><Notice>{notice}</Notice>
    {terms.length ? terms.map(term => {
      const expired = new Date(term.validUntil) <= new Date(), renewed = terms.some(next => next.renewalOf === term.stripeId && next.status === 'active');
      return <article className="membership-term" key={term.stripeId}>{term.source === 'grant' && <p>Member access activated by Bravo. Contact the team to extend it.</p>}<h3>{term.serviceIds.map(id => ALL_SERVICES.find(service => service.id === id)?.name || id).join(' + ')}</h3><p>Starts: {term.validFrom ? date(term.validFrom) : 'Ask Bravo to confirm'}<br/>Ends: {date(term.validUntil)} (Aberdeen time)</p><p><strong>{renewed ? 'Renewed' : expired ? 'Expired' : new Date(term.validFrom) > new Date() ? 'Next month paid' : term.status}</strong></p>{!term.autoPayDisabled && <Notice>This existing plan is awaiting its switch from automatic billing. Contact Bravo before paying again.</Notice>}
      {!renewed && term.source !== 'grant' && ['active', 'trialing', 'canceled'].includes(term.status) && <div className="record-actions"><button className="button button-small" disabled={busy || !term.autoPayDisabled || new Date(term.validUntil) > new Date(Date.now() + 7 * 86400000)} onClick={() => renew(term)}>Renew one month</button>{!expired && <button className="quiet-button" disabled={busy || !term.autoPayDisabled || term.renewalDeclined} onClick={async () => { setBusy(true); setError(''); try { await api('/membership-terms/decline', { method: 'POST', body: { termId: term.stripeId } }); await load(); setNotice('Bravo has been notified. Your paid access continues to its end date.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{term.renewalDeclined ? 'Not renewing' : 'Do not renew'}</button>}</div>}
      {!expired && !renewed && <p className="helper">Renewal opens seven days before expiry. New visits can be scheduled separately.</p>}</article>;
    }) : <p>No paid monthly membership yet.</p>}<Link className="inline-link" to="/schedule">View & print my monthly schedule →</Link>
  </section>;
}
