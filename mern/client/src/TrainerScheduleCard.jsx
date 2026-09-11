import { useEffect, useState } from 'react';
import { api } from './api';
import { startTimeRanges } from '../../shared/trainer-schedule.js';

export function notifyTrainerScheduleChanged() {
  window.dispatchEvent(new Event('bravo:trainer-schedule'));
  try { localStorage.setItem('bravo-trainer-schedule-refresh', String(Date.now())); } catch { /* polling also refreshes other tabs */ }
}
export function useLiveTrainerSchedules() {
  const [state, setState] = useState({ schedules: {}, checkedAt: null, error: '', loading: true });
  useEffect(() => {
    let active = true, controller, sequence = 0, pending = false;
    const load = async (force = false) => {
      if (document.hidden || (pending && !force)) return;
      controller?.abort(); controller = new AbortController();
      const current = controller, ticket = ++sequence; pending = true;
      try {
        const result = await api('/team/schedules', { signal: current.signal, cache: 'no-store' });
        if (active && ticket === sequence && !current.signal.aborted) setState({ schedules: Object.fromEntries(result.schedules.map(schedule => [schedule.staffId, schedule])), checkedAt: result.checkedAt, error: '', loading: false });
      } catch (error) {
        if (active && ticket === sequence && !current.signal.aborted) setState(previous => ({ ...previous, loading: false, error: 'Schedule temporarily unavailable. Contact Bravo for current availability.' }));
      } finally { if (ticket === sequence) pending = false; }
    };
    const refresh = () => void load(true);
    const storage = event => { if (event.key === 'bravo-trainer-schedule-refresh') refresh(); };
    void load(); const timer = setInterval(() => void load(), 10000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    window.addEventListener('bravo:trainer-schedule', refresh); window.addEventListener('storage', storage);
    return () => { active = false; sequence++; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); window.removeEventListener('bravo:trainer-schedule', refresh); window.removeEventListener('storage', storage); };
  }, []);
  return state;
}
const dateLabel = date => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(new Date(`${date}T12:00:00Z`));
export default function TrainerScheduleCard({ person, live }) {
  const schedule = live.schedules[person.id];
  const rows = days => <dl className="trainer-working-days">{days.map(day => <div key={day.date} data-date={day.date} data-status={day.status}><dt><time dateTime={day.date}>{dateLabel(day.date)}</time></dt><dd>{day.hours.length ? startTimeRanges(day.hours) : <span className="trainer-off-day">Off / unavailable</span>}</dd></div>)}</dl>;
  return <section className="trainer-live-schedule" aria-label={`${person.name} working schedule`} data-trainer-id={person.id}>
    <div className="trainer-schedule-heading"><h4>Working schedule</h4><span className="trainer-live-badge">{live.error ? 'Unavailable' : live.loading ? 'Loading' : 'Live updates'}</span></div>
    <p className="trainer-timezone">Aberdeen time · Hourly session starts</p>
    {live.error ? <p className="trainer-schedule-error" role="status">{live.error}</p> : !schedule ? <p>{live.loading ? 'Checking this trainer’s schedule…' : 'Schedule not published. Contact Bravo.'}</p> : <>
      {schedule.source === 'team' && <p className="trainer-schedule-source">Using shared team hours until personalized.</p>}
      {rows(schedule.days.slice(0, 7))}
      <details><summary>See the following week</summary>{rows(schedule.days.slice(7))}</details>
      <p className="trainer-schedule-note">Working hours, not guaranteed openings. Check the booking calendar before requesting a visit.</p>
      <a className="inline-link" href={`/portal?trainer=${encodeURIComponent(person.id)}`}>Check this trainer’s openings →</a>
    </>}
    {!live.error && live.checkedAt && <p className="trainer-schedule-updated">Checked {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(new Date(live.checkedAt))} · Refreshes every 10 seconds</p>}
  </section>;
}
