import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useBravo } from './context';
import { Notice } from './ui';
import { TRAINER_HOURS, TRAINER_WEEKDAYS, startTimeLabel, startTimeRanges } from '../../shared/trainer-schedule.js';
import { notifyTrainerScheduleChanged } from './TrainerScheduleCard';

export default function StaffScheduleEditor({ team = [] }) {
  const { user } = useBravo();
  const [staffId, setStaffId] = useState(user.id);
  return <section className="panel staff-personal-schedule" id="my-working-schedule"><p className="kicker gold">CONNECTED TO YOUR HOMEPAGE PHOTO</p><h2>My working schedule.</h2><p>Publish working days and days off here. Your homepage schedule updates automatically; another trainer’s personal schedule is not changed.</p>
    {user.role === 'owner' && <label htmlFor="schedule-trainer">Trainer<select id="schedule-trainer" aria-label="Schedule for trainer" value={staffId} onChange={e => { if (window.confirm('Switch trainers? Any unpublished schedule edits will be discarded.')) setStaffId(e.target.value); }}>{team.map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>}
    <Editor key={staffId} staffId={staffId}/>
  </section>;
}
function Editor({ staffId }) {
  const [draft, setDraft] = useState(null), [saved, setSaved] = useState(null), [meta, setMeta] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [mode, setMode] = useState('off');
  const [version, setVersion] = useState(0); const alive = useRef(false);
  useEffect(() => {
    alive.current = true; let active = true;
    setDraft(null); setSaved(null); setError('');
    api(`/admin/trainer-schedules/${staffId}`).then(result => { if (active) { setDraft(result.schedule); setSaved(result.schedule); setMeta(result); } }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; alive.current = false; };
  }, [staffId, version]);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  function toggle(key, value) { setDraft(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value].sort() })); setNotice(''); }
  function setExceptions() {
    setError(''); setNotice('');
    if (!from || !to || from < meta.today || to > meta.maxDate || to < from) { setError('Choose a valid date range within the next 92 days.'); return; }
    if (mode === 'working' && !draft.hours.length) { setError('Select at least one session start time before adding working days.'); return; }
    const map = new Map(draft.overrides.map(day => [day.date, day]));
    for (let date = from; date <= to;) {
      const value = new Date(`${date}T12:00:00Z`), weekday = value.getUTCDay();
      if (weekday >= 1 && weekday <= 5) map.set(date, { date, hours: mode === 'off' ? [] : [...draft.hours] });
      value.setUTCDate(value.getUTCDate() + 1); date = value.toISOString().slice(0, 10);
    }
    setDraft(current => ({ ...current, overrides: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) }));
    setFrom(''); setTo(''); setNotice('Dates added to your draft. Save & publish to update your homepage schedule. Weekends remain closed.');
  }
  async function publish(e) {
    e.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/admin/trainer-schedules/${staffId}`, { method: 'PUT', body: draft });
      if (!alive.current) return;
      setSaved(result.schedule); setDraft(result.schedule); setMeta(current => ({ ...current, inherited: false })); notifyTrainerScheduleChanged();
      setNotice('Schedule saved and published beneath the trainer’s homepage photo. Open homepages update within about 10 seconds.');
    } catch (err) { if (alive.current) setError(err.message); } finally { if (alive.current) setBusy(false); }
  }
  return <><Notice error>{error}</Notice><Notice>{notice}</Notice>
    {!draft ? <><p role="status">{error ? 'The saved schedule could not be loaded.' : 'Loading your saved schedule…'}</p>{error && <button type="button" className="quiet-button" onClick={() => setVersion(n => n + 1)}>Try loading again</button>}</> : <form onSubmit={publish}>
      <fieldset disabled={busy} className="personal-schedule-fields"><legend className="sr-only">Trainer working schedule</legend>
        {meta.inherited && <p className="helper">No personal schedule saved yet. The homepage currently uses shared team hours. Saving here creates this trainer’s own schedule.</p>}
        {!meta.team.enabled && <Notice>Online booking is paused for the whole team. Your schedule can be saved, but public openings remain unavailable until the team calendar is enabled.</Notice>}
        <label className="check-label"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(current => ({ ...current, enabled: e.target.checked }))}/>Available for training requests</label>
        <fieldset><legend>My regular working days</legend><div className="check-grid">{TRAINER_WEEKDAYS.map((day, index) => <label className="check-label" key={day}><input type="checkbox" aria-label={`Work ${day}`} checked={draft.weekdays.includes(index + 1)} onChange={() => toggle('weekdays', index + 1)}/>{day}</label>)}</div></fieldset>
        <fieldset><legend>My session start times</legend><div className="check-grid">{TRAINER_HOURS.map(time => <label className="check-label" key={time}><input type="checkbox" checked={draft.hours.includes(time)} onChange={() => toggle('hours', time)}/>{startTimeLabel(time)}</label>)}</div></fieldset>
        <p className="helper">All times are Aberdeen time. Weekends remain closed; shared team closures and time-off blocks still apply.</p>
        <div className="trainer-exceptions"><h3>Specific days off or extra working days</h3><div className="form-grid">
          <label>From date<input type="date" aria-label="Exception start date" min={meta.today} max={meta.maxDate} value={from} onChange={e => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }}/></label>
          <label>Through date<input type="date" aria-label="Exception end date" min={from || meta.today} max={meta.maxDate} value={to} onChange={e => setTo(e.target.value)}/></label>
          <label>Set those weekdays to<select aria-label="Exception type" value={mode} onChange={e => setMode(e.target.value)}><option value="off">Day off</option><option value="working">Working · selected start times above</option></select></label>
        </div><button type="button" className="button button-small button-ghost" onClick={setExceptions}>Add dates to schedule</button>
        {!!draft.overrides.length && <ul className="trainer-exception-list">{draft.overrides.map(day => <li key={day.date}><span><time dateTime={day.date}>{day.date}</time> · {startTimeRanges(day.hours)}</span><button type="button" className="quiet-button" aria-label={`Use regular hours on ${day.date}`} onClick={() => setDraft(current => ({ ...current, overrides: current.overrides.filter(item => item.date !== day.date) }))}>Use regular hours</button></li>)}</ul>}</div>
        <p className="helper">Publishing does not cancel appointments. A change overlapping an assigned upcoming visit must be resolved by rescheduling or reassigning that visit first.</p>
        <div className="reset-actions"><button className="button" disabled={busy || (!dirty && !meta.inherited)}>{busy ? 'Publishing…' : 'Save & publish schedule'}</button><button type="button" className="quiet-button" onClick={() => { if (dirty && !window.confirm('Discard unpublished schedule edits and load the saved schedule?')) return; setFrom(''); setTo(''); setNotice('Unpublished edits discarded.'); setVersion(value => value + 1); }}>Reset to saved schedule</button><a className="inline-link" href="/#team">View homepage schedule →</a></div>
      </fieldset>
    </form>}
  </>;
}
