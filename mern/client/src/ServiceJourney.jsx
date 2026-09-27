import CatalogPrice from './CatalogPrice';
import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { SERVICES } from '../../shared/catalog';
export function ServicePrice({ program = 'training' }) {
  const { config } = useBravo();
  const service = (config?.services || SERVICES).find(item => item.id === program);
  if (!service) return null;
  return <div data-site-service={program} className="service-price"><strong><CatalogPrice service={program}/></strong><span>{program === 'training' ? '/month · one dog' : program === 'walking' ? '/dog · 30 minutes' : 'initial two-trainer intake'}</span>{program === 'training' && <p><Editable as="span" contentKey="copy-servicejourney-1" canEditText>Each additional dog: </Editable><CatalogPrice field="additionalDogCents"/><Editable as="span" contentKey="copy-servicejourney-2" canEditText>/month. Renew manually; no automatic monthly payment.</Editable></p>}{program === 'aggression' && <Editable as="p" contentKey="copy-servicejourney-3" canEditText>Ongoing training is discussed and priced separately after the assessment.</Editable>}{service.enabled === false && <Editable as="p" contentKey="copy-servicejourney-4" canEditText>Online requests are paused. Call Bravo to discuss availability.</Editable>}</div>;
}
export default function ServiceJourney({ program = 'training' }) {
  return <Editable as="section" contentKey="copy-servicejourney-5" className="service-journey" aria-label="How your visit works"><Editable as="h2" contentKey="journey-title" canEditText>From your first question<br/>to your first visit.</Editable><ol>{[
    ['Tell us about your dog', program === 'aggression' ? 'Share the history, handling concerns and situations you want help with.' : 'Share your goals and the everyday situations you want to work on.'],
    ['Request a visit', 'Choose from available dates and times. Saving a request does not charge your card.'],
    ['Look for confirmation', 'Bravo confirms the appointment. Your account keeps the request, payment and visit status together.'],
    ['Work with your trainer', program === 'walking' ? 'Confirm access instructions and handling needs before your walk.' : 'Meet your trainer, discuss the plan and learn what to practice between visits.'],
  ].map(([title, copy], i) => <li key={title}><span aria-hidden="true">0{i + 1}</span><Editable as="h3" contentKey={`journey-${program}-${i}-title`} canEditText>{title}</Editable><Editable as="p" contentKey={`journey-${program}-${i}-copy`} canEditText>{copy}</Editable></li>)}</ol><Editable as={Link} contentKey="copy-servicejourney-6" canEditText canEditLink className="inline-link" to="/contact">Questions before you start? Talk to Bravo →</Editable></Editable>;
}
