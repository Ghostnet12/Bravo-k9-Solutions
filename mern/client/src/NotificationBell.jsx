import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import './client-services.css';
export default function NotificationBell() {
  const { user, notifications = [], refreshNotifications } = useBravo();
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const trigger = useRef(null), panel = useRef(null);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  const unread = notifications.filter(item => item.unread).length;
  if (!user) return null;
  return <div className="notification-bell" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}><button ref={trigger} className="quiet-button" aria-expanded={open} aria-controls="notification-inbox" onClick={() => setOpen(value => !value)}>Notifications <span className="notification-count" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span></button>{open && <section ref={panel} tabIndex={-1} id="notification-inbox" className="notification-inbox" aria-label="Notifications"><h2>Notifications</h2><button className="quiet-button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Close notifications</button>{error && <p role="alert">{error}</p>}{notifications.length ? notifications.map(item => <article key={item.id}><Link to={item.href} onClick={() => setOpen(false)}>{item.body}</Link>{item.unread && <button className="quiet-button" onClick={async () => { try { await api('/notifications/read', { method: 'POST', body: { ids: [item.id] } }); await refreshNotifications(); } catch (e) { setError(e.message); } }}>Mark read</button>}</article>) : <p>No notifications yet.</p>}</section>}</div>;
}
