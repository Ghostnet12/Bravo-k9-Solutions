import { Link } from 'react-router-dom';
import { useLiveSessions } from './live-state';
import './live.css';

export default function LiveBanner() {
  const { announcements, availability, loading } = useLiveSessions();
  const live = announcements.filter(item => item.status === 'live');
  if (!live.length) return availability === 'unavailable' && !loading ? <p className="hero-live-unavailable" role="status">Live status unavailable · <Link to="/live">Check sessions →</Link></p> : null;
  return <aside className="hero-live" aria-label="Trainers broadcasting now" data-site-image-ignore="">
    <Link to={live.length === 1 ? live[0].href : '/live'} className="live-badge"><i aria-hidden="true"/>LIVE</Link>
    <ul>{live.map(item => <li key={item.trainerId}><Link to={item.href}>{item.trainerName}{item.audience === 'client' && <small>Client session</small>}</Link></li>)}</ul>
  </aside>;
}
