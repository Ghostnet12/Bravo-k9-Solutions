import LessonEditor from './LessonEditor';
import OwnerPanel from './OwnerPanel';
import StaffInbox from './StaffInbox';
import StaffBooking from './StaffBooking';
import { downloadCalendar } from './calendar';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, formatDate, formatTime } from './ui';
import { today } from './BookingPage';

const hours = Array.from({ length: 13 }, (_, i) => `${i + 9}:00`.padStart(5, '0'));
export default function AdminPage() {
  const { user, refreshConfig, authReady } = useBravo();
  const [data, setData] = useState(null), [schedule, setSchedule] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('schedule'), [query, setQuery] = useState(''), [statusFilter, setStatusFilter] = useState('active'), [visitDate, setVisitDate] = useState(''), [trainer, setTrainer] = useState('all');
  const load = useCallback(async () => { const result = await api('/admin'); setData(result); setSchedule(result.settings); }, []);
  useEffect(() => { if (['staff', 'owner'].includes(user?.role)) load().catch(e => setError(e.message)); }, [user, load]);
  async function action(work) { setBusy(true); setError(''); setNotice(''); try { await work(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function toggle(field, value) { setSchedule(s => ({ ...s, [field]: s[field].includes(value) ? s[field].filter(v => v !== value) : [...s[field], value].sort() })); }
  const mine = b => trainer === 'all' || (trainer === 'unassigned' ? !b.staffId : b.staffId === trainer);
  const visible = (data?.bookings || []).filter(b => mine(b) &&
    (statusFilter === 'all' || (statusFilter === 'active' ? b.status !== 'cancelled' : b.status === statusFilter)) &&
    (!visitDate || b.visits.some(v => v.date === visitDate)) &&
    [b.dogName, b.userId?.name, b.userId?.email, b.phone, b._id].some(v => String(v || '').toLowerCase().includes(query.toLowerCase())));
  const agenda = (data?.bookings || []).filter(b => mine(b) && b.status !== 'cancelled').flatMap(b => b.visits.filter(v => v.date === today()).map(v => ({ ...v, booking: b }))).sort((a,b) => a.time.localeCompare(b.time));
  const allowed = ['staff', 'owner'].includes(user?.role);
  const tabs = [['schedule', 'Schedule'], ['lessons', 'Lesson studio'], ['messages', 'Messages'], ...(user?.role === 'owner' ? [['people', 'People & access']] : [])];
  return <Page className="staff-page" title={user?.role === 'owner' ? 'Your owner desk.' : 'Your staff desk.'} eyebrow={user?.role === 'owner' ? 'BRAVO OWNERSHIP' : 'BRAVO OPERATIONS'} intro="Choose a task. Keep your day, your clients, and your lessons in one place.">
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    {!authReady ? <p role="status">Checking access…</p> : !allowed ? <div className="panel"><h2>Team access required.</h2><p>The owner assigns staff privileges to registered accounts.</p><Link className="button" to="/account">Open your account</Link></div> : !data ? <p role="status">Loading your desk…</p> : <>
      <nav className="community-tabs desk-tabs" aria-label="Desk sections">{tabs.map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setError(''); setNotice(''); }}>{label}</button>)}</nav>
      {tab === 'schedule' && <>
        <section className="panel"><div className="section-label"><h2>Today’s visits.</h2><button className="quiet-button" disabled={busy} onClick={() => action(async () => {})}>Refresh</button></div>
          <div className="form-grid"><p>{formatDate(today())} · Aberdeen time</p><label>View schedule<select value={trainer} onChange={e => setTrainer(e.target.value)}><option value="all">Whole team</option><option value={user.id}>My visits</option><option value="unassigned">Unassigned visits</option>{data.team.filter(person => person._id !== user.id).map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label></div>
          {agenda.length ? agenda.map(v => <div className="appointment-line" key={`${v.booking._id}-${v.time}`}><strong>{formatTime(v.time)} · {v.booking.dogName}</strong><span>{v.booking.userId?.name} · {v.booking.status}</span><a className="inline-link" href={`tel:${v.booking.phone.replace(/[^+0-9]/g, '')}`}>Call client</a></div>) : <p>No visits today for this view.</p>}
          <p className="helper">Requests need confirmation. Each hourly opening is shared across the team.</p>
        </section>
        <StaffBooking team={data.team} onSaved={load}/>
        <section id="customer-requests"><h2>Requests & upcoming visits.</h2>
          <div className="panel"><div className="form-grid"><label>Find a client or dog<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, email, phone, or booking ID"/></label><label>Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="active">Active requests & visits</option><option value="requested">Awaiting confirmation</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="all">All statuses</option></select></label><label>Visit date<input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)}/></label></div><p className="helper">Showing {visible.length} of the latest {data.bookings.length} requests.</p></div>
          {!visible.length ? <div className="panel"><p>No requests match this view.</p></div> : <div className="admin-bookings">{visible.map(booking => <article className="panel" key={booking._id}>
            <div className="record-top"><span className="badge">{booking.status}</span><span className="badge">{booking.paymentStatus}</span></div><h3>{booking.dogName}</h3><p>{booking.userId?.name || 'Former client'} · {booking.userId?.email}</p><p><a className="inline-link" href={`tel:${booking.phone.replace(/[^+0-9]/g, '')}`}>{booking.phone}</a><br/>{booking.address}</p>{booking.notes && <p className="staff-note">{booking.notes}</p>}
            {booking.visits.map(v => <div className="appointment-line" key={`${v.date}-${v.time}`}><strong>{formatDate(v.date)}</strong><span>{formatTime(v.time)} · {v.service}</span></div>)}
            <label>Assigned trainer<select disabled={busy || booking.status === 'cancelled'} value={booking.staffId || ''} onChange={e => action(() => api(`/admin/bookings/${booking._id}/assignment`, { method: 'PATCH', body: { staffId: e.target.value || null } }))}><option value="">Unassigned</option>{booking.staffId && !data.team.some(person => person._id === booking.staffId) && <option value={booking.staffId}>Former staff — reassign this visit</option>}{data.team.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
            {booking.status !== 'cancelled' && <div className="record-actions">{booking.status === 'confirmed' && booking.visits.length > 0 && <button className="quiet-button" onClick={() => downloadCalendar(booking)}>Add to calendar</button>}
              {booking.visits.length > 0 && !booking.stripeSessionId && <Link className="quiet-button" to={`/portal?edit=${booking._id}`}>Change dates or times</Link>}
              {booking.status === 'requested' && <button className="button button-small" disabled={busy} onClick={() => action(() => api(`/admin/bookings/${booking._id}`, { method: 'PATCH', body: { status: 'confirmed' } }))}>Confirm visit</button>}
              <button className="quiet-button" disabled={busy} onClick={() => { if(window.confirm('Cancel this visit? This does not refund a payment.')) action(() => api(`/admin/bookings/${booking._id}`, { method: 'PATCH', body: { status: 'cancelled' } })); }}>Cancel visit</button>
            </div>}
            {user.role === 'owner' && booking.paymentStatus === 'paid' && <p className="helper">Refund controls are paused until payment setup is complete.</p>}
          </article>)}</div>}
        </section>
        <details className="panel"><summary>Weekly availability & time off</summary><p>These settings apply to the shared team calendar. Existing visits stay booked.</p><div className="admin-layout">
          <section><h3>Weekly availability</h3><form onSubmit={e => { e.preventDefault(); action(async () => { await api('/admin/schedule', { method: 'PUT', body: { enabled: schedule.enabled, weekdays: schedule.weekdays, hours: schedule.hours } }); await refreshConfig(); setNotice('Availability updated.'); }); }}><label className="check-label"><input type="checkbox" checked={schedule.enabled} onChange={e => setSchedule(s => ({ ...s, enabled: e.target.checked }))}/>Accept online booking requests</label><fieldset><legend>Working days</legend><div className="check-grid">{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((label,i) => <label className="check-label" key={label}><input type="checkbox" checked={schedule.weekdays.includes(i+1)} onChange={() => toggle('weekdays',i+1)}/>{label}</label>)}</div></fieldset><fieldset><legend>Starting times</legend><div className="check-grid">{hours.map(time => <label className="check-label" key={time}><input type="checkbox" checked={schedule.hours.includes(time)} onChange={() => toggle('hours',time)}/>{formatTime(time)}</label>)}</div></fieldset><button className="button" disabled={busy}>Save availability</button></form></section>
          <section><h3>Block an opening</h3><form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const body = Object.fromEntries(new FormData(form)); action(async () => { await api('/admin/blocks', { method: 'POST', body }); form.reset(); setNotice('Time blocked.'); }); }}><label>Date<input name="date" type="date" min={today()} required/></label><label>Time<select name="time">{hours.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}</select></label><label>Reason<input name="reason" maxLength="200" required placeholder="Travel time, weather, time off…"/></label><button className="button button-ghost" disabled={busy}>Block time</button></form><h3>Blocked times</h3>{data.blocks.length ? data.blocks.map(block => <div className="blocked-time" key={block._id}><p>{formatDate(block.date)} · {formatTime(block.time)}<small>{block.reason}</small></p><button className="quiet-button" disabled={busy} onClick={() => action(() => api(`/admin/blocks/${encodeURIComponent(block._id)}`, { method: 'DELETE', body: {} }))}>Reopen</button></div>) : <p>No blocked openings.</p>}</section>
        </div></details>
      </>}
      {tab === 'messages' && <StaffInbox inbox={data.inbox} refreshInbox={load}/>}
      {tab === 'lessons' && <LessonEditor/>}
      {tab === 'people' && user.role === 'owner' && <><OwnerPanel user={user}/><section className="panel"><h2>Community moderation.</h2><p>Review public and group conversations. Hide messages in context, or mute/block accounts in People & access.</p><Link className="button button-ghost" to="/community?tab=groups">Review groups</Link><Link className="inline-link" to="/community">Open Bravo Room</Link><p className="helper">Checkout and refunds remain paused.</p></section></>}
    </>}
  </Page>;
}
