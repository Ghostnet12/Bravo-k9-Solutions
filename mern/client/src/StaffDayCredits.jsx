import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';
import { DateTime } from 'luxon';
import MembershipDayCredits from './MembershipDayCredits';

export default function StaffDayCredits() {
  const [query, setQuery] = useState(''), [clients, setClients] = useState([]), [data, setData] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [searched, setSearched] = useState(false);
  const [revision, setRevision] = useState(0);
  async function search(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); setData(null);
    try { setClients((await api(`/admin/clients?clientsOnly=1&q=${encodeURIComponent(query)}`)).clients); setSearched(true); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function load(clientId) {
    if (!clientId) { setData(null); return; }
    setBusy(true); setError('');
    try { setData(await api(`/client-schedule?client=${clientId}&month=${DateTime.now().setZone('America/Chicago').toFormat('yyyy-MM')}`)); setRevision(value => value + 1); }
    catch (err) { setData(null); setError(err.message); } finally { setBusy(false); }
  }
  return <details className="panel staff-day-credits" id="credit-client-days"><summary>Credit days to a client</summary>
    <p>Missed training because of weather or a day off? Find the client and extend their membership here.</p>
    <form onSubmit={search} className="owner-search"><label>Client name or email<input type="search" minLength="2" required value={query} disabled={busy} onChange={event => setQuery(event.target.value)}/></label><button className="button button-small button-ghost" disabled={busy}>Find client for credit</button></form>
    <Notice error>{error}</Notice><Notice>{notice}</Notice>
    {searched && !clients.length && <p>No clients found. Try another name.</p>}
    {!!clients.length && <label>Client to credit<select disabled={busy} value={data?.client.id || ''} onChange={event => { setNotice(''); load(event.target.value); }}><option value="">Choose a client</option>{clients.map(client => <option key={client._id} value={client._id}>{client.name}{client.dogName ? ` · ${client.dogName}` : ''}</option>)}</select></label>}
    {busy && <p role="status">Loading client…</p>}
    {!busy && data && <><MembershipDayCredits key={`${data.client.id}-${revision}`} data={data} expanded onSaved={async message => { setNotice(message); await load(data.client.id); }}/><Link className="inline-link" to={`/schedule?client=${data.client.id}`}>Open {data.client.name}’s schedule →</Link></>}
  </details>;
}
