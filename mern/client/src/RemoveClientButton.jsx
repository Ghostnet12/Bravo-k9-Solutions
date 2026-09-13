import { useState } from 'react';
import { useBravo } from './context';
import { api } from './api';
import './client-removal.css';

export default function RemoveClientButton({ client, onRemoved, disabled = false }) {
  const { user } = useBravo();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const id = client?._id || client?.id;
  if (!['staff', 'owner'].includes(user?.role) || !id || id === user.id || client.role !== 'member' || client.isPrimaryOwner) return null;
  async function remove(event) {
    event.preventDefault(); event.stopPropagation();
    if (busy || !window.confirm(`Remove ${client.name}? This disables their account access and cancels remaining visits. Payment history is kept and no refund is issued.`)) return;
    setBusy(true); setError('');
    try {
      const result = await api(`/admin/clients/${id}`, { method: 'DELETE', body: { confirmRemoval: true } });
      await onRemoved?.(result.message);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <span className="client-removal-control">
    <button type="button" className="client-trash-button" aria-label={`Remove client ${client.name}`} title={`Remove client ${client.name}`} disabled={disabled || busy} onClick={remove}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
      {busy && <span className="sr-only">Removing…</span>}
    </button>
    {error && <span role="alert" className="client-removal-error">{error}</span>}
  </span>;
}
