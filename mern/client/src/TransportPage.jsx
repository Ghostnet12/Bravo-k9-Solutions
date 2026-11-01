import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, Footer } from './ui';
import { api } from './api';
import { useBravo } from './context';
import { Editable } from './SiteContent';
import TransportHero from './TransportHero';
import GlympseTracking from './GlympseTracking';

export default function TransportPage() {
  const { user } = useBravo();
  const [email, setEmail] = useState(''), [consent, setConsent] = useState(false), [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  async function join(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/transport-interest', { method: 'POST', body: { email, consent, website } }); setSaved(true); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <div className="transport-page"><Header/><main id="main-content" tabIndex={-1}>
    <TransportHero/>
    <nav className="transport-page-nav" aria-label="Journey shortcuts">
      <a href="#track-bravo">Track the vehicle <span aria-hidden="true">↗</span></a>
      <Link to="/transport">Breeder &amp; client portal <span aria-hidden="true">→</span></Link>
      <Link to="/tracker-guide">Watch tracker guide <span aria-hidden="true">▶</span></Link>
    </nav>
    <div id="track-bravo"><GlympseTracking/></div>
    <section className="transport-signup panel" aria-labelledby="transport-portal-title"><div><h2 id="transport-portal-title">Your dog’s journey. One private place.</h2><p>Breeders and clients can sign in to view assigned transports, trip updates and available vehicle tracking.</p></div><div><Link className="button" to="/transport">Breeder & Client Portal →</Link><p className="helper">Use your own Bravo account. Trip details appear after Bravo assigns your access.</p></div></section>
    <section id="transport-updates" className="transport-signup panel" tabIndex={-1} aria-labelledby="transport-signup-title">
      <div><Editable as="h2" contentKey="transport-signup-title" canEditText id="transport-signup-title">Be first to hear.</Editable><Editable as="p" contentKey="transport-signup-copy" canEditText>Leave your email and we’ll let you know when K9 transport launches.</Editable></div>
      {saved ? <p role="status">Your request is saved. Bravo can email you when K9 transport launches.</p> : <form onSubmit={join}>
        <label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/></label>
        <label className="signup-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)}/></label>
        <label className="check"><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/><span>Email me once when Bravo K9 transport launches.</span></label>
        <p className="helper">No payment or account required. Bravo keeps this request for up to one year. To remove it sooner, call <a href="tel:+16058242767">(605) 824-2767</a>.</p>
        {error && <p role="alert">{error} Your email is still here; please try again.</p>}
        <button type="submit" className="button" disabled={busy || !consent}>{busy ? 'Saving…' : 'Request a launch update'}</button>
        <noscript><p>Please enable JavaScript to request an email update, or call Bravo at (605) 824-2767.</p></noscript>
      </form>}
    </section>
    {user?.role === 'owner' && <TransportInterests/>}
  </main><Footer/></div>;
}

function TransportInterests() {
  const [rows, setRows] = useState([]), [next, setNext] = useState(null), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(before = null) {
    setBusy(true); setError('');
    try { const data = await api(`/admin/transport-interest${before ? `?before=${before}` : ''}`); setRows(old => before ? [...old, ...data.interests] : data.interests); setNext(data.next); setLoaded(true); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function remove(row) {
    if (!window.confirm(`Remove the transport launch-update request for ${row.email}?`)) return;
    setBusy(true); setError('');
    try { await api(`/admin/transport-interest/${row._id}`, { method: 'DELETE', body: {} }); setRows(old => old.filter(item => item._id !== row._id)); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <details className="transport-admin panel course-interest-admin" onToggle={event => { if (event.currentTarget.open && !loaded && !busy) load(); }}>
    <summary>Transport launch-update requests</summary>
    <p>These people requested one email when K9 transport launches. This list does not send emails automatically. Honor removals and use these addresses only for the requested launch update.</p>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Updating…</p>}{loaded && !rows.length && <p>No launch-update requests yet.</p>}
    <ul>{rows.map(row => <li key={row._id}><span>{row.email}<small>Requested {new Date(row.createdAt).toLocaleDateString()}</small></span><button type="button" disabled={busy} onClick={() => remove(row)}>Remove request</button></li>)}</ul>
    {next && <button type="button" disabled={busy} onClick={() => load(next)}>Load more requests</button>}
    <button type="button" disabled={busy} onClick={() => load()}>Refresh requests</button>
  </details>;
}
