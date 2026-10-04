import { Link } from 'react-router-dom';
import { useLiveSessions } from './live-state';
import './live.css';

export default function LiveBanner() {
  const { sessions } = useLiveSessions();
  const publicSessions = sessions.filter(session => session.audience === 'public');
  if (!publicSessions.length) return null;
  return <aside className="live-promo-wrap" aria-label="Bravo is training live"><Link to="/live" className="live-promo">
    <div><span className="live-badge"><i/>LIVE</span><p>TRAINING NOW</p><h2>WATCH BRAVO <em>LIVE</em></h2><span>Real sessions. Real dogs. Real progress.</span></div>
    <span className="live-promo-arrow" aria-hidden="true">↗</span>
  </Link></aside>;
}
