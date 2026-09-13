import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBravo } from './context';
import './client-services.css';
export default function NotificationBell() {
  const { user, notifications = [], markNotificationsRead } = useBravo();
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [viewedItems, setViewedItems] = useState([]);
  const trigger = useRef(null), panel = useRef(null), pending = useRef(new Set());
  const navigate = useNavigate();
  useEffect(() => { setOpen(false); setViewedItems([]); pending.current.clear(); }, [user?.id]);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open || !panel.current || !window.IntersectionObserver) return;
    // Only acknowledge alerts actually visible in the scrolling panel. Keep this
    // open panel's text stable so clearing a badge cannot move a link under a tap.
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.dataset.notificationId;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6 || pending.current.has(id)) continue;
        pending.current.add(id);
        markNotificationsRead([id]).catch(e => { pending.current.delete(id); setError(e.message); });
      }
    }, { root: panel.current, threshold: 0.6 });
    panel.current.querySelectorAll('[data-notification-id]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [open, viewedItems, markNotificationsRead]);
  const unread = notifications.filter(item => item.unread).length;
  function toggle() {
    if (!open) { setViewedItems(notifications.filter(item => item.unread)); setError(''); pending.current.clear(); }
    setOpen(value => !value);
  }
  async function acknowledge(item, follow = false) {
    try {
      await markNotificationsRead([item.id]);
      if (follow) { setOpen(false); navigate(item.href); }
      else setViewedItems(items => items.filter(row => row.id !== item.id));
    } catch (e) { setError(e.message); }
  }
  if (!user) return null;
  return <div className="notification-bell" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} className="quiet-button" aria-expanded={open} aria-controls="notification-inbox" onClick={toggle}>Notifications {unread > 0 && <span className="notification-count" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section ref={panel} tabIndex={-1} id="notification-inbox" className="notification-inbox" aria-label="Notifications"><h2>Notifications</h2><button className="quiet-button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Close notifications</button>{error && <p role="alert">{error}</p>}
      {viewedItems.length ? viewedItems.map(item => <article key={item.id}><Link data-notification-id={item.id} to={item.href} onClick={e => { e.preventDefault(); e.stopPropagation(); acknowledge(item, true); }}>{item.body}</Link>{notifications.some(row => row.id === item.id) ? <button className="quiet-button" onClick={() => acknowledge(item)}>Mark read</button> : <span className="helper">Read</span>}</article>) : <p>No unread notifications.</p>}
    </section>}
  </div>;
}
