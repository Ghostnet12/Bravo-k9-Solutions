import { Link } from 'react-router-dom';
import { Editable } from './SiteContent';
import { isSpecialistFocus, trainingFocusName } from '../../shared/catalog';

export default function SpecialistScope({ focus }) {
  if (!isSpecialistFocus(focus)) return null;
  return <aside className="notice specialist-scope" aria-label="Specialist program pricing" role="status">
    <strong>{trainingFocusName(focus)}</strong>
    <Editable as="p" contentKey="specialist-booking-scope" canEditText>The monthly price shown covers private obedience foundations only. It is not a quote for a complete specialist program. Suitability, job-specific training, duration, and pricing must be agreed with Bravo separately.</Editable>
    <Editable as={Link} contentKey="specialist-booking-contact" canEditText canEditLink to="/contact">Discuss your specialist goal with Bravo →</Editable>
  </aside>;
}
