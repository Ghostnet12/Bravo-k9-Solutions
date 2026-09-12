import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SERVICES, TRAINING_ADDITIONAL_DOG_CENTS, TRAINING_FOCUSES, money, quote, serviceSelection, rescheduledQuote, trainingFocusName } from '../../shared/catalog';
import { useBravo } from './context';
import { api } from './api';
import { Page, Notice, SetupNotice, AppointmentNotice, formatDate, formatTime } from './ui';
import ServiceIcon from './ServiceIcon';
import { toggleVisitSelection } from '../../shared/selection-state.js';
export function today() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-'); }
export function addDays(date, count) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
export function matchesTimePreference(time, preference) { return preference === 'morning' ? time <= '11:00' : preference === 'afternoon' ? time >= '12:00' && time <= '16:00' : preference === 'evening' ? time >= '17:00' : true; }
function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1); crypto.getRandomValues(random); const swap = random[0] % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
export default function BookingPage() {
  const { user, config, bookingDraft, setBookingDraft } = useBravo(), [params] = useSearchParams();
  const editId = params.get('edit');
  const catalog = config?.services?.length ? config.services : SERVICES;
  const program = SERVICES.some(s => s.id === params.get('program')) ? params.get('program') : 'training';
  const resume = !editId && params.get('resume') === '1' ? bookingDraft : null;
  const [ids, setIds] = useState(resume?.ids || [program]);
  const [visits, setVisits] = useState(resume?.visits || []), [kind, setKind] = useState(resume?.kind || (program === 'aggression' ? 'aggression' : program));
  const [trainingFocus, setTrainingFocus] = useState(resume?.trainingFocus || 'basic-obedience');
  const [trainerId, setTrainerId] = useState(resume?.trainerId || (/^[a-f\d]{24}$/i.test(params.get('trainer') || '') ? params.get('trainer') : '')), [trainers, setTrainers] = useState([]), [trainersLoading, setTrainersLoading] = useState(false);
  const [from, setFrom] = useState(resume?.from || today()), [to, setTo] = useState(resume?.to || addDays(today(), 13));
  const [startTime, setStartTime] = useState(resume?.startTime || '09:00'), [endTime, setEndTime] = useState(resume?.endTime || '21:00');
  const [count, setCount] = useState(resume?.count || 4), [preference, setPreference] = useState(resume?.preference || 'any');
  const [dogCount, setDogCount] = useState(resume?.dogCount || 1);
  const [days, setDays] = useState([]), [busy, setBusy] = useState(false), [loadingDays, setLoadingDays] = useState(false);
  const [availabilityShown, setAvailabilityShown] = useState(false);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [saved, setSaved] = useState(null), [editingBooking, setEditingBooking] = useState(null), [uncovered, setUncovered] = useState([]);
  const [form, setForm] = useState(resume?.form || { dogName: '', phone: '', address: '', notes: '' });
  const [requestKey, setRequestKey] = useState(resume?.requestKey || crypto.randomUUID());
  const included = useMemo(() => [...new Set(serviceSelection(ids, catalog).flatMap(s => s.includes))], [ids, catalog]);
  const kinds = included.filter(k => k !== 'online');
  const pricing = editingBooking ? rescheduledQuote(editingBooking, visits) : quote(ids, visits, { dogCount }, catalog);
  const covered = saved?.paymentStatus === 'covered';
  const waitlisted = saved?.status === 'waitlisted';
  const chosenTrainer = trainers.find(trainer => trainer.id === trainerId);
  const unavailable = !editId && ids.some(id => catalog.find(service => service.id === id)?.enabled === false);
  const trainingMonthlyCents = pricing.lines.filter(line => line.id === 'training' || line.id === 'training-additional-dogs').reduce((total, line) => total + line.unitCents * line.quantity, 0);
  const hours = Array.from({ length: 13 }, (_, i) => `${i + 9}:00`.padStart(5, '0'));
  useEffect(() => {
    const resetCheckoutButton = () => setBusy(false);
    window.addEventListener('pageshow', resetCheckoutButton);
    return () => window.removeEventListener('pageshow', resetCheckoutButton);
  }, []);
  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => document.getElementById('booking-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [error]);
  useEffect(() => { if (user) setForm(f => ({ ...f, dogName: f.dogName || user.dogName || '', phone: f.phone || user.phone || '', address: f.address || user.address || '' })); }, [user]);
  useEffect(() => { if (!editId && !saved) setBookingDraft({ ids, visits, kind, trainingFocus, trainerId, from, to, startTime, endTime, count, preference, dogCount, form, requestKey }); }, [editId, saved, ids, visits, kind, trainingFocus, trainerId, from, to, startTime, endTime, count, preference, dogCount, form, requestKey, setBookingDraft]);
  useEffect(() => { setSaved(null); setRequestKey(crypto.randomUUID()); }, [ids, visits, dogCount, trainerId, form]);
  useEffect(() => {
    let cancelled = false;
    if (!user || !ids.includes('training')) { setTrainers([]); return; }
    setTrainersLoading(true);
    api('/trainers').then(data => { if (!cancelled) setTrainers(data.trainers); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setTrainersLoading(false); });
    return () => { cancelled = true; };
  }, [user, ids]);
  useEffect(() => {
    if (!editId || !user) return;
    const source = ['staff', 'owner'].includes(user.role) ? api(`/admin/bookings/${editId}`).then(data => ({ bookings: [data.booking] })) : api('/bookings');
    source.then(({ bookings }) => {
      const booking = bookings.find(b => b._id === editId);
      if (!booking) throw new Error('Booking not found.');
      if (booking.serviceIds.some(id => !SERVICES.some(service => service.id === id))) throw new Error('Contact Bravo to change visits for a retired program.');
      setEditingBooking(booking); setIds(booking.serviceIds); setVisits(booking.visits); setKind(booking.visits[0]?.service || 'training'); setTrainingFocus(booking.trainingFocus || 'basic-obedience'); setTrainerId(booking.staffId || booking.requestedStaffId || ''); setDogCount(booking.dogCount || 1);
      setForm({ dogName: booking.dogName, phone: booking.phone, address: booking.address, notes: booking.notes });
      if (booking.visits.length) { const dates = booking.visits.map(v => v.date).sort(); setFrom(dates[0]); setTo(dates.at(-1)); }
    }).catch(e => setError(e.message));
  }, [editId, user]);
  useEffect(() => {
    let cancelled = false;
    if (!config?.connected || !from || !to) { setDays([]); return; }
    setLoadingDays(true);
    api(`/availability?from=${from}&to=${to}${trainerId ? `&staffId=${encodeURIComponent(trainerId)}` : ''}`).then(data => { if (!cancelled) setDays(data.days); }).catch(e => { if (!cancelled) { setError(e.message); setDays([]); } }).finally(() => { if (!cancelled) setLoadingDays(false); });
    return () => { cancelled = true; };
  }, [from, to, config, availabilityVersion, trainerId]);
  function select(id) {
    if (editId) return;
    const chosen = catalog.find(s => s.id === id);
    let next = chosen.bundle ? [id] : ids.filter(current => !catalog.find(s => s.id === current).bundle);
    if (!chosen.bundle) next = next.includes(id) ? next.filter(current => current !== id) : [...next.filter(current => !(id === 'aggression' && current === 'training') && !(id === 'training' && current === 'aggression')), id];
    if (!next.length) return;
    const includedNext = serviceSelection(next, catalog).flatMap(s => s.includes);
    setIds(next); setVisits(v => v.filter(visit => includedNext.includes(visit.service))); setKind(includedNext.find(s => s !== 'online') || 'training'); setError(''); setNotice('');
  }
  function addVisit(day) {
    setVisits(current => toggleVisitSelection(current, day, kind));
    setUncovered([]); setError(''); setNotice('');
  }
  function resetSchedule() {
    setVisits([]); setUncovered([]); setError(''); setSaved(null);
    setBookingDraft(null); setRequestKey(crypto.randomUUID());
    setAvailabilityShown(true); setAvailabilityVersion(value => value + 1);
    setNotice('All selected dates and times were cleared. Available days stay highlighted. Saved bookings were not changed.');
  }
  function showAvailability() {
    setError(''); setUncovered([]); setAvailabilityShown(true);
    setNotice('Available dates and times are highlighted below. Nothing was selected. Choose every date you want.');
  }
  function makeMySchedule() {
    setError(''); setUncovered([]); setAvailabilityShown(true);
    const otherServices = visits.filter(visit => visit.service !== kind);
    const candidates = days.flatMap(day => {
      const slots = day.slots.filter(time => time >= startTime && time <= endTime && matchesTimePreference(time, preference) && !otherServices.some(visit => visit.date === day.date && visit.time === time));
      if (!slots.length) return [];
      return [{ date: day.date, slots }];
    });
    if (candidates.length < count) { setError(`Only ${candidates.length} matching ${candidates.length === 1 ? 'day is' : 'days are'} available. Choose fewer automatic visits or widen the dates and times.`); return; }
    const automatic = shuffled(candidates).slice(0, count).map(day => ({ date: day.date, time: shuffled(day.slots)[0], service: kind }));
    setVisits([...otherServices, ...automatic].sort((a, b) => a.date.localeCompare(b.date)));
    setNotice(`Made a random schedule with ${automatic.length} ${automatic.length === 1 ? 'visit' : 'visits'}. Review every selected date and time before saving.`);
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!editId && ids.includes('training') && !trainerId) throw new Error('Choose your trainer before saving this training request.');
      if (!editId) await api('/quote', { method: 'POST', body: { serviceIds: ids, visits, dogCount } });
      if (editId) { await api(`/bookings/${editId}/visits`, { method: 'PATCH', body: { visits } }); setNotice('Your updated schedule is saved for Bravo to review.'); }
      else { const { booking } = await api('/bookings', { method: 'POST', body: { requestKey, serviceIds: ids, visits, trainingFocus: ids.includes('training') ? trainingFocus : undefined, preferredTrainerId: ids.includes('training') ? trainerId : undefined, dogCount, ...form } }); setSaved(booking); setBookingDraft(null); setNotice(booking.status === 'waitlisted' ? `You joined ${chosenTrainer?.name || 'this trainer'}’s waiting list. Your preferred dates were saved, no calendar time was reserved, and no card was charged.` : 'Request saved. Bravo will confirm the visit details. No card has been charged.'); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function pay() { if (!saved || covered || waitlisted || !config?.paymentsReady) return; setBusy(true); setError(''); try { const result = await api(`/bookings/${saved._id}/checkout`, { method: 'POST', body: {} }); window.location.assign(result.url); } catch (e) { setError(e.message); setBusy(false); } }
  return <Page title={editId ? 'Adjust your visits.' : 'Let’s plan your visit.'} className="booking-page" eyebrow="BOOK WITH BRAVO" intro="Choose your program, review available visits, and send your request to Bravo. All times are local to Aberdeen, South Dakota.">
    <nav className="booking-steps" aria-label="Booking sections"><a href="#choose-program"><span>01</span> Your program</a>{!!kinds.length && <a href="#choose-dates"><span>02</span> Your dates</a>}<a href="#visit-details"><span>{kinds.length ? '03' : '02'}</span> Your details</a><a className="booking-review-link" href="#your-plan">Review plan <span aria-hidden="true">↘</span></a></nav><SetupNotice/>{unavailable && <Notice error>A selected service is temporarily unavailable. Choose an available program before saving.</Notice>}{config?.paymentsMode === 'test' && <Notice>This is a Stripe test checkout. It cannot accept a real payment.</Notice>}<AppointmentNotice/><div id="booking-error"><Notice error>{error}</Notice></div><Notice>{notice}</Notice><div className="booking-layout"><div className="booking-main"><fieldset className="booking-fields" disabled={busy || !!saved}>
      <section className="panel" id="choose-program"><div className="step-heading"><span>01</span><h2>Choose a service</h2></div><p>Pick the path that fits your dog. Pricing stays visible from the first tap.</p><div className="program-choices">{catalog.filter(service => service.enabled !== false).map(s => <button key={s.id} type="button" className={`program-choice ${ids.includes(s.id) ? 'is-selected' : ''}`} disabled={!!editId} aria-pressed={ids.includes(s.id)} onClick={() => select(s.id)}><ServiceIcon service={s.id}/><span><strong>{s.name}</strong>{ids.includes(s.id) && <span className="selection-mark" aria-hidden="true">✓</span>}<small>{s.description}</small></span><b>{money(s.cents)}<small>{s.interval === 'month' ? '/month' : s.interval === 'walk' ? '/dog · 30 min' : ' initial intake'}</small></b></button>)}</div>{ids.some(id => ['training', 'walking'].includes(id)) && <div className="dog-count"><span><strong>Number of dogs</strong><small>{ids.includes('training') && <>Training is {money(catalog.find(service => service.id === 'training')?.cents ?? 20000)}/month for the first dog plus {money(TRAINING_ADDITIONAL_DOG_CENTS)}/month for each additional dog.</>}{ids.includes('training') && ids.includes('walking') && <br/>}{ids.includes('walking') && <>Dog Walking is {money(catalog.find(service => service.id === 'walking')?.cents ?? 2500)} per dog for each 30-minute walk.</>}</small></span><div className="dog-count-stepper"><button type="button" aria-label="Remove one dog" disabled={!!editId || dogCount <= 1} onClick={() => setDogCount(value => Math.max(1, value - 1))}>−</button><input aria-label="Number of dogs for selected services" type="number" min="1" max="10" value={dogCount} disabled={!!editId} onChange={e => setDogCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}/><button type="button" aria-label="Add one dog" disabled={!!editId || dogCount >= 10} onClick={() => setDogCount(value => Math.min(10, value + 1))}>+</button></div></div>}{ids.includes('training') && <div className="trainer-choice"><label>Choose my trainer<select aria-label="Choose my trainer" value={trainerId} disabled={!!editId || trainersLoading || !user} onChange={e => setTrainerId(e.target.value)}><option value="">{!user ? 'Sign in to choose a trainer' : trainersLoading ? 'Checking trainer availability…' : 'Select a trainer'}</option>{trainers.map(trainer => <option key={trainer.id} value={trainer.id}>{trainer.name} — {trainer.spotsRemaining > 0 ? `${trainer.spotsRemaining} of ${trainer.limit} dog spots open` : 'full · join waiting list'}</option>)}</select></label><p className="helper">Choose any trainer manually. A trainer can serve up to five active dogs. If your choice cannot fit all {dogCount} {dogCount === 1 ? 'dog' : 'dogs'}, your request joins that trainer’s waiting list without reserving dates or charging you.</p>{chosenTrainer?.full && <Notice>{chosenTrainer.name} is currently full. Saving will join the waiting list; you can select another trainer with an open spot instead.</Notice>}{chosenTrainer && !chosenTrainer.full && chosenTrainer.spotsRemaining < dogCount && <Notice>{chosenTrainer.name} has {chosenTrainer.spotsRemaining} dog {chosenTrainer.spotsRemaining === 1 ? 'spot' : 'spots'} open, which cannot fit this {dogCount}-dog request. Saving will join the waiting list.</Notice>}</div>}</section>
      {!!kinds.length && <section className="panel" id="choose-dates"><div className="step-heading"><span>02</span><h2>Build your schedule</h2></div><p>Each visit has its own date and time. Requests use one available hourly slot per visit.</p>
      {kinds.length > 1 && <label>Schedule service<select aria-label="Schedule service" value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setAvailabilityShown(false); setNotice(''); }}>{kinds.map(service => <option key={service} value={service}>{catalog.find(item => item.id === service)?.name || service}</option>)}</select></label>}
      {kind === 'training' ? <label>Schedule visits for<select aria-label="Training focus" value={trainingFocus} disabled={busy} onChange={e => setTrainingFocus(e.target.value)}>{TRAINING_FOCUSES.map(focus => <option key={focus.id} value={focus.id}>{focus.name}</option>)}</select></label> : kinds.length === 1 && <label>Schedule visits for<select aria-label="Schedule visits for" value={kind} disabled><option value={kind}>{catalog.find(item => item.id === kind)?.name || kind}</option></select></label>}
      <div className="form-grid"><label>Start date<input type="date" min={today()} max={addDays(today(), 92)} value={from} onChange={e => { setFrom(e.target.value); setUncovered([]); setAvailabilityShown(false); setNotice(''); }}/></label><label>End date<input type="date" min={from} max={addDays(today(), 92)} value={to} onChange={e => { setTo(e.target.value); setUncovered([]); setAvailabilityShown(false); setNotice(''); }}/></label><label>First visit no earlier than<select value={startTime} onChange={e => { setStartTime(e.target.value); setAvailabilityShown(false); setNotice(''); }}>{hours.map(t => <option key={t}>{t}</option>)}</select></label><label>Last visit no later than<select value={endTime} onChange={e => { setEndTime(e.target.value); setAvailabilityShown(false); setNotice(''); }}>{hours.map(t => <option key={t}>{t}</option>)}</select></label><label>Visits for “Make my schedule”<input type="number" min="1" max="31" value={count} onChange={e => { setCount(Math.max(1, Math.min(31, Number(e.target.value) || 1))); setAvailabilityShown(false); setNotice(''); }}/></label><label>Preferred time<select value={preference} onChange={e => { setPreference(e.target.value); setAvailabilityShown(false); setNotice(''); }}><option value="any">Any available time</option><option value="morning">Morning • 9–11 AM</option><option value="afternoon">Afternoon • noon–4 PM</option><option value="evening">Evening • 5–9 PM</option></select></label></div>
      <div className="booking-schedule-actions"><button className="button" type="button" disabled={busy || !config?.connected || !config?.schedule?.enabled} onClick={showAvailability}>Find available days & times</button><button className="button button-ghost" type="button" disabled={busy || loadingDays || !config?.connected || !config?.schedule?.enabled} onClick={makeMySchedule}>Make my schedule</button><button className="button button-ghost" type="button" disabled={busy} onClick={resetSchedule}>Reset schedule</button></div><p className="helper">Find highlights openings without selecting them. Tap a date to select it; tap it again to remove it. Make my schedule chooses random visits. Reset clears all selections while keeping available days highlighted.</p>
      {config?.connected && !config.schedule.enabled && <Notice>Bravo is setting its availability. Please call us to arrange dates until online scheduling opens.</Notice>}
      {availabilityShown && !loadingDays && days.length > 0 && <div className="availability-legend" aria-label="Availability key"><span><i className="available" aria-hidden="true"/>Available</span><span><i className="selected" aria-hidden="true"/>Selected</span><span><i className="unavailable" aria-hidden="true"/>Unavailable</span></div>}
      {availabilityShown && (loadingDays ? <p role="status">Checking availability…</p> : <div className="date-grid" aria-label="Available days and times">{days.map(day => { const selected = visits.some(v => v.date === day.date && v.service === kind); const slots = day.slots.filter(time => time >= startTime && time <= endTime && matchesTimePreference(time, preference)); const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); const range = slots.length ? `${formatTime(slots[0])} to ${formatTime(slots.at(-1))}` : ''; const state = selected ? 'selected' : slots.length ? 'available' : 'unavailable'; return <button key={day.date} type="button" disabled={!slots.length && !selected} aria-pressed={selected} aria-label={`${dateLabel}: ${selected ? 'selected; tap again to unselect' : slots.length ? `${slots.length} available times, ${range}` : 'unavailable'}`} className={state} onClick={() => addVisit({ ...day, slots })}><span className="date-weekday">{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {weekday:'short'})}</span><strong className="date-number">{day.date.slice(-2)}</strong><span className="date-month">{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {month:'short'})}</span><small>{selected ? 'Selected' : slots.length ? <>{slots.length} {slots.length === 1 ? 'time' : 'times'}<span className="date-time-range">{range}</span></> : 'Unavailable'}</small></button>; })}</div>)}
      <div className="visit-list">{visits.map((visit, index) => { const available = days.find(d => d.date === visit.date)?.slots || []; const options = [...new Set([visit.time, ...available])].sort(); const visitName = visit.service === 'training' ? trainingFocusName(trainingFocus) : visit.service; return <div className="visit-row" key={`${visit.date}-${visit.service}`}><span><strong>{formatDate(visit.date)}</strong><small>{visitName}</small></span><label><span className="sr-only">Time for {visitName} on {visit.date}</span><select value={visit.time} onChange={e => { const time = e.target.value; setVisits(v => v.map((item,i) => i === index ? { ...item, time } : item)); }}>{options.map(t => <option key={t} value={t} disabled={visits.some((v,i) => i !== index && v.date === visit.date && v.time === t)}>{formatTime(t)}</option>)}</select></label><button className="quiet-button" onClick={() => { setVisits(v => v.filter((_,i) => i !== index)); setUncovered([]); }} aria-label={`Remove ${visitName} visit on ${visit.date}`}>Remove</button></div>; })}</div></section>}
      <section className="panel" id="visit-details"><div className="step-heading"><span>{kinds.length ? '03' : '02'}</span><h2>{editId ? 'Review your update' : 'Your visit details'}</h2></div>{!user ? <Notice><Link className="inline-link" to={`/account?next=${encodeURIComponent('/portal?resume=1')}`}>Sign in or create your account</Link> before saving a request. Your plan will still be here when you return. No payment details are collected on this page.</Notice> : <form onSubmit={save}><div className="form-grid">{['dogName', 'phone', 'address'].map(field => <label className={field === 'address' ? 'full-width' : ''} key={field}>{{ dogName: ids.some(id => ['training', 'walking'].includes(id)) && dogCount > 1 ? 'Dogs’ names' : 'Dog’s name', phone: 'Contact phone', address: 'Visit address' }[field]}<input value={form[field]} disabled={!!editId} required={field !== 'address' || kinds.length > 0} type={field === 'phone' ? 'tel' : 'text'} autoComplete={field === 'phone' ? 'tel' : field === 'address' ? 'street-address' : 'off'} maxLength={field === 'address' ? 300 : field === 'phone' ? 30 : 80} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}/></label>)}</div><label>Anything the team should know?<textarea maxLength="1500" rows="3" disabled={!!editId} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/></label><p className="helper">Tell us about training goals, access instructions, and behavior needs. Don’t include medical records or sensitive information in the Bravo Room.</p><AppointmentNotice compact/><button className="button" disabled={busy || !config?.connected || !!saved || unavailable}>{busy ? 'Working…' : saved ? 'Request saved' : editId ? 'Save schedule changes' : 'Save request • no charge'}</button></form>}</section>
    </fieldset></div>
    <aside className="order-summary panel" id="your-plan">
      <p className="kicker gold">YOUR BRAVO PLAN</p><h2>Your plan, at a glance.</h2>
      {pricing.lines.map(line => <div className="price-row" key={line.id}><span>{line.name}{line.id === 'training' && <small>{dogCount} {dogCount === 1 ? 'dog' : 'dogs'} · {money(line.unitCents)} first dog{dogCount > 1 ? ` + ${money(TRAINING_ADDITIONAL_DOG_CENTS)} each additional dog` : ''}</small>}{line.id === 'walking' && <small>{dogCount} {dogCount === 1 ? 'dog' : 'dogs'} × {visits.filter(visit => visit.service === 'walking').length} {visits.filter(visit => visit.service === 'walking').length === 1 ? 'walk' : 'walks'} × {money(line.unitCents)}<br/>30 minutes per walk</small>}</span><strong>{money(line.unitCents * line.quantity)}</strong></div>)}
      {pricing.monthlyCents > 0 && <div className="price-total"><span>Monthly program</span><strong>{money(pricing.monthlyCents)}</strong></div>}
      {pricing.oneTimeCents > 0 && <div className="price-row"><span>Scheduled services total</span><strong>{money(pricing.oneTimeCents)}</strong></div>}
      <p>{visits.length} selected visits · {waitlisted ? 'Saved as preferred dates while waiting.' : config?.paymentsReady ? 'Secure checkout opens after saving.' : 'Bravo will confirm payment separately.'}</p>
      <p className="helper">Monthly programs renew until cancelled. Visits are subject to availability and Bravo confirmation.</p><AppointmentNotice compact/>
      {saved && <section className="checkout-ready" aria-labelledby="checkout-ready-title"><div className="checkout-secure-mark" aria-hidden="true">✓</div><p className="kicker gold">REQUEST SAVED</p><h3 id="checkout-ready-title">{waitlisted ? `You’re on ${chosenTrainer?.name || 'your trainer'}’s waiting list.` : covered ? 'Your membership covers this request.' : 'Ready for secure checkout.'}</h3><div className="checkout-due"><span>{waitlisted ? 'Due while waiting' : 'Due today'}</span><strong>{money(waitlisted || covered ? 0 : saved.quote?.dueNowCents ?? pricing.dueNowCents)}</strong></div>{!waitlisted && !covered && pricing.monthlyCents > 0 && <p className="checkout-term"><strong>{money(pricing.monthlyCents)}/month</strong> is a one-month purchase. Renew manually from your account; no automatic payment is taken.</p>}{!waitlisted && !covered && pricing.oneTimeCents > 0 && <p className="checkout-term"><strong>{money(pricing.oneTimeCents)}</strong> in scheduled service charges is included today.</p>}<p className="helper">{waitlisted ? 'No calendar time is reserved and no payment is due until a trainer spot opens. Bravo will review your saved date preferences when your request can be activated.' : covered ? 'No additional payment is due for this request. Your existing paid access keeps its recorded end date.' : 'Payment is completed on Stripe’s secure checkout. Bravo never receives or stores your full card number.'}</p>{waitlisted || covered ? null : config?.paymentsReady ? <button className="button checkout-button" type="button" disabled={busy} onClick={pay}>{busy ? 'Opening secure checkout…' : <>Continue to secure checkout <span aria-hidden="true">→</span></>}</button> : <Notice>Online payment is temporarily unavailable. Your request is saved and Bravo will contact you.</Notice>}<Link className="inline-link" to="/account">View my saved request →</Link></section>}
      {!config?.paymentsReady && !saved && <p className="helper">Bravo will follow up about payment after confirming your request.</p>}
    </aside></div>
    <div className="mobile-booking-bar"><span>{saved ? <><strong>{waitlisted ? 'Trainer waiting list' : `${money(covered ? 0 : saved.quote?.dueNowCents ?? pricing.dueNowCents)} due today`}</strong><small>{waitlisted ? 'No dates reserved · no payment due' : covered ? 'Request saved · membership covered' : 'Request saved · secure payment next'}</small></> : ids.includes('training') ? <><strong>{dogCount} {dogCount === 1 ? 'dog' : 'dogs'} · {money(trainingMonthlyCents)}/month</strong><small>$200 first dog · $100 each additional dog</small></> : ids.includes('walking') ? <><strong>{dogCount} {dogCount === 1 ? 'dog' : 'dogs'} × {money(catalog.find(service => service.id === 'walking')?.cents ?? 2500)}</strong><small>30-minute walk · {visits.length ? `${visits.length} selected` : 'choose a time'}</small></> : <><strong>{pricing.lines.map(line => line.name).join(' + ')}</strong><small>{visits.length ? `${visits.length} selected visits` : 'Choose your schedule'}</small></>}</span>{waitlisted || covered ? <Link className="button" to="/account">View request</Link> : saved && config?.paymentsReady ? <button className="button" type="button" disabled={busy} onClick={pay}>{busy ? 'Opening…' : 'Secure checkout'} <span aria-hidden="true">→</span></button> : <a className="button" href={visits.length || !kinds.length ? '#visit-details' : '#choose-dates'}>{visits.length || !kinds.length ? 'Review details' : 'Choose a time'} <span aria-hidden="true">→</span></a>}</div>
  </Page>;
}
