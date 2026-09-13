import { useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import './client-removal.css';

export default function RemoveClientButton({ client, onRemoved, disabled = false }) {
  const { user } = useBravo();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const id = client?._id || client?.id;
  const administrator = client?.role === 'owner' && user?.role === 'owner' && user.isPrimaryOwner;
  if (!['staff', 'owner'].includes(user?.role) || !id || id === user.id || (client.role !== 'member' && !administrator) || client.isPrimaryOwner) return null;
  const label = `${administrator ? 'Delete administrator' : 'Remove client'} ${client.name}`;
  async function remove(event) {
    event.preventDefault(); event.stopPropagation();
    const prompt = administrator
      ? `Delete administrator ${client.name}? Their account access will be revoked immediately. Client appointments and history are kept. Joint appointments keep the other trainer; clients with no remaining trainer will await reassignment.`
      : `Remove ${client.name}? This disables their account access and cancels remaining visits. Payment history is kept and no refund is issued.`;
    if (busy || !window.confirm(prompt)) return;
    setBusy(true); setError('');
    try {
      const result = await api(`/admin/${administrator ? 'administrators' : 'clients'}/${id}`, { method: 'DELETE', body: { confirmRemoval: true } });
      await onRemoved?.(result.message);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <span className="client-removal-control">
    <button type="button" className="client-trash-button" aria-label={label} title={label} disabled={disabled || busy} onClick={remove}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
      {busy && <span className="sr-only">Removing…</span>}
    </button>
    {error && <span role="alert" className="client-removal-error">{error}</span>}
  </span>;
}
