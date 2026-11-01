import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { Page } from './ui';
import { TRANSPORT_STATUSES, TRACKABLE_STATUSES, transportLocationState, transportMapUrl } from '../../shared/transport';
import GlympseTracking, { CopyTransportLink, GlympseDriverGuide } from './GlympseTracking';
import './transport-portal.css';

const dateLabel = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Bravo will confirm';
const iso = value => value ? new Date(value).toISOString() : '';
const localDate = value => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function TransportPortal() {
  const { user, authReady } = useBravo();
  const [params] = useSearchParams();
  const selected = params.get('trip');
  const next = `/transport${selected && /^[a-f\d]{24}$/i.test(selected) ? `?trip=${selected}` : ''}`;
  if (!authReady) return <Page title="Your dog’s journey." eyebrow="BRAVO K9 TRANSPORT"><p role="status">Checking your account…</p></Page>;
  if (!user) return <Page title="Every mile. Together." eyebrow="BREEDER & CLIENT PORTAL" className="transport-portal" intro="A private place to follow your dog’s journey with Bravo.">
    <section className="tp-welcome panel"><div><span className="tp-tag">YOUR DOG. YOUR UPDATES.</span><h2>Know where they are.<br/>Know how they’re doing.</h2><p>Sign in with your own Bravo account. Breeders see their assigned transports under their business name. Clients see their dog’s trip and updates.</p><div className="tp-actions"><Link className="button" to={`/account?next=${encodeURIComponent(next)}`}>Sign in to your trip</Link><Link className="button button-ghost" to={`/account?mode=register&next=${encodeURIComponent(next)}`}>Create your account</Link></div><p className="helper">Already train with Bravo? Use the same account. Bravo links each person to the right trip before details become visible.</p></div><img src="/images/bravo-k9-transport.webp" alt="Bravo’s Dodge Durango transport vehicle" width="800" height="600"/></section>
    <div className="tp-benefits"><section><span>01</span><h2>Your journey</h2><p>Pickup, destination and estimated arrival, all together.</p></section><section><span>02</span><h2>Location updates</h2><p>Open Bravo’s shared Glympse map while the team shares from the road.</p></section><section><span>03</span><h2>Stay informed</h2><p>See pickup, rest stops and delivery updates from the Bravo team.</p></section></div>
    <GlympseTracking/>
    <p>Need help linking your account? <a href="tel:+16058242767">Call Bravo at (605) 824-2767</a>.</p>
  </Page>;
  return <TransportWorkspace key={user.id} user={user}/>;
}

