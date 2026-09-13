import { useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { api } from './api';
import { Notice, formatDate } from './ui';
import { CREDIT_REASONS, creditableTerm, creditedEnd, remainingDays } from '../../shared/day-credits';
import { MEMBERSHIP_ZONE } from '../../shared/membership-terms';
import './day-credits.css';

const dateLabel = value => DateTime.fromJSDate(new Date(value), { zone: MEMBERSHIP_ZONE }).toFormat('LLL d, yyyy · h:mm a');

export default function MembershipDayCredits({ data, onSaved, expanded = false }) {
  const terms = (data.terms || []).filter(creditableTerm);
  const [chosenTerm, setChosenTerm] = useState(''), [days, setDays] = useState('1'), [reason, setReason] = useState('Rain');
  const [missedDate, setMissedDate] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(null);
  const term = terms.find(item => item.stripeId === chosenTerm) || terms[0];
  const count = Number(days), validDays = Number.isInteger(count) && count >= 1 && count <= 31;
  const nextEnd = term && validDays ? creditedEnd(term.validUntil, count) : null;
  const renewed = term && terms.some(item => item.renewalOf === term.stripeId);
  const bookings = (data.trainingBookings || []).filter(booking => booking._id === term?.bookingId || !booking.termEndsAt || (booking.termStartsAt === term?.validFrom && booking.termEndsAt === term?.validUntil));
  const missedDates = [...new Set(bookings.flatMap(booking => [...booking.visits, ...(booking.cancelledVisits || [])])
    .filter(visit => visit.service === 'training' && term && DateTime.fromISO(`${visit.date}T${visit.time}`, { zone: MEMBERSHIP_ZONE }).toMillis() >= new Date(term.validFrom).getTime()
      && DateTime.fromISO(`${visit.date}T${visit.time}`, { zone: MEMBERSHIP_ZONE }).toMillis() < new Date(term.validUntil).getTime()).map(visit => visit.date))].sort().reverse();
  const creditedDates = new Set((data.dayCredits || []).map(credit => credit.missedDate));
  async function save(event) {
    event.preventDefault(); if (busy || !term || !nextEnd) return;
    setBusy(true); setError('');
    const body = { clientId: data.client.id, termId: term.stripeId, expectedEnd: term.validUntil, days: count, reason, note, ...(missedDate ? { missedDate } : {}) };
    const signature = JSON.stringify(body);
    if (pending.current?.signature !== signature) pending.current = { signature, requestKey: crypto.randomUUID() };
    try {
      const result = await api('/client-schedule/credits', { method: 'POST', body: { ...body, requestKey: pending.current.requestKey } });
      await onSaved(result.message);
      pending.current = null; setNote(''); setDays('1'); setMissedDate('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <details className="membership-day-credits panel" open={expanded || undefined}>
    <summary>Credit days</summary>
    <p>Give {data.client.name} extra membership days for rain, snow, or missed training. Each credited day extends the end date by one calendar day, at no charge.</p>
    {!term ? <p>No eligible training membership. Save training membership dates first. An administrator must switch any automatic plan to manual renewal before days can be credited.</p> : <form onSubmit={save}>
      <fieldset disabled={busy}><legend className="sr-only">Credit training days for {data.client.name}</legend>
        <label>Membership to credit<select value={term.stripeId} onChange={event => { setChosenTerm(event.target.value); setMissedDate(''); setError(''); }}>
          {terms.map(item => <option key={item.stripeId} value={item.stripeId}>{dateLabel(item.validFrom)} – {dateLabel(item.validUntil)} · {item.serviceIds.join(' + ')}</option>)}
        </select></label>
        <label>Missed training date (optional)<select value={missedDate} onChange={event => { setMissedDate(event.target.value); if (event.target.value) setDays('1'); }}>
          <option value="">Just extend the membership</option>
          {missedDates.map(date => <option key={date} value={date} disabled={creditedDates.has(date)}>{formatDate(date)}{creditedDates.has(date) ? ' · Already credited' : ''}</option>)}
        </select></label>
        <p className="helper">Choose a missed date to cancel its training visits and credit one day together. Already-cancelled visits can also be credited. Leave this blank to add days without changing visits.</p>
        <div className="credit-fields">
          <label>Days to credit<input type="number" min="1" max="31" step="1" required value={days} disabled={!!missedDate} onChange={event => setDays(event.target.value)}/></label>
          <label>Reason<select value={reason} onChange={event => setReason(event.target.value)}>{CREDIT_REASONS.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        {nextEnd && <div className="credit-preview" role="status"><p>Current end: <strong>{dateLabel(term.validUntil)}</strong></p><p>New end: <strong>{dateLabel(nextEnd)}</strong></p>
          <p><strong>{remainingDays(term.validUntil)} → {remainingDays(nextEnd)} days remaining</strong> · Aberdeen time</p>
          {new Date(term.validFrom) > new Date() && <p>This membership starts {dateLabel(term.validFrom)}. Its start date stays the same.</p>}
          {nextEnd <= new Date() && <p>This extension still ends in the past. It will not create current membership access.</p>}
          {missedDate && <p>Training visits on {formatDate(missedDate)} will be marked cancelled when you save.</p>}
        </div>}
        {renewed && <Notice>This month has been renewed. Choose the latest training month to add the credit after its end date.</Notice>}
        <label>Note to the client (optional)<textarea maxLength={1200} value={note} onChange={event => setNote(event.target.value)}/></label>
        <p className="helper">The client sees the new end date and a credit notification. Use Add Days and Times to book a replacement visit with their trainer.</p>
        <Notice error>{error}</Notice>
        <button className="button" disabled={busy || !validDays || renewed}>{busy ? 'Saving credit…' : `Credit ${validDays ? count : ''} ${count === 1 ? 'day' : 'days'}`}</button>
      </fieldset>
    </form>}
    <CreditHistory credits={data.dayCredits}/>
  </details>;
}

export function CreditHistory({ credits = [] }) {
  if (!credits.length) return null;
  return <details className="credit-history"><summary>Credited days history</summary><ul>{credits.map(credit => <li key={credit._id}>
    <strong>+{credit.days} {credit.days === 1 ? 'day' : 'days'} · {credit.reason}</strong> — saved {dateLabel(credit.createdAt)}.
    {credit.missedDate && <> Missed training: {formatDate(credit.missedDate)}.</>} Membership extended to {dateLabel(credit.afterEnd)}.
    {credit.note && <p>{credit.note}</p>}
  </li>)}</ul></details>;
}
