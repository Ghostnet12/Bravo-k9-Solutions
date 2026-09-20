import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { money } from '../../shared/catalog';
import './lesson-studio.css';
export default function LessonOffers() {
  const { config, user } = useBravo();
  const library = config?.lessonLibrary;
  if (!library?.open && user?.role !== 'owner') return null;
  const training = config?.services?.find(service=>service.id==='training');
  return <div className="lesson-offers" aria-label="Lesson membership options"><article><h3>Online lessons</h3><p className="price">{money(library?.lessonCents || 7500)}<small>/month</small></p><p>Access the published library of videos, photos, and written lessons from Bravo’s trainers.</p>{library?.open ? <Link className="button" to="/portal?program=online">Choose lessons</Link> : <Link to="/admin?tab=lessons">Closed · manage in Lesson studio →</Link>}</article>{training?.enabled !== false && <article><h3>Training + lessons</h3><p className="price">{money(library?.bundleCents || 25000)}<small>/month</small></p><p>Private training for one dog plus online lessons. Save $25/month. Each additional training dog is $100/month.</p>{library?.open ? <Link className="button" to="/portal?program=training&lessons=1">Choose the bundle</Link> : <span>Closed · preview only</span>}</article>}<p className="helper">One month of access. Renew manually when you’re ready; no automatic charges.</p></div>;
}
