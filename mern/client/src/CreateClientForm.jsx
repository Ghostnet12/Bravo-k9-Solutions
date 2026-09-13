import { useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
import MembershipDateFields from './MembershipDateFields';
import MemberTrainingSetup from './MemberTrainingSetup';
import TemporaryPasswordControl from './TemporaryPasswordControl';

export default function CreateClientForm({ onCreated }) {
  const [creating, setCreating] = useState(false), [created, setCreated] = useState(null), [error, setError] = useState('');
  const [clientStartDate, setClientStartDate] = useState('');
  async function addClient(event) {
    event.preventDefault(); setCreating(true); setError(''); setCreated(null);
    const form = event.currentTarget;
    try {
      const result = await api('/admin/users', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      setCreated(result); form.reset(); setClientStartDate(''); onCreated?.(result);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  }
  return <details className="panel add-client-panel">
    <summary>Add a client</summary>
    <p>Enter the client’s name and dog’s name. Saving creates their member profile, covered training, online lesson access, and a temporary password to share. No charge is made.</p>
    <Notice error>{error}</Notice>
    <form onSubmit={addClient}>
      <div className="form-grid">
        <label>Client name<input name="name" autoComplete="name" minLength="2" maxLength="80" required/></label>
        <label>Dog’s name<input name="dogName" autoComplete="off" minLength="1" maxLength="80" required/></label>
        <label>Email (optional)<input name="email" type="email" autoComplete="email" maxLength="254"/></label>
        <label>Phone (optional)<input name="phone" type="tel" autoComplete="tel" maxLength="30"/></label>
        <label className="full-width">Visit address (optional)<input name="address" autoComplete="street-address" maxLength="300"/></label>
      </div>
      <MembershipDateFields value={clientStartDate} onChange={setClientStartDate} disabled={creating} optional name="membershipStartDate" label="Training membership start date"/>
      <label>Dogs covered by this training month<input name="trainingDogCount" type="number" min="1" max="10" defaultValue="1" disabled={creating}/></label>
      <button className="button button-small" disabled={creating}>{creating ? 'Creating member…' : 'Create client & member'}</button>
    </form>
    {created && <>
      <div className="created-client notice" role="status"><h3>Client account created.</h3><p><strong>{created.user.name}</strong> · {created.user.dogName}</p><p>{created.membership?.active ? 'Member access is active. Assign a trainer and add days and times below.' : 'Membership is saved for the chosen dates. A past month stays expired; a future month starts on its saved date.'} No charge or automatic renewal was created.</p></div>
      <TemporaryPasswordControl key={created.user.id} person={created.user} initialCredential={created}/>
      {created.membership?.trainingBookingId && <MemberTrainingSetup person={{ ...created.user, _id: created.user.id }} access={created.membership}/>}
    </>}
  </details>;
}
