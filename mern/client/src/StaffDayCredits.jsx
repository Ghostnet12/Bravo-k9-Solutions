import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';

export default function StaffDayCredits() {
  const [query,setQuery]=useState(''),[clients,setClients]=useState([]),[clientId,setClientId]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false);
  async function search(event) {
    event.preventDefault();setBusy(true);setError('');setClientId('');
    try {setClients((await api(`/admin/clients?clientsOnly=1&q=${encodeURIComponent(query)}`)).clients);setSearched(true);}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  const client=clients.find(item=>item._id===clientId);
  return <details className="panel staff-day-credits" id="credit-client-days"><summary>Credit days to a client</summary>
    <p>Open the client’s calendar, select a missed date, choose “Give credit for this day”, then save. A note is optional.</p>
    <form onSubmit={search} className="owner-search"><label>Client name or email<input type="search" minLength="2" required value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/></label><button className="button button-small button-ghost" disabled={busy}>Find client for credit</button></form>
    <Notice error>{error}</Notice>
    {searched&&!clients.length&&<p>No clients found. Try another name.</p>}
    {!!clients.length&&<label>Client to credit<select disabled={busy} value={clientId} onChange={event=>setClientId(event.target.value)}><option value="">Choose a client</option>{clients.map(item=><option key={item._id} value={item._id}>{item.name}{item.dogName?` · ${item.dogName}`:''}</option>)}</select></label>}
    {client&&<Link className="button" to={`/schedule?client=${client._id}&edit=1`}>Open {client.name}’s calendar</Link>}
  </details>;
}
