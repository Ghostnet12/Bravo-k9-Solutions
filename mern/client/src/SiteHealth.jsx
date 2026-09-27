import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
const labels = { page_crash: 'Page could not display', script_error: 'Website script failed', unhandled_promise: 'Background action failed', network_error: 'Connection interrupted', request_timeout: 'Request took too long', server_error: 'Server request failed' };
export default function SiteHealth() {
  const [data, setData] = useState(null), [days, setDays] = useState('30'), [error, setError] = useState(''), [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true; setError(''); setData(null);
    api(`/admin/site-health?days=${days}`).then(next => { if (current) setData(next); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [days, version]);
  const total = data?.totals;
  return <section aria-labelledby="site-health-title" className="site-health">
    <h2 id="site-health-title">Website health & bookings</h2>
    <p>See where visitors come from, how many save a request, and whether anything needs attention.</p>
    <div className="site-health-controls"><label>Reporting period<select value={days} onChange={e => setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label><button type="button" className="button button-ghost" onClick={() => setVersion(v => v + 1)}>Refresh report</button></div>
    {error && <Notice error>{error} Use Refresh report to try again.</Notice>}
    {!data && !error && <p role="status">Loading website report…</p>}
    {data && <>
      <p className="helper">Database connected · Checked {new Date(data.checkedAt).toLocaleString()}</p>
      <div className="site-health-metrics">{[['Visits', total.visits], ['Booking form opened', total.started], ['Request saved', total.saved], ['Payment verified', total.paid]].map(([label, value]) => <div className="panel" key={label}><strong>{value.toLocaleString()}</strong><span>{label}</span></div>)}</div>
      <p><strong>{total.visits ? `${(100 * total.saved / total.visits).toFixed(1)}%` : '—'}</strong> of tracked visits saved a booking request.</p>
      {!total.visits && <p>No tracked visits yet. New activity will appear here after this update.</p>}
      <details className="panel"><summary>How these numbers work</summary><p>A visit is one browser tab session of up to 30 minutes, not a unique person. Each stage counts once per visit. Returning visits can count again.</p><p>Staff and owner browsing, schedule edits, and manually created clients are excluded. Privacy preferences and blocked tracking can reduce totals. Requests include waiting-list requests; saved requests are not confirmed appointments.</p><p>Payments come from verified booking records for these visits, including payments later refunded. Membership-covered requests do not count as new payments. Reports use UTC calendar days and keep 30 days of visit and error information.</p></details>
      {!!data.channels.length && <section className="panel"><h3>Where visits come from</h3><div className="site-health-table"><table><thead><tr><th>Source</th><th>Visits</th><th>Saved</th></tr></thead><tbody>{data.channels.map(row => <tr key={row.channel}><th scope="row">{row.channel}</th><td>{row.visits}</td><td>{row.saved}</td></tr>)}</tbody></table></div></section>}
      <section className="panel"><h3>Visitor experience</h3><p>Real browser measurements at the 75th percentile, grouped by screen size. Targets: LCP ≤ 2,500 ms; INP ≤ 200 ms; CLS ≤ 0.1. Small samples are directional, not a performance grade. Measurements cover the page session from its initial route; some browsers do not report every metric.</p>{data.vitals?.length ? <div className="site-health-table"><table><thead><tr><th>Metric</th><th>Screen</th><th>75th percentile</th><th>Samples</th></tr></thead><tbody>{data.vitals.map(row => <tr key={`${row.name}-${row.device}`}><th>{row.name}</th><td>{row.device}</td><td>{row.name === 'CLS' ? row.p75.toFixed(3) : `${Math.round(row.p75)} ms`}</td><td>{row.count}</td></tr>)}</tbody></table></div> : <p>No browser measurements recorded yet.</p>}<h3>Decision and booking steps</h3><ul>{(data.stages || []).filter(row => !['visit','booking_started'].includes(row.stage)).map(row => <li key={row.stage}>{({ goal_selected: 'Goal selected', trainer_step: 'Trainer step reached', visit_step: 'Date and time step reached', review_step: 'Review step reached' })[row.stage]}: {row.count}</li>)}</ul><p className="helper">Each step counts once per tracked visit. Visitors may skip or revisit steps; these counts are not confirmed bookings.</p></section>
      <section className="panel"><h3>Recent website errors</h3><p>Grouped by area and day. Browser reports describe what failed without recording what someone typed.</p>{!data.errors.length ? <p>No errors recorded in this period.</p> : <ul className="site-error-list">{data.errors.map((row, i) => <li key={i}><strong>{labels[row.kind] || 'Website error'} · {row.count} {row.count === 1 ? 'report' : 'reports'}</strong><span>{row.area} · {row.source}{row.status ? ` · HTTP ${row.status}` : ''}</span><span>Last seen {new Date(row.lastSeen).toLocaleString()}</span>{row.requestId && <small>Support reference: {row.requestId}</small>}</li>)}</ul>}<p className="helper">Database outages also appear in hosting logs, even when this report cannot load.</p><a className="inline-link" href="https://vercel.com/ghostnet1/bravo-k9-mern/logs" target="_blank" rel="noreferrer">Open hosting logs ↗</a></section>
    </>}
  </section>;
}
