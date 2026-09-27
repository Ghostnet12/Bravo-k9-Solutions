import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Page } from './ui';
import { useBravo } from './context';
import { Editable } from './SiteContent';
export default function CourseLaunch() {
  const { user } = useBravo();
  const [email, setEmail] = useState(''), [consent, setConsent] = useState(false), [website, setWebsite] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  async function join(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/course-interest', { method: 'POST', body: { email, consent, website } }); setSaved(true); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  return <Page title="Bravo. Anywhere." eyebrow="ONLINE COURSES · COMING SOON" intro="Learn the method. Understand the why. Bring it into your everyday life.">
    {user?.role === 'owner' && <p><Link to="/learn">Back to library preview &amp; launch-update requests →</Link></p>}
    <section className="course-launch-hero"><img src="/images/training-education.webp" width="1600" height="900" alt="A handler demonstrating clear communication with a dog"/><div><Editable as="h2" contentKey="discovery-course-title" canEditText>Closer to understanding.<br/>Wherever you are.</Editable><Editable as="p" contentKey="discovery-course-copy" canEditText>David and Ashley are preparing professional dog-training education you can follow from home, at your own pace.</Editable><p>The library is not open for public enrollment yet. A launch date has not been announced.</p></div></section>
    <section className="service-journey"><h2>What we’re preparing.</h2><div className="course-topics"><article><h3>Understand the dog</h3><p>How Bravo approaches behavior, communication and the individual dog.</p></article><article><h3>Practice the method</h3><p>Demonstrations and explanations that connect the why to the work.</p></article><article><h3>Keep learning</h3><p>Lessons you can revisit, with written guidance alongside the videos.</p></article></div><Link className="inline-link" to="/#reviews">See Bravo’s public training videos →</Link></section>
    <section className="panel course-signup" aria-labelledby="course-signup-title"><h2 id="course-signup-title">Be there when it opens.</h2>{saved ? <p role="status">Your launch-update request is saved. Bravo can contact you at this address when courses open.</p> : <form onSubmit={join}><label>Email address<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label><label className="signup-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)}/></label><label className="check"><input type="checkbox" required checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)}/>Email me once when Bravo online courses launch.</label><p className="helper">No payment or account required. Bravo keeps this request for up to one year. To remove it sooner, call (605) 824-2767.</p>{error && <p role="alert">{error} Your email has not been cleared; try again.</p>}<button type="submit" className="button" disabled={busy || !consent}>{busy ? 'Saving…' : 'Request a launch update'}</button></form>}</section>
    <p>Want hands-on help now? <Link to="/dog-training">Explore private training</Link> or <Link to="/workshops">see workshops</Link>.</p>
  </Page>;
}
export function CourseInterests() {
  const [rows, setRows] = useState([]), [next, setNext] = useState(null), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(after = null) { setBusy(true); setError(''); try { const data = await api(`/admin/course-interest${after ? `?before=${after}` : ''}`); setRows(old => after ? [...old, ...data.interests] : data.interests); setNext(data.next); setLoaded(true); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  async function remove(row) { if (!window.confirm(`Remove the launch-update request for ${row.email}?`)) return; setBusy(true); setError(''); try { await api(`/admin/course-interest/${row._id}`, { method: 'DELETE', body: {} }); setRows(old => old.filter(item => item._id !== row._id)); } catch (cause) { setError(cause.message); } finally { setBusy(false); } }
  return <details className="panel course-interest-admin" onToggle={e => { if (e.currentTarget.open && !loaded && !busy) load(); }}><summary>Course launch-update requests</summary><p>These people requested one email when courses launch. This list does not send emails automatically. Honor removals and contact people only for the requested launch update.</p>{error && <p role="alert">{error}</p>}{busy && <p role="status">Updating…</p>}{loaded && !rows.length && <p>No launch-update requests yet.</p>}<ul>{rows.map(row => <li key={row._id}><span>{row.email}<small>Requested {new Date(row.createdAt).toLocaleDateString()}</small></span><button type="button" disabled={busy} onClick={() => remove(row)}>Remove request</button></li>)}</ul>{next && <button type="button" disabled={busy} onClick={() => load(next)}>Load more requests</button>}<button type="button" disabled={busy} onClick={() => load()}>Refresh requests</button></details>;
}