function TransportWorkspace({ user }) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const mounted = useRef(true), sequence = useRef(0);
  const selected = params.get('trip') || '';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  const load = useCallback(async (before = '') => {
    const current = ++sequence.current; setBusy(true); setError('');
    try {
      const result = await api(`/transport${before ? `?before=${before}` : ''}`);
      if (mounted.current && sequence.current === current) setData(old => ({ ...result, trips: before ? [...(old?.trips || []), ...result.trips] : result.trips }));
    } catch (cause) { if (mounted.current && sequence.current === current) { setError(cause.message); if ([401, 403].includes(cause.status)) setData(null); } }
    finally { if (mounted.current && sequence.current === current) setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(() => load(), [load]);
  const choose = id => setParams(id ? { trip: id } : {});
  const title = data?.canManage ? 'Transport desk.' : data?.breeders?.length === 1 ? `${data.breeders[0].name}.` : 'Your dog’s journey.';
  return <Page title={title} eyebrow="BRAVO K9 TRANSPORT" intro={`Welcome, ${user.name}. ${data?.canManage ? 'Manage breeder access, trips and journey updates.' : 'Your assigned transports and updates, together.'}`} className="transport-portal">
    {error && <p role="alert" className="tp-alert">{error}</p>}
    <div className="tp-toolbar"><p>Private access · Assigned trips only</p><button type="button" className="button button-ghost" disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh trips'}</button></div>
    {data && !selected && <GlympseTracking/>}
    {data?.canManage && <TransportManagement data={data} refresh={refresh} choose={choose}/>}
    {!data && busy && <p role="status">Loading your transports…</p>}
    {data && <div className="tp-workspace">
      <section className="tp-list" aria-labelledby="tp-trips-title"><h2 id="tp-trips-title">{data.canManage ? 'All transports' : 'Your transports'}</h2>
        {!data.trips.length && <div className="panel tp-empty"><h3>No trips assigned yet.</h3><p>{data.canManage ? 'Add a breeder and create a trip to get started.' : 'Once Bravo links a transport to your account, it will appear here.'}</p><a href="tel:+16058242767">Contact Bravo →</a></div>}
        {data.trips.map(trip => <button className={`tp-trip-card ${selected === trip.id ? 'is-selected' : ''}`} type="button" key={trip.id} aria-pressed={selected === trip.id} onClick={() => choose(trip.id)}><span className="tp-tag">{TRANSPORT_STATUSES[trip.status]}</span><strong>{trip.dogName}</strong>{trip.breederName && <span>{trip.breederName}</span>}<span>{trip.pickup} → {trip.destination}</span><span className="tp-card-link">View journey →</span></button>)}
        {data.next && <button type="button" className="button button-ghost" disabled={busy} onClick={() => load(data.next)}>Load more trips</button>}
      </section>
      {selected ? <TripDetail key={selected} id={selected} canManage={data.canManage} breeders={data.breeders} gpsConfigured={data.gpsConfigured} refreshList={refresh}/> : <section className="panel tp-empty tp-select"><span className="tp-tag">TRUST. TRAIN. DEPLOY.</span><h2>Choose a journey.</h2><p>Select a transport to see its updates, estimated arrival and available vehicle location.</p><img src="/images/bravo-k9-transport.webp" alt="Bravo K9 transport vehicle" width="800" height="600"/></section>}
    </div>}
  </Page>;
}

function TripDetail({ id, canManage, breeders, gpsConfigured, refreshList }) {
  const [trip, setTrip] = useState(null), [error, setError] = useState(''), [editing, setEditing] = useState(false);
  const [clock, setClock] = useState(Date.now()), offset = useRef(0), reload = useRef(null);
  useEffect(() => {
    let active = true, running = false;
    const controller = new AbortController();
    const load = async () => {
      if (running || !active) return;
      running = true;
      try {
        const result = await api(`/transport/trips/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (active) { offset.current = Date.parse(result.serverTime) - Date.now(); setClock(Date.now() + offset.current); setTrip(result.trip); setError(''); }
      } catch (cause) { if (active) { setError(cause.message); if ([401, 403, 404].includes(cause.status)) { setTrip(null); setEditing(false); } } }
      finally { running = false; }
    };
    const visibleLoad = () => { if (!document.hidden) load(); };
    reload.current = load; load();
    const polling = setInterval(visibleLoad, 30000), ticking = setInterval(() => setClock(Date.now() + offset.current), 5000);
    document.addEventListener('visibilitychange', visibleLoad);
    return () => { active = false; controller.abort(); clearInterval(polling); clearInterval(ticking); document.removeEventListener('visibilitychange', visibleLoad); };
  }, [id]);
  const state = trip ? transportLocationState(trip, clock) : 'waiting';
  const live = state === 'live' && !error;
  const location = trip?.location;
  const map = location ? transportMapUrl(location) : null;
  const labels = { ended: 'Location sharing ended', paused: 'Location sharing is off', waiting: 'Waiting for the tracker', stale: 'Last reported location' };
  return <section className="panel tp-detail" aria-labelledby="tp-detail-title">
    {error && <p role="alert" className="tp-alert">{error} {trip && 'Updates are interrupted. The location below may be out of date.'}<button type="button" onClick={() => reload.current?.()}>Retry updates</button></p>}
    {!trip && !error && <p role="status">Opening this journey…</p>}
    {trip && <>
      <div className="tp-detail-heading"><div><span className="tp-tag">{trip.breederName || 'BRAVO K9 TRANSPORT'}</span><h2 id="tp-detail-title">{trip.dogName}’s journey</h2></div><span className="tp-status">{TRANSPORT_STATUSES[trip.status]}</span></div>
      <div className="tp-route"><div><span>Pickup</span><strong>{trip.pickup}</strong><small>{dateLabel(trip.pickupAt)}</small></div><span aria-hidden="true">→</span><div><span>Destination</span><strong>{trip.destination}</strong><small>Estimated arrival: {dateLabel(trip.etaAt)}</small></div></div>
      <p className="helper">Times are shown in your device’s time zone. Arrival estimates are updated by Bravo and may change with traffic, weather and care stops.</p>
      {(map || gpsConfigured) && <><div className={`tp-location ${live ? 'is-live' : ''}`}><span className="tp-dot" aria-hidden="true"/><strong>{live ? 'Live vehicle location' : error && map ? 'Last reported location · updates interrupted' : labels[state]}</strong></div>
      {map ? <><iframe title={`Last reported vehicle location for ${trip.dogName}`} src={map} className="tp-map" loading="lazy" referrerPolicy="no-referrer"/><p className="helper">GPS last reported <time dateTime={location.observedAt}>{dateLabel(location.observedAt)}</time>.{location.accuracy != null ? ` Reported accuracy: about ${Math.round(location.accuracy)} m.` : ''} {!live && 'This is not a current live fix.'}</p><p className="helper">Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Location updates check every 30 seconds while this page is open.</p></> : <div className="tp-map-empty"><h3>{state === 'ended' ? 'This journey is closed.' : 'Your dog’s trip, kept private.'}</h3><p>{state === 'waiting' ? 'Bravo has enabled sharing. The map will appear when the vehicle tracker sends its first location.' : state === 'ended' ? 'Vehicle location is no longer shared for this trip. Your trip updates are still available below.' : 'The map appears during your trip when Bravo enables location sharing and the vehicle tracker reports.'}</p></div>}</>}
      {TRACKABLE_STATUSES.includes(trip.status) && <GlympseTracking/>}
      {!map && !gpsConfigured && !TRACKABLE_STATUSES.includes(trip.status) && <div className="tp-map-empty"><h3>{state === 'ended' ? 'This journey is closed.' : 'The journey starts with pickup.'}</h3><p>{state === 'ended' ? 'Your trip updates remain below. This trip no longer displays the shared vehicle map.' : 'Bravo’s shared Glympse map will be available here after your trip is marked picked up.'}</p></div>}
      <section className="tp-timeline" aria-labelledby="tp-updates-title"><h3 id="tp-updates-title">Journey updates</h3><ol>{[...trip.events].reverse().map((event, index) => <li key={`${event.at}-${index}`}><strong>{TRANSPORT_STATUSES[event.status]}</strong><time dateTime={event.at}>{dateLabel(event.at)}</time>{event.note && <p>{event.note}</p>}</li>)}</ol></section>
      {canManage && <><div className="tp-invitation"><CopyTransportLink tripId={trip.id}/><p>The invitation opens this trip after sign-in. Only the assigned accounts can see its details.</p></div><button type="button" className="button" onClick={() => setEditing(value => !value)}>{editing ? 'Close trip editor' : 'Update this trip'}</button>{editing && <TripEditor trip={trip} breeders={breeders} gpsConfigured={gpsConfigured} onSaved={async () => { setEditing(false); await reload.current?.(); await refreshList(); }}/>}</>}
      <p className="tp-contact">Need an update? <a href="tel:+16058242767">Call Bravo: (605) 824-2767</a></p>
    </>}
  </section>;
}

function TransportManagement({ data, refresh, choose }) {
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function action(work) { setBusy(true); setError(''); setNotice(''); try { await work(); await refresh(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <details className="panel tp-management"><summary>Bravo controls · Breeders & trips</summary>
    <GlympseDriverGuide/>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <p className="helper">People create their own Bravo accounts first. Confirm the account with the person before granting access. A breeder can see every trip assigned to their business; a client can see only trips assigned to their account.</p>
    <div className="tp-admin-grid"><section><h2>Add a breeder</h2><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, body = Object.fromEntries(new FormData(form)); action(async () => { await api('/transport/breeders', { method: 'POST', body }); form.reset(); setNotice('Breeder added. You can assign their transports now.'); }); }}><label>Breeder / business name<input name="name" required minLength={2} maxLength={100}/></label><label>Breeder’s Bravo account email<input name="accountEmail" type="email" required maxLength={254} autoComplete="off"/></label><button className="button" disabled={busy}>Add breeder</button></form>
      <h3>Breeder access</h3>{!data.breeders.length && <p>No breeders added yet.</p>}<ul className="tp-breeders">{data.breeders.map(breeder => <li key={breeder._id}><span>{breeder.name}<small>{breeder.enabled ? 'Access enabled' : 'Access disabled'}</small></span><button type="button" disabled={busy} onClick={() => action(async () => { await api(`/transport/breeders/${breeder._id}`, { method: 'PATCH', body: { revision: breeder.revision, enabled: !breeder.enabled } }); setNotice(`Breeder access ${breeder.enabled ? 'disabled' : 'enabled'}.`); })}>{breeder.enabled ? 'Disable access' : 'Enable access'}</button></li>)}</ul>
    </section><section><h2>Create a transport</h2><TripEditor breeders={data.breeders} gpsConfigured={data.gpsConfigured} onSaved={async id => { await refresh(); choose(id); }}/></section></div>
  </details>;
}

function TripEditor({ trip, breeders, gpsConfigured, onSaved }) {
  const noteId = useId();
  // Snapshot revision and inputs once. Polling must never overwrite an edit.
  const [initial] = useState(trip);
  const [status, setStatus] = useState(trip?.status || 'scheduled'), [sharing, setSharing] = useState(!!trip?.sharingEnabled);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const hardware = gpsConfigured || !!initial?.deviceId;
  const terminal = ['delivered', 'cancelled'].includes(initial?.status);
  async function save(event) {
    event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    setError(''); setBusy(true);
    try {
      const body = { ...values, deviceId: values.deviceId ?? initial?.deviceId ?? '', breederId: values.breederId || null, pickupAt: iso(values.pickupAt), etaAt: iso(values.etaAt) };
      if (initial) Object.assign(body, { revision: initial.revision, status, sharingEnabled: TRACKABLE_STATUSES.includes(status) && sharing });
      const result = await api(initial ? `/transport/trips/${initial.id}` : '/transport/trips', { method: initial ? 'PATCH' : 'POST', body });
      if (!initial) form.reset();
      await onSaved(result.id || initial.id);
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="tp-trip-form">
    {error && <p role="alert">{error}</p>}
    <div className="tp-form-grid"><label>Dog’s name<input name="dogName" defaultValue={initial?.dogName || ''} maxLength={80} required/></label><label>Breeder<select name="breederId" defaultValue={initial?.breederId || ''}><option value="">Direct client · no breeder</option>{breeders.filter(breeder => breeder.enabled || breeder._id === initial?.breederId).map(breeder => <option key={breeder._id} value={breeder._id}>{breeder.name}{!breeder.enabled && ' (access disabled)'}</option>)}</select></label></div>
    <label>Client’s Bravo account email<input name="clientEmail" type="email" defaultValue={initial?.clientEmail || ''} maxLength={254} autoComplete="off"/><span className="helper">Optional for breeder-only trips. Clearing it removes this client’s access.</span></label>
    <div className="tp-form-grid"><label>Pickup city / state<input name="pickup" defaultValue={initial?.pickup || ''} minLength={2} maxLength={120} required/></label><label>Destination city / state<input name="destination" defaultValue={initial?.destination || ''} minLength={2} maxLength={120} required/></label><label>Planned pickup<input name="pickupAt" type="datetime-local" defaultValue={localDate(initial?.pickupAt)}/></label><label>Estimated arrival<input name="etaAt" type="datetime-local" defaultValue={localDate(initial?.etaAt)}/></label></div>
    <p className="helper">Enter times in your device’s time zone. Keep street addresses and other customers’ details out of shared updates.</p>
    {initial && <><label>Trip status<select value={status} disabled={terminal} onChange={event => setStatus(event.target.value)}>{Object.entries(TRANSPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <p className="helper">Glympse sharing is controlled in the Glympse app. Marking this trip delivered or cancelled hides its map here; it does not stop the public tag’s sharing.</p>
      <label htmlFor={noteId}>Journey update</label><textarea id={noteId} name="note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} placeholder="Write a care update for this dog’s breeder and client."/>
      <div className="tp-quick-notes" role="group" aria-label="Care update drafts">{[['Water & rest', 'Water and rest stop complete.'], ['Back on the road', 'Care stop complete. Back on the road.'], ['Arrival update', 'Arrival estimate updated. Please check the time above.']].map(([label, draft]) => <button type="button" key={label} disabled={busy || note.length + draft.length + (note ? 1 : 0) > 1000} onClick={() => setNote(value => value ? `${value}\n${draft}` : draft)}>{label}</button>)}</div>
      <p className="helper">Draft buttons add text only. Check the details and select Save trip update to publish.</p>
    </>}
    {hardware && <details className="tp-gps-controls"><summary>Dedicated GPS tracker · optional</summary><label>Vehicle tracker identifier<input name="deviceId" defaultValue={initial?.deviceId || ''} maxLength={120} autoComplete="off"/><span className="helper">For a separately configured hardware tracker, not Glympse. Never enter a password or API key.</span></label>{initial && <><label className="check"><input type="checkbox" checked={sharing && TRACKABLE_STATUSES.includes(status)} disabled={!gpsConfigured || !TRACKABLE_STATUSES.includes(status)} onChange={event => setSharing(event.target.checked)}/><span>Share dedicated tracker location with assigned accounts</span></label><p className="helper">This control applies only to the dedicated tracker. It does not control Glympse.</p></>}</details>}
    <button className="button" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save trip update' : 'Create transport'}</button>
  </form>;
}
