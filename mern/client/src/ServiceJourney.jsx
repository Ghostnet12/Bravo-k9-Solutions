import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { SERVICES, money, TRAINING_ADDITIONAL_DOG_CENTS } from '../../shared/catalog';
export function ServicePrice({ program = 'training' }) {
  const { config } = useBravo();
  const service = (config?.services || SERVICES).find(item => item.id === program);
  if (!service) return null;
  return <div className="service-price"><strong>{money(service.cents)}</strong><span>{program === 'training' ? '/month · one dog' : program === 'walking' ? '/dog · 30 minutes' : 'initial two-trainer intake'}</span>{program === 'training' && <p>Each additional dog: {money(TRAINING_ADDITIONAL_DOG_CENTS)}/month. Renew manually; no automatic monthly payment.</p>}{program === 'aggression' && <p>Ongoing training is discussed and priced separately after the assessment.</p>}{service.enabled === false && <p>Online requests are paused. Call Bravo to discuss availability.</p>}</div>;
}
export default function ServiceJourney({ program = 'training' }) {
  return <section className="service-journey" aria-label="How your visit works"><h2>From your first question<br/>to your first visit.</h2><ol>{[
    ['Tell us about your dog', program === 'aggression' ? 'Share the history, handling concerns and situations you want help with.' : 'Share your goals and the everyday situations you want to work on.'],
    ['Request a visit', 'Choose from available dates and times. Saving a request does not charge your card.'],
    ['Look for confirmation', 'Bravo confirms the appointment. Your account keeps the request, payment and visit status together.'],
    ['Work with your trainer', program === 'walking' ? 'Confirm access instructions and handling needs before your walk.' : 'Meet your trainer, discuss the plan and learn what to practice between visits.'],
  ].map(([title, copy], i) => <li key={title}><span aria-hidden="true">0{i + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol><Link className="inline-link" to="/contact">Questions before you start? Talk to Bravo →</Link></section>;
}
