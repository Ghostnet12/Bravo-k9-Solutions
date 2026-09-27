import CatalogPrice from './CatalogPrice';
import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import './lesson-studio.css';
export default function LessonOffers() {
  const { config, user } = useBravo();
  const library = config?.lessonLibrary;
  if (!library?.open && user?.role !== 'owner') return null;
  const training = config?.services?.find(service=>service.id==='training');
  return <div className="lesson-offers" aria-label="Lesson membership options"><Editable as="article" contentKey="copy-lessonoffers-1"><Editable as="h3" contentKey="copy-lessonoffers-2" canEditText>Online lessons</Editable><p className="price" data-site-service="online"><CatalogPrice service="online"/><Editable as="small" contentKey="copy-lessonoffers-3" canEditText>/month</Editable></p><Editable as="p" contentKey="copy-lessonoffers-4" canEditText>Access the published library of videos, photos, and written lessons from Bravo’s trainers.</Editable>{library?.open ? <Editable as={Link} contentKey="copy-lessonoffers-5" canEditText canEditLink className="button" to="/portal?program=online">Choose lessons</Editable> : <Editable as={Link} contentKey="copy-lessonoffers-6" canEditText canEditLink to="/admin?tab=lessons">Closed · manage in Lesson studio →</Editable>}</Editable>{training?.enabled !== false && <Editable as="article" contentKey="copy-lessonoffers-7"><Editable as="h3" contentKey="copy-lessonoffers-8" canEditText>Training + lessons</Editable><p className="price" data-site-service="online"><CatalogPrice service="online" field="bundleCents"/><Editable as="small" contentKey="copy-lessonoffers-9" canEditText>/month</Editable></p><Editable as="p" contentKey="copy-lessonoffers-10">Private training for one dog plus online lessons. Each additional training dog is <CatalogPrice field="additionalDogCents"/>/month.</Editable>{library?.open ? <Editable as={Link} contentKey="copy-lessonoffers-11" canEditText canEditLink className="button" to="/portal?program=training&lessons=1">Choose the bundle</Editable> : <Editable as="span" contentKey="copy-lessonoffers-12" canEditText>Closed · preview only</Editable>}</Editable>}<Editable as="p" contentKey="copy-lessonoffers-13" canEditText className="helper">One month of access. Renew manually when you’re ready; no automatic charges.</Editable></div>;
}
