import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Notice } from './ui';
import RemoveClientButton from './RemoveClientButton';

export default function ClientDirectory() {
  const [query, setQuery] = useState(''), [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const requestId = useRef(0);
  async function load() {
    const current = ++requestId.current; setLoading(true); setError('');
    try { const r = await api(`/admin/clients?clientsOnly=1&q=${encodeURIComponent(query)}`); if (current === requestId.current) setClients(r.clients); }
    catch (e) { if (current === requestId.current) setError(e.message); }
    finally { if (current === requestId.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { requestId.current++; }; }, []);
  return <section aria-label="Client directory"><h2>Clients.</h2><Notice error>{error}</Notice><Notice>{notice}</Notice>
    <form className="owner-search panel" onSubmit={e => { e.preventDefault(); load(); }}><label>Find a client<input type="search" maxLength="100" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email"/></label><button className="button button-small" disabled={loading}>Search clients</button></form>
    {loading ? <p role="status">Loading clients…</p> : !clients.length ? <p>No clients match that search.</p> : <div className="owner-people">{clients.map(client => <article className="panel client-directory-row" key={client._id}><div><h3>{client.name}</h3><p>{client.email}</p><Link className="inline-link" to={`/schedule?client=${client._id}`}>Client schedule</Link></div><RemoveClientButton client={{ ...client, role: 'member' }} onRemoved={message => { setNotice(message); setClients(current => current.filter(c => c._id !== client._id)); }}/></article>)}</div>}
  </section>;
}
