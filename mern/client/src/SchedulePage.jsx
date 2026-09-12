import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, formatDate, formatTime } from './ui';
import { trainingFocusName } from '../../shared/catalog';
import './client-services.css';
import SavedScheduleCalendar from './SavedScheduleCalendar';
export default function SchedulePage() {
  const { user, authReady } = useBravo(), [params, setParams] = useSearchParams();
  const client = params.get('client');
  const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : DateTime.now().setZone('America/Chicago').toFormat('yyyy-MM');
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0), [notice, setNotice] = useState('');
  const [printHelp, setPrintHelp] = useState(false);
  const pdfUrl = `/api/client-schedule?month=${month}${client ? `&client=${encodeURIComponent(client)}` : ''}&format=pdf`;
  function printSchedule() {
    setPrintHelp(true);
    try { window.print(); } catch { /* The visible PDF option also works without a browser print dialog. */ }
  }
  useEffect(() => {
    let current = true; setData(null); setError(''); setLoading(true);
    if (user) api(`/client-schedule?month=${month}${client ? `&client=${encodeURIComponent(client)}` : ''}`).then(result => { if (current) setData(result); }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, month, client, revision]);
  const activeTerm = data?.terms.find(term => ['active','trialing','canceled'].includes(term.status) && term.validFrom && new Date(term.validFrom) <= new Date() && new Date(term.validUntil) > new Date());
  function chooseMonth(value) { const next = new URLSearchParams(params); next.set('month', value); setParams(next); }
  return <Page title={data ? `${data.client.name}’s schedule.` : 'Monthly schedule.'} eyebrow="YOUR SAVED VISITS" className="schedule-print-page">
    <div className="schedule-controls">
      <label>Schedule month<input type="month" value={month} onChange={e => { if (e.target.value) { setPrintHelp(false); chooseMonth(e.target.value); } }}/></label>
      <div className="schedule-print-actions">
        <button type="button" className="button" disabled={!data || loading} aria-describedby={printHelp ? 'schedule-print-help' : undefined} onClick={printSchedule}>Print schedule</button>
        {data && !loading && <a className="button button-ghost" href={pdfUrl} download={`bravo-schedule-${month}.pdf`}>Download PDF</a>}
      </div>
      {printHelp && <div id="schedule-print-help" className="notice schedule-print-help" role="status">If the print menu did not open, download the PDF. On iPhone, open the downloaded file, then tap Share and Print. You can also open this page in Safari and use Share → Print.</div>}
      <Link className="inline-link schedule-back" to={client ? '/admin?tab=people' : '/account'}>Back to {client ? 'members' : 'account'}</Link>
    </div>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    {!authReady ? <p role="status">Checking your account…</p> : !user ? <Link to="/account">Sign in to view your schedule</Link> : loading ? <p role="status">Loading saved visits…</p> : data && <section className="printable-schedule">
      <h2>{DateTime.fromISO(`${month}-01`).toFormat('MMMM yyyy')}</h2><p>Bravo K9 Solutions · {data.client.name}<br/>All times are local to Aberdeen, South Dakota.</p>
      {data.firstPaidAt && <div className="membership-payment-start"><p><strong>Membership payment / start:</strong> {DateTime.fromISO(data.firstPaidAt, {zone:'America/Chicago'}).toFormat('LLL d, yyyy · h:mm a')}</p><p>First month: {DateTime.fromISO(data.firstPaidAt, {zone:'America/Chicago'}).toFormat('LLL d, yyyy')} - {DateTime.fromISO(data.firstPaidAt, {zone:'America/Chicago'}).plus({months:1}).toFormat('LLL d, yyyy')}. {Math.max(0, Math.floor(DateTime.now().diff(DateTime.fromISO(data.firstPaidAt), 'days').days))} days since membership began.</p></div>}
      {activeTerm && <p className="membership-counter"><strong>Current paid month:</strong> Day {Math.floor(DateTime.now().diff(DateTime.fromISO(activeTerm.validFrom), 'days').days)+1}. Ends {DateTime.fromISO(activeTerm.validUntil, {zone:'America/Chicago'}).toFormat('LLL d, yyyy · h:mm a')} · {Math.max(0,Math.ceil(DateTime.fromISO(activeTerm.validUntil).diffNow('days').days))} days remaining.</p>}
      {data.firstTrainingDay && <p>First paid scheduled visit: {formatDate(data.firstTrainingDay)}</p>}
      <p className="helper">These are your saved booking dates, not suggested openings. Requested visits await Bravo’s confirmation. Cancelled visits are labelled below.</p>
      <SavedScheduleCalendar key={`${month}-${revision}`} data={data} month={month} reload={message => { setNotice(message);setRevision(n => n+1); }}/>
      <h2>Membership dates</h2>{data.terms.length ? data.terms.map(term => <p key={term.stripeId}>{term.serviceIds.join(' + ')}: {term.validFrom ? new Date(term.validFrom).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : 'Start date not yet recorded'} – {new Date(term.validUntil).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} · {new Date(term.validUntil) <= new Date() ? 'Expired' : term.status}</p>) : <p>No paid monthly membership recorded.</p>}
    </section>}
  </Page>;
}
