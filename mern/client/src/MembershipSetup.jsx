import { useEffect, useState } from 'react';
import { api } from './api';
import { Notice } from './ui';
export default function MembershipSetup() {
  const [status, setStatus] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function load() { setStatus(await api('/admin/membership-status')); }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  return <section className="panel"><h2>Manual membership renewal</h2><p>New checkouts purchase one month with no automatic renewal. Use this control once to stop automatic renewal on existing Bravo plans while preserving their paid end dates. Existing undated Member grants receive a full month of transition access.</p><Notice error>{error}</Notice><Notice>{notice}</Notice>{status && <p>{status.automaticPlans} recorded plans awaiting the switch.</p>}{status && !status.remindersConfigured && <Notice error>Daily reminders are not configured yet. The deployment administrator must add CRON_SECRET in Vercel and redeploy before scheduled reminders can run.</Notice>}<button className="button button-small" disabled={busy} onClick={async () => { if (!window.confirm('Stop automatic renewal for all existing Bravo plans at their paid end dates? No refund or new charge will be created.')) return; setBusy(true); setError(''); try { const result = await api('/admin/manual-renewal', { method: 'POST', body: { confirm: true } }); setNotice(result.message); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Switch existing plans to manual renewal</button></section>;
}
