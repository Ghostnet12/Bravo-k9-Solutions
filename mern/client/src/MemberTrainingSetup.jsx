import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';
import { membershipDate, membershipToday } from '../../shared/membership-terms';
import ClientTrainer from './ClientTrainer';
import SavedScheduleCalendar from './SavedScheduleCalendar';
import './client-services.css';

export default function MemberTrainingSetup({ person, access }) {
  const [month, setMonth] = useState(() => {
    const today = membershipToday(), start = membershipDate(access.startsAt), end = membershipDate(access.endsAt);
    return (today >= start && today < end ? today : start).slice(0, 7);
  });
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true; setData(null); setError('');
    api(`/client-schedule?client=${person._id}&month=${month}`).then(result => {
      if (current) setData({ ...result, trainingBookings: result.trainingBookings.filter(booking => booking._id === access.trainingBookingId) });
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [person._id, access.trainingBookingId, month, revision]);
  const reload = message => { setNotice(message); setRevision(value => value + 1); };
  return <section className="member-training-setup" aria-label={`Training setup for ${person.name}`}>
    <h3>Trainer &amp; schedule</h3>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    {error && <button type="button" className="quiet-button" onClick={() => setRevision(value => value + 1)}>Reload training setup</button>}
    {!data && !error && <p role="status">Loading the client’s training setup…</p>}
    {data && <>
      <ClientTrainer key={`trainer-${revision}-${month}`} bookings={data.trainingBookings} onSaved={reload} initiallyOpen/>
      <label>Schedule month<input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }}/></label>
      <SavedScheduleCalendar key={`calendar-${revision}-${month}`} data={data} month={month} reload={reload}/>
    </>}
    <Link className="inline-link" to={`/schedule?client=${person._id}&month=${month}`}>Open full schedule &amp; PDF</Link>
  </section>;
}
