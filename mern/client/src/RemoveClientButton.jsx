import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBravo } from './context';
import { api } from './api';
import './client-removal.css';

export default function RemoveClientButton({ client, onRemoved, disabled = false }) {
  const { user } = useBravo();
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const id = client?._id || client?.id;
  const administrator = client?.role === 'owner' && user?.role === 'owner' && user.isPrimaryOwner;
  if (!['staff', 'owner'].includes(user?.role) || !id || id === user.id || (client.role !== 'member' && !administrator) || client.isPrimaryOwner) return null;
  const label = `${administrator ? 'Delete administrator' : 'Remove client'} ${client.name}`;
  async function submitRemoval(currentPassword) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const body = { confirmRemoval: true, ...(administrator ? { currentPassword } : {}) };
      const result = await api(`/admin/${administrator ? 'administrators' : 'clients'}/${id}`, { method: 'DELETE', body });
      dialog.current?.close();
      await onRemoved?.(result.message);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function remove(event) {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    setError('');
    if (administrator) { dialog.current.showModal(); return; }
    if (window.confirm(`Remove ${client.name}? This disables their account access and cancels remaining visits. Payment history is kept and no refund is issued.`)) submitRemoval();
  }
  function confirmAdministrator(event) {
    event.preventDefault(); event.stopPropagation();
    const password = new FormData(event.currentTarget).get('currentPassword');
    event.currentTarget.reset();
    submitRemoval(password);
  }
  return <span className="client-removal-control">
    <button type="button" className="client-trash-button" aria-label={label} title={label} disabled={disabled || busy} onClick={remove}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
      {busy && <span className="sr-only">Removing…</span>}
    </button>
    {!administrator && error && <span role="alert" className="client-removal-error">{error}</span>}
    {administrator && createPortal(<dialog ref={dialog} className="owner-confirm-dialog" aria-label={`Confirm administrator deletion: ${client.name}`} onClick={event => event.stopPropagation()} onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { dialog.current?.querySelector('form')?.reset(); setError(''); }}>
      <form onSubmit={confirmAdministrator}>
        <h2>Delete administrator {client.name}?</h2>
        <p>Their account access will be revoked immediately. Client appointments and history are kept. Joint appointments keep the other trainer; clients with no remaining trainer will await reassignment.</p>
        <label>Your current owner password<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} autoFocus disabled={busy}/></label>
        <p className="owner-confirm-help">Confirm with the password you use to sign in to Bravo.</p>
        {error && <p role="alert" className="client-removal-error">{error}</p>}
        <div className="owner-confirm-actions"><button type="button" className="button button-ghost" disabled={busy} onClick={() => dialog.current.close()}>Cancel</button><button type="submit" className="button" disabled={busy}>{busy ? 'Deleting…' : 'Confirm administrator deletion'}</button></div>
      </form>
    </dialog>, document.body)}
  </span>;
}
