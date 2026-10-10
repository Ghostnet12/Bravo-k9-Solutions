import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { api } from './api';
import { useBravo } from './context';
import { Editable } from './SiteContent';
import { formatDate, formatTime } from './ui';
import { lessonLibraryVisible } from '../../shared/lesson-library';
import { currentTrainingTerm, nextRequestedVisit } from '../../shared/customer-journey';
const centralDate = value => value ? DateTime.fromISO(value, { zone: 'America/Chicago' }).toFormat('LLL d, yyyy') : 'Start date not recorded';
export default function MemberOverview({ bookings = [], loading = false, failed = false }) {
  const { user, config } = useBravo();
  const next = nextRequestedVisit(bookings), month = next?.date?.slice(0, 7) || DateTime.now().setZone('America/Chicago').toFormat('yyyy-MM');
  const [details, setDetails] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true; setDetails(null); setError('');
    api(`/client-schedule?month=${month}`).then(data => { if (current) setDetails(data); }).catch(() => { if (current) setError('Schedule details are unavailable. Retry or contact Bravo.'); });
    return () => { current = false; };
  }, [user?.id, month, revision, bookings]);
  const visit = details?.visits?.find(item => item.bookingId === next?.bookingId && item.date === next?.date && item.time === next?.time);
  const term = currentTrainingTerm(details?.terms);
  return <section className="panel member-overview" aria-labelledby="member-overview-title">
    <Editable as="h2" contentKey="member-overview-title" canEditText id="member-overview-title">Your next step.</Editable>
    {loading ? <p role="status">Loading your saved visits…</p> : failed ? <p role="status">Your requests could not be refreshed. Open your schedule for the latest details.</p> : next ? <>
      <p className="member-overview-date"><strong>{formatDate(next.date)} at {formatTime(next.time)}</strong> · Central Time</p>
      <dl className="member-overview-facts"><div><dt>Dog</dt><dd>{next.dogName || 'Check your request'}</dd></div><div><dt>Trainer</dt><dd>{error ? 'Unavailable — check with Bravo' : details ? visit?.trainer || 'Awaiting assignment' : 'Checking assignment…'}</dd></div><div><dt>Visit status</dt><dd>{next.status === 'confirmed' ? 'Confirmed' : 'Requested — awaiting Bravo’s confirmation'}</dd></div></dl>
      {!['paid','covered'].includes(next.paymentStatus) && <p className="helper">Payment status: {next.paymentStatus || 'not yet recorded'}. This is separate from visit confirmation.</p>}
    </> : <p>No upcoming saved visits. Open your schedule to plan your next session.</p>}
    {error ? <p role="status">{error} <button type="button" className="quiet-button" onClick={() => setRevision(value => value + 1)}>Retry details</button></p> : !details ? <p role="status">Checking membership dates…</p> : term ? <p><strong>Training membership:</strong> {centralDate(term.validFrom)} – {centralDate(term.validUntil)}. Ends {DateTime.fromISO(term.validUntil, { zone: 'America/Chicago' }).toFormat('h:mm a')} Central. Renew manually; no automatic monthly charge.</p> : <p>No active training period is shown. Check membership details below or ask Bravo about renewal.</p>}
    <nav className="member-overview-actions" aria-label="Member shortcuts">
      <Editable as={Link} contentKey="accountpage-23" canEditLink canEditText className="button" to={`/schedule${next ? `?month=${month}` : ''}`}>Manage Schedule</Editable>
      <Editable as={Link} contentKey="accountpage-25" canEditLink canEditText className="button button-ghost" to="/community?tab=direct">Message Bravo</Editable>
      {lessonLibraryVisible(config, user) && <Editable as={Link} contentKey="accountpage-24" canEditLink canEditText className="button button-ghost" to="/learn">My Lessons</Editable>}
    </nav>
  </section>;
}
