import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, formatDate, formatTime } from './ui';
import { trainingFocusName } from '../../shared/catalog';
import './client-services.css';
export default function SchedulePage() {
  const { user, authReady } = useBravo(), [params, setParams] = useSearchParams();
  const client = params.get('client');
  const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : DateTime.now().setZone('America/Chicago').toFormat('yyyy-MM');
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true; setData(null); setError(''); setLoading(true);
    if (user) api(`/client-schedule?month=${month}${client ? `&client=${encodeURIComponent(client)}` : ''}`).then(result => { if (current) setData(result); }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, month, client]);
  function chooseMonth(value) { const next = new URLSearchParams(params); next.set('month', value); setParams(next); }
  return <Page title={data ? `${data.client.name}’s schedule.` : 'Monthly schedule.'} eyebrow="YOUR SAVED VISITS" className="schedule-print-page">
    <div className="schedule-controls"><label>Schedule month<input type="month" value={month} onChange={e => { if (e.target.value) chooseMonth(e.target.value); }}/></label><button className="button" disabled={!data || loading} onClick={() => window.print()}>Print schedule</button><Link className="inline-link" to={client ? '/admin?tab=people' : '/account'}>Back to {client ? 'members' : 'account'}</Link></div>
    <Notice error>{error}</Notice>
    {!authReady ? <p role="status">Checking your account…</p> : !user ? <Link to="/account">Sign in to view your schedule</Link> : loading ? <p role="status">Loading saved visits…</p> : data && <section className="printable-schedule">
      <h2>{DateTime.fromISO(`${month}-01`).toFormat('MMMM yyyy')}</h2><p>Bravo K9 Solutions · {data.client.name}<br/>All times are local to Aberdeen, South Dakota.</p>
      {data.firstTrainingDay && <p>First paid scheduled visit: {formatDate(data.firstTrainingDay)}</p>}
      <p className="helper">These are your saved booking dates, not suggested openings. Requested visits await Bravo’s confirmation. Cancelled visits are labelled below.</p>
      {data.visits.length ? <div className="schedule-list">{data.visits.map((visit, i) => <article className="schedule-visit" key={`${visit.bookingId}-${i}`}><h3>{formatDate(visit.date)} · {formatTime(visit.time)}</h3><p>{visit.service === 'training' ? trainingFocusName(visit.trainingFocus) : visit.service} · {visit.dogName}</p><p>Trainer: {visit.trainer}</p><p><strong>{visit.status.toUpperCase()}</strong> · {visit.paymentStatus === 'covered' ? 'Membership covered' : visit.paymentStatus} · #{visit.bookingId.slice(-6)}</p></article>)}</div> : <p>No saved visits in this month. Choose another month to see the rest of the schedule.</p>}
      <h2>Membership dates</h2>{data.terms.length ? data.terms.map(term => <p key={term.stripeId}>{term.serviceIds.join(' + ')}: {term.validFrom ? new Date(term.validFrom).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : 'Start date not yet recorded'} – {new Date(term.validUntil).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} · {new Date(term.validUntil) <= new Date() ? 'Expired' : term.status}</p>) : <p>No paid monthly membership recorded.</p>}
    </section>}
  </Page>;
}
