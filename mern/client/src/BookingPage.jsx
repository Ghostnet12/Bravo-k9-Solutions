import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SERVICES, money, quote, serviceSelection } from '../../shared/catalog';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, SetupNotice, formatDate, formatTime } from './ui';
export function today() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-'); }
export function addDays(date, count) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
export default function BookingPage({ sitting = false }) {
  const { user, config } = useBravo(), [params] = useSearchParams();
  const editId = params.get('edit');
  const [ids, setIds] = useState([sitting ? 'sitting' : SERVICES.some(s => s.id === params.get('program')) ? params.get('program') : 'training']);
  const [visits, setVisits] = useState([]), [kind, setKind] = useState(sitting ? 'sitting' : params.get('program') === 'aggression' ? 'aggression' : 'training');
  const [from, setFrom] = useState(today()), [to, setTo] = useState(addDays(today(), 13));
  const [startTime, setStartTime] = useState('09:00'), [endTime, setEndTime] = useState('21:00');
  const [count, setCount] = useState(sitting ? 5 : 4), [preference, setPreference] = useState('any');
  const [days, setDays] = useState([]), [busy, setBusy] = useState(false), [loadingDays, setLoadingDays] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [saved, setSaved] = useState(null), [uncovered, setUncovered] = useState([]);
  const [form, setForm] = useState({ dogName: '', phone: '', address: '', notes: '' });
  const [requestKey, setRequestKey] = useState(crypto.randomUUID());
  const included = useMemo(() => [...new Set(serviceSelection(ids).flatMap(s => s.includes))], [ids]);
  const kinds = included.filter(k => k !== 'online');
  const pricing = quote(ids, visits);
  const hours = Array.from({ length: 13 }, (_, i) => `${i + 9}:00`.padStart(5, '0'));
  useEffect(() => { if (user) setForm(f => ({ ...f, dogName: f.dogName || user.dogName || '', phone: f.phone || user.phone || '', address: f.address || user.address || '' })); }, [user]);
  useEffect(() => { setSaved(null); setRequestKey(crypto.randomUUID()); }, [ids, visits, form]);
  useEffect(() => {
    if (!editId || !user) return;
    api('/bookings').then(({ bookings }) => {
      const booking = bookings.find(b => b._id === editId);
      if (!booking) throw new Error('Booking not found.');
      setIds(booking.serviceIds); setVisits(booking.visits); setKind(booking.visits[0]?.service || 'training');
      setForm({ dogName: booking.dogName, phone: booking.phone, address: booking.address, notes: booking.notes });
      if (booking.visits.length) { const dates = booking.visits.map(v => v.date).sort(); setFrom(dates[0]); setTo(dates.at(-1)); }
    }).catch(e => setError(e.message));
  }, [editId, user]);
  useEffect(() => {
    let cancelled = false;
    if (!config?.connected || !from || !to) { setDays([]); return; }
    setLoadingDays(true);
    api(`/availability?from=${from}&to=${to}`).then(data => { if (!cancelled) setDays(data.days); }).catch(e => { if (!cancelled) { setError(e.message); setDays([]); } }).finally(() => { if (!cancelled) setLoadingDays(false); });
    return () => { cancelled = true; };
  }, [from, to, config]);
  function select(id) {
    if (editId) return;
    const chosen = SERVICES.find(s => s.id === id);
    let next = chosen.bundle ? [id] : ids.filter(current => !SERVICES.find(s => s.id === current).bundle);
    if (!chosen.bundle) next = next.includes(id) ? next.filter(current => current !== id) : [...next.filter(current => !(id === 'aggression' && current === 'training') && !(id === 'training' && current === 'aggression')), id];
    if (!next.length) return;
    const includedNext = serviceSelection(next).flatMap(s => s.includes);
    setIds(next); setVisits(v => v.filter(visit => includedNext.includes(visit.service))); setKind(includedNext.find(s => s !== 'online') || 'training'); setError(''); setNotice('');
  }
  function addVisit(day) {
    if (visits.some(v => v.date === day.date && v.service === kind)) return;
    const time = day.slots.find(t => !visits.some(v => v.date === day.date && v.time === t));
    if (!time) return;
    setVisits(v => [...v, { date: day.date, time, service: kind }].sort((a,b) => a.date.localeCompare(b.date))); setUncovered([]);
  }
  async function auto() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/availability/auto', { method: 'POST', body: { count, startDate: from, startTime, endDate: to, endTime, preference, service: kind } });
      const other = visits.filter(v => v.service !== kind);
      if (result.visits.some(v => other.some(o => o.date === v.date && o.time === v.time))) throw new Error('An automatic time overlaps another service in your draft. Adjust that visit or choose a different time preference.');
      setVisits([...other, ...result.visits].sort((a,b) => a.date.localeCompare(b.date)));
      setUncovered(kind === 'sitting' ? result.uncoveredDates : []);
      setNotice(`Selected ${result.visits.length} ${kind} visits. ${result.boundaryWarning ? 'The first or last day has no selected visit. Review both boundaries carefully.' : 'Review each date and time below.'} These times are reserved only when you save the request.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/quote', { method: 'POST', body: { serviceIds: ids, visits } });
      if (editId) { await api(`/bookings/${editId}/visits`, { method: 'PATCH', body: { visits } }); setNotice('Your updated schedule is saved for Bravo to review.'); }
      else { const { booking } = await api('/bookings', { method: 'POST', body: { requestKey, serviceIds: ids, visits, ...form } }); setSaved(booking); setNotice('Request saved. Bravo will confirm the visit details. No card has been charged.'); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function pay() { setBusy(true); setError(''); try { const result = await api(`/bookings/${saved._id}/checkout`, { method: 'POST', body: {} }); window.location.assign(result.url); } catch (e) { setError(e.message); setBusy(false); } }
  return <Page title={sitting ? 'Plan your dog’s care.' : editId ? 'Adjust your visits.' : 'Let’s plan your visit.'} className="booking-page" eyebrow="BOOK WITH BRAVO" intro="Choose your program, review available visits, and send your request to Bravo. All times are local to Aberdeen, South Dakota.">
    <nav className="booking-steps" aria-label="Booking sections"><a href="#choose-program"><span>01</span> Your program</a>{!!kinds.length && <a href="#choose-dates"><span>02</span> Your dates</a>}<a href="#visit-details"><span>{kinds.length ? '03' : '02'}</span> Your details</a><a className="booking-review-link" href="#your-plan">Review plan <span aria-hidden="true">↘</span></a></nav><SetupNotice/><Notice error>{error}</Notice><Notice>{notice}</Notice><div className="booking-layout"><div className="booking-main">
      <section className="panel" id="choose-program"><div className="step-heading"><span>01</span><h2>Choose your programs</h2></div><p>Combine individual services or select one complete package.</p><div className="program-choices">{SERVICES.map(s => <button key={s.id} type="button" className={`program-choice ${ids.includes(s.id) ? 'is-selected' : ''}`} disabled={!!editId} aria-pressed={ids.includes(s.id)} onClick={() => select(s.id)}><span><strong>{s.name}</strong>{ids.includes(s.id) && <span className="selection-mark" aria-hidden="true">✓</span>}<small>{s.description}</small></span><b>{money(s.cents)}<small>{s.interval === 'month' ? '/month' : s.interval === 'day' ? '/day' : 'initial intake'}</small></b>{s.bundle && <em>PACKAGE</em>}</button>)}</div>{!sitting && <Link className="inline-link" to="/portal/dog-sitting">Only need dog sitting? Open the care scheduler →</Link>}</section>
      {!!kinds.length && <section className="panel" id="choose-dates"><div className="step-heading"><span>02</span><h2>Build your schedule</h2></div><p>Each visit has its own date and time. Requests use one available hourly slot per visit.</p>{kinds.length > 1 && <div className="tab-row" aria-label="Visit type">{kinds.map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={kind === k ? 'selected' : ''}>{k === 'sitting' ? 'Dog sitting' : 'Training'} visits</button>)}</div>}
      <div className="form-grid"><label>{kind === 'sitting' ? 'First day Bravo should arrive' : 'Start date'}<input type="date" min={today()} max={addDays(today(), 92)} value={from} onChange={e => { setFrom(e.target.value); setUncovered([]); }}/></label><label>{kind === 'sitting' ? 'Return-home date' : 'End date'}<input type="date" min={from} max={addDays(today(), 92)} value={to} onChange={e => { setTo(e.target.value); setUncovered([]); }}/></label><label>First arrival no earlier than<select value={startTime} onChange={e => setStartTime(e.target.value)}>{hours.map(t => <option key={t}>{t}</option>)}</select></label><label>Last visit no later than<select value={endTime} onChange={e => setEndTime(e.target.value)}>{hours.map(t => <option key={t}>{t}</option>)}</select></label><label>{kind === 'sitting' ? 'Number of care days' : 'Number of visits'}<input type="number" min="1" max="31" value={count} onChange={e => setCount(Number(e.target.value))}/></label><label>Preferred time<select value={preference} onChange={e => setPreference(e.target.value)}><option value="any">Any available time</option><option value="morning">Morning • 9–11 AM</option><option value="afternoon">Afternoon • noon–4 PM</option><option value="evening">Evening • 5–9 PM</option></select></label></div>
      <button className="button" type="button" disabled={busy || !config?.connected || !config?.schedule?.enabled} onClick={auto}>Find available days & times</button><p className="helper">Time preferences are flexible if no matching opening exists. For dog sitting, review any days without a visit before sending.</p>
      {config?.connected && !config.schedule.enabled && <Notice>Bravo is setting its availability. Please call us to arrange dates until online scheduling opens.</Notice>}
      {loadingDays ? <p role="status">Checking availability…</p> : <div className="date-grid" aria-label="Available days">{days.map(day => { const selected = visits.some(v => v.date === day.date && v.service === kind); return <button key={day.date} disabled={!day.slots.length && !selected} aria-pressed={selected} className={selected ? 'selected' : ''} onClick={() => addVisit(day)}><span className="date-weekday">{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {weekday:'short'})}</span><strong className="date-number">{day.date.slice(-2)}</strong><span className="date-month">{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {month:'short'})}</span><small>{selected ? 'Selected' : day.slots.length ? `${day.slots.length} openings` : 'No openings'}</small></button>; })}</div>}
      {!!uncovered.length && <Notice><strong>Care gaps to review:</strong> No sitting visit was selected for {uncovered.map(formatDate).join(', ')}. This is not continuous care. Change the number of days or contact Bravo if every day needs coverage.</Notice>}
      <div className="visit-list">{visits.map((visit, index) => { const available = days.find(d => d.date === visit.date)?.slots || []; const options = [...new Set([visit.time, ...available])].sort(); return <div className="visit-row" key={`${visit.date}-${visit.service}`}><span><strong>{formatDate(visit.date)}</strong><small>{visit.service}</small></span><label><span className="sr-only">Time for {visit.service} on {visit.date}</span><select value={visit.time} onChange={e => { const time = e.target.value; setVisits(v => v.map((item,i) => i === index ? { ...item, time } : item)); }}>{options.map(t => <option key={t} value={t} disabled={visits.some((v,i) => i !== index && v.date === visit.date && v.time === t)}>{formatTime(t)}</option>)}</select></label><button className="quiet-button" onClick={() => { setVisits(v => v.filter((_,i) => i !== index)); setUncovered([]); }} aria-label={`Remove ${visit.service} visit on ${visit.date}`}>Remove</button></div>; })}</div></section>}
      <section className="panel" id="visit-details"><div className="step-heading"><span>{kinds.length ? '03' : '02'}</span><h2>{editId ? 'Review your update' : 'Your visit details'}</h2></div>{!user ? <Notice><Link className="inline-link" to={`/account?next=${encodeURIComponent(sitting ? '/portal/dog-sitting' : `/portal?program=${ids[0]}`)}`}>Sign in or create your account</Link> before saving a request. No payment details are collected on this page.</Notice> : <form onSubmit={save}><div className="form-grid">{['dogName', 'phone', 'address'].map(field => <label className={field === 'address' ? 'full-width' : ''} key={field}>{{ dogName: 'Dog’s name', phone: 'Contact phone', address: 'Visit address' }[field]}<input value={form[field]} disabled={!!editId} required={field !== 'address' || kinds.length > 0} type={field === 'phone' ? 'tel' : 'text'} maxLength={field === 'address' ? 300 : field === 'phone' ? 30 : 80} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}/></label>)}</div><label>Anything the team should know?<textarea maxLength="1500" rows="3" disabled={!!editId} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/></label><p className="helper">Tell us about access instructions and behavior needs. Don’t include medical records or sensitive information in the Bravo Room.</p><button className="button" disabled={busy || !config?.connected || !!saved}>{busy ? 'Working…' : saved ? 'Request saved' : editId ? 'Save schedule changes' : 'Save request • no charge'}</button></form>}</section>
    </div><aside className="order-summary panel" id="your-plan"><p className="kicker gold">YOUR BRAVO PLAN</p><h2>Your plan, at a glance.</h2>{pricing.lines.map(l => <div className="price-row" key={l.id}><span>{l.name}{l.interval === 'day' ? ` × ${l.quantity} days` : ''}</span><strong>{money(l.unitCents * l.quantity)}</strong></div>)}{pricing.monthlyCents > 0 && <div className="price-total"><span>Monthly program</span><strong>{money(pricing.monthlyCents)}</strong></div>}{pricing.oneTimeCents > 0 && <div className="price-row"><span>One-time care / intake</span><strong>{money(pricing.oneTimeCents)}</strong></div>}<p>{visits.length} selected visits · No charge until you open and complete Stripe checkout.</p><p className="helper">Monthly programs renew until cancelled. Visits are subject to availability and Bravo confirmation. Paid sitting is per selected care day.</p>{saved && <><Notice>Saved to your account.</Notice><button className="button" disabled={busy || !config?.paymentsReady || saved.paymentStatus === 'covered'} onClick={pay}>{saved.paymentStatus === 'covered' ? 'Covered by membership' : 'Continue to Stripe'}</button><Link className="inline-link" to="/account">View my requests →</Link></>}{!config?.paymentsReady && <p className="helper">Card checkout is not connected yet. Bravo can follow up about your request.</p>}</aside></div>
  </Page>;
}
