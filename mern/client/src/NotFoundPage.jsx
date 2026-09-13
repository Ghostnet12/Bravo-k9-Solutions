import { Link } from 'react-router-dom';
import { Page } from './ui';

export default function NotFoundPage() {
  return <Page title="That page wandered off." eyebrow="PAGE NOT FOUND"><p>The address may have changed. Choose a page below, or call Bravo for help.</p><div className="panel prose"><h2>Find your next step.</h2><ul><li><Link to="/">Bravo home</Link></li><li><Link to="/dog-training">Dog training</Link></li><li><Link to="/dog-walking">Dog walking</Link></li><li><Link to="/schedule">My schedule</Link></li><li><Link to="/contact">Contact Bravo</Link></li></ul></div></Page>;
}
