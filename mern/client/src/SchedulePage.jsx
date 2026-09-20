import { Editable } from './SiteContent';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useBravo } from './context';
import { api } from './api';
import ActionFeedback from './ActionFeedback';
import { Page, formatDate } from './ui';
import './client-services.css';
import SavedScheduleCalendar from './SavedScheduleCalendar';
import ClientTrainer from './ClientTrainer';
import TrainingRecovery from './TrainingRecovery';
import { isTrainingTerm, remainingDays, lastCoveredDay } from '../../shared/day-credits';
export default function SchedulePage() {
  const { user, authReady } = useBravo(), [params, setParams] = useSearchParams();
  const client = params.get('client');
  const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : DateTime.now().setZone('America/Chicago').toFormat('yyyy-MM');
  const calendarSurface = useRef(null), [calendarHeight, setCalendarHeight] = useState(0);
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0), [notice, setNotice] = useState(''), [focusDate,setFocusDate]=useState('');
  const pdfUrl = `/api/client-schedule?month=${month}${client ? `&client=${encodeURIComponent(client)}` : ''}&format=pdf`;
  useEffect(() => {
    let current = true; setData(null); setError(''); setLoading(true);
    if (user) api(`/client-schedule?month=${month}${client ? `&client=${encodeURIComponent(client)}` : ''}`).then(result => { if (current) setData(result); }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, month, client, revision]);
  useEffect(() => {
    if(!user)return;
    let current=true;
    const refresh=()=>{if(!document.hidden) api(`/client-schedule?month=${month}${client?`&client=${encodeURIComponent(client)}`:''}`).then(result=>{if(current)setData(result)}).catch(()=>{});};
    const timer=setInterval(refresh,20000);window.addEventListener('focus',refresh);
    return()=>{current=false;clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[user?.id,month,client]);
  const activeTerm = data?.terms.find(term => isTrainingTerm(term) && ['active','trialing','canceled'].includes(term.status) && term.validFrom && new Date(term.validFrom) <= new Date() && new Date(term.validUntil) > new Date());
  function chooseMonth(value) { if (value === month) return; setCalendarHeight(calendarSurface.current?.getBoundingClientRect().height || 0); setLoading(true); const next = new URLSearchParams(params); next.set('month', value); setParams(next, { replace: true }); }
  function closeEditor() { const next=new URLSearchParams(params);next.delete('edit');setParams(next,{replace:true}); }
  function saved(message,date) {
    setNotice(message);setFocusDate(date||'');
    const next=new URLSearchParams(params);next.delete('edit');if(date)next.set('month',date.slice(0,7));
    setParams(next,{replace:true});setRevision(n=>n+1);
  }
  return <Page title={data ? `${data.client.name}’s schedule.` : 'Monthly schedule.'} eyebrow="YOUR SAVED VISITS" className="schedule-print-page">
    <Editable as="div" contentKey="schedulepage-1" className="schedule-controls">
      <Editable as="label" contentKey="schedulepage-2">Schedule month<input type="month" value={month} onChange={e => { if (e.target.value) { chooseMonth(e.target.value); } }}/></Editable>
      <Editable as="div" contentKey="schedulepage-3" className="schedule-print-actions">
        {data && !loading && <Editable as="a" contentKey="schedulepage-4" canEditText className="button" href={pdfUrl} download={`bravo-schedule-${month}.pdf`}>Download PDF</Editable>}
      </Editable>
      <Editable as={Link} contentKey="schedulepage-5" className="inline-link schedule-back" to={client ? '/admin?tab=people' : '/account'}>Back to {client ? 'members' : 'account'}</Editable>
    </Editable>
    <ActionFeedback error={error} notice={notice} onDismiss={() => { setError(''); setNotice(''); }}/>
    <Editable as="div" contentKey="schedulepage-6" ref={calendarSurface} style={loading && calendarHeight ? { minHeight: calendarHeight } : undefined}>{!authReady ? <Editable as="p" contentKey="schedulepage-7" canEditText role="status">Checking your account…</Editable> : !user ? <Editable as="div" contentKey="schedulepage-8" className="panel empty-state"><Editable as="h2" contentKey="schedulepage-9" canEditText>Your schedule is waiting.</Editable><Editable as="p" contentKey="schedulepage-10" canEditText>Sign in to view saved visits and manage your dates.</Editable><Editable as={Link} contentKey="schedulepage-11" canEditLink canEditText className="button" to="/account?next=/schedule">Sign in to view your schedule</Editable></Editable> : loading ? <Editable as="p" contentKey="schedulepage-12" canEditText role="status">Loading saved visits…</Editable> : !data ? <Editable as="div" contentKey="schedulepage-13" className="panel"><Editable as="p" contentKey="schedulepage-14" canEditText>Your schedule couldn’t load. Try again to get the latest saved visits.</Editable><Editable as="button" contentKey="schedulepage-15" canEditText className="button button-ghost" type="button" onClick={() => setRevision(n => n + 1)}>Try again</Editable></Editable> : <Editable as="section" contentKey="schedulepage-16" className="printable-schedule saved-calendar-section" id="saved-calendar">
      <Editable as="h2" contentKey="schedulepage-17">{DateTime.fromISO(`${month}-01`).toFormat('MMMM yyyy')}</Editable><Editable as="p" contentKey="schedulepage-18">Bravo K9 Solutions · {data.client.name}<br/>All times are local to Aberdeen, South Dakota.</Editable>
      <Editable as="p" contentKey="schedulepage-19" canEditText className="helper">Choose “Add or Cancel Date” to edit your schedule, or tap a saved date to see its visits. All times are local to Aberdeen.</Editable>
      {user.role === 'owner' && !data.trainingBookings?.length && <TrainingRecovery client={data.client} onSaved={message=>{setNotice(message);setRevision(n=>n+1)}}/>}
      {['staff','owner'].includes(user.role)&&!!data.trainingBookings?.length&&<ClientTrainer key={`trainer-${revision}`} bookings={data.trainingBookings||[]} onSaved={message=>{setNotice(message);setRevision(n=>n+1)}}/>}
      {(user.role !== 'owner' || !!data.trainingBookings?.length) && <SavedScheduleCalendar key={`${month}-${revision}`} data={data} month={month} onMonth={chooseMonth} reload={saved} startEditing={params.get('edit')==='1'} focusDate={focusDate?.startsWith(month)?focusDate:undefined} onCloseEditor={closeEditor}/>}
      {activeTerm && <Editable as="p" contentKey="schedulepage-20" className="membership-counter"><Editable as="strong" contentKey="schedulepage-21">{remainingDays(activeTerm.validUntil)} days remaining</Editable> · Training coverage through {formatDate(lastCoveredDay(activeTerm.validUntil))}. Membership ends {DateTime.fromISO(activeTerm.validUntil, {zone: 'America/Chicago'}).toFormat('LLL d, yyyy · h:mm a')}.{activeTerm.creditedDays > 0 && <> Includes {activeTerm.creditedDays} credited {activeTerm.creditedDays === 1 ? 'day' : 'days'}.</>}</Editable>}
      <Editable as="details" contentKey="schedulepage-22" className="schedule-membership-details"><Editable as="summary" contentKey="schedulepage-23" canEditText>Membership details</Editable>
      {data.firstPaidAt && <Editable as="div" contentKey="schedulepage-24" className="membership-payment-start"><Editable as="p" contentKey="schedulepage-25"><Editable as="strong" contentKey="schedulepage-26" canEditText>Membership payment / start:</Editable> {DateTime.fromISO(data.firstPaidAt, {zone:'America/Chicago'}).toFormat('LLL d, yyyy · h:mm a')}</Editable><Editable as="p" contentKey="schedulepage-27">First month: {DateTime.fromISO(data.firstPaidAt, {zone:'America/Chicago'}).toFormat('LLL d, yyyy')} - {DateTime.fromISO(data.firstPaidAt, {zone:'America/Chicago'}).plus({months:1}).toFormat('LLL d, yyyy')}. {Math.max(0, Math.floor(DateTime.now().diff(DateTime.fromISO(data.firstPaidAt), 'days').days))} days since membership began.</Editable></Editable>}
      {data.firstTrainingDay && <Editable as="p" contentKey="schedulepage-28">First paid scheduled visit: {formatDate(data.firstTrainingDay)}</Editable>}
      <Editable as="p" contentKey="schedulepage-29" canEditText className="helper">These are your saved booking dates, not suggested openings. Requested visits await Bravo’s confirmation. Cancelled visits are labelled below.</Editable>
      <Editable as="h2" contentKey="schedulepage-30" canEditText>Membership dates</Editable>{data.terms.length ? data.terms.map(term => <Editable as="p" contentKey="schedulepage-31" key={term.stripeId}>{term.serviceIds.join(' + ')}: {term.validFrom ? new Date(term.validFrom).toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) : 'Start date not yet recorded'} – {new Date(term.validUntil).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} · {new Date(term.validUntil) <= new Date() ? 'Expired' : term.status}</Editable>) : <Editable as="p" contentKey="schedulepage-32" canEditText>No paid monthly membership recorded.</Editable>}
      </Editable>
    </Editable>}</Editable>
  </Page>;
}
