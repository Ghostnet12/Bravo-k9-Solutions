import { Link } from 'react-router-dom';
import { Editable } from './SiteContent';
import { isSpecialistFocus, trainingFocusName } from '../../shared/catalog';
import { specialistInquiryPath } from '../../shared/contact-interest';

export default function SpecialistScope({ focus, withLessons = false }) {
  if (!isSpecialistFocus(focus)) return null;
  return <aside className="notice specialist-scope" aria-label="Specialist program pricing" role="status">
    <strong>{trainingFocusName(focus)}</strong>
    <Editable as="p" contentKey={withLessons ? "specialist-booking-bundle-scope" : "specialist-booking-scope"} canEditText>{withLessons ? "The monthly training bundle includes private obedience foundations and online lesson access. It is not a quote for a complete specialist program. Suitability, job-specific training, duration, and pricing must be agreed with Bravo separately." : "The training portion of the price shown covers private obedience foundations only. It is not a quote for a complete specialist program. Suitability, job-specific training, duration, and pricing must be agreed with Bravo separately."}</Editable>
    <Editable as={Link} contentKey="specialist-booking-contact" canEditText canEditLink to={specialistInquiryPath(focus)}>Discuss your specialist goal with Bravo →</Editable>
  </aside>;
}
