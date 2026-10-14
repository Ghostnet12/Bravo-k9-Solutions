import { Children, useEffect, useRef, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Editable } from './SiteContent';
import CatalogPrice from './CatalogPrice';
import { useBravo } from './context';
import { SERVICES } from '../../shared/catalog';
import { trackVisit } from './telemetry';

const compactQuery = '(max-width: 700px)';
const subscribeCompact = notify => {
  const query = matchMedia(compactQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const compactSnapshot = () => matchMedia(compactQuery).matches;
const serverSnapshot = () => false;
const mobileSectionOrder = ['reviews', 'team', 'method', 'goals', 'training', 'story', 'dogs', 'workshops', 'fci', 'online'];
// Keep keyboard and screen-reader order aligned with the mobile visual order.
// Stable React keys preserve each section's media and editor state when resizing.
export function HomeSectionOrder({ children }) {
  const compact = useSyncExternalStore(subscribeCompact, compactSnapshot, serverSnapshot);
  const sections = Children.toArray(children);
  return compact ? sections.sort((a, b) => mobileSectionOrder.indexOf(a.key.split('$').at(-1)) - mobileSectionOrder.indexOf(b.key.split('$').at(-1))) : sections;
}
export const MOBILE_GOALS = [
  { id: 'manners', title: 'Pulling & jumping', copy: 'Everyday obedience and better control.', image: '/images/obedience-real-world.webp', href: '/portal?program=training&focus=basic-obedience', service: 'training' },
  { id: 'reactivity', title: 'Aggression & reactivity', copy: 'Start with a separate two-trainer assessment.', image: '/images/protection-training.webp', href: '/portal?program=aggression', service: 'aggression' },
  { id: 'puppy', title: 'Puppy obedience', copy: 'Build the right foundation early.', image: '/images/dog-sitting-care.webp', href: '/portal?program=training&focus=basic-obedience', service: 'training' },
  { id: 'advanced', title: 'Advanced training', copy: 'Higher-level obedience. Working goals scoped individually.', image: '/images/tracking-training.webp', href: '/contact?interest=advanced-training', service: 'training' },
];
const trustIcons = [
  <><ellipse cx="7" cy="7" rx="2.4" ry="3"/><ellipse cx="17" cy="7" rx="2.4" ry="3"/><ellipse cx="3" cy="12" rx="2" ry="2.5"/><ellipse cx="21" cy="12" rx="2" ry="2.5"/><path d="M6 18c0-4 3-7 6-7s6 3 6 7c0 4-4 1-6 1s-6 3-6-1Z"/></>,
  <><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/></>,
  <><circle cx="12" cy="6" r="3"/><circle cx="4" cy="9" r="2"/><circle cx="20" cy="9" r="2"/><path d="M7 22v-7a5 5 0 0 1 10 0v7ZM1 21v-6a3 3 0 0 1 4-3M23 21v-6a3 3 0 0 0-4-3"/></>,
  <path d="m12 2 3 6.5 7 1-5 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-5 7-1Z"/>,
];
export function ConversionTrust() {
  return <div className="conversion-trust mobile-conversion" aria-label="The Bravo approach">{[['All breeds','All ages'],['Real-world','Environments'],['Professional','Trainers'],['See our','Results']].map(([a,b],index)=><div key={a}><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{trustIcons[index]}</svg><strong>{a}<br/>{b}</strong></div>)}</div>;
}
export function MobileDiscovery() {
  const { config } = useBravo();
  const catalog = config?.services?.length ? config.services : SERVICES;
  const training = catalog.find(item => item.id === 'training');
  const offer = useRef(null);
  useEffect(() => {
    const target = offer.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && matchMedia('(max-width: 700px)').matches) trackVisit('pricing_viewed');
    }, { threshold: .4 });
    observer.observe(target); return () => observer.disconnect();
  }, []);
  return <section className="mobile-conversion conversion-opening" aria-labelledby="conversion-goal-title">
    <div className="conversion-discovery">
      <Editable as="h2" contentKey="mobile-discovery-title" canEditText id="conversion-goal-title">What does your dog struggle with?</Editable>
      <Editable as="p" contentKey="mobile-discovery-intro" canEditText className="conversion-subtitle">Find the right training plan and book today.</Editable>
      <div className="conversion-goals">{MOBILE_GOALS.map(goal => {
        const enabled = catalog.find(item => item.id === goal.service)?.enabled !== false;
        return <Editable as={Link} key={goal.id} contentKey={`mobile-goal-${goal.id}`} className="conversion-goal" to={enabled ? goal.href : '/contact'} onClick={() => trackVisit('goal_selected')}>
          <img src={goal.image} alt="" width="480" height="360" loading="lazy"/>
          <div><Editable as="h3" contentKey={`mobile-goal-${goal.id}-title`} canEditText>{goal.title}</Editable><Editable as="p" contentKey={`mobile-goal-${goal.id}-copy`} canEditText>{enabled ? goal.copy : 'Ask Bravo about availability.'}</Editable><span aria-hidden="true" className="conversion-arrow">→</span></div>
        </Editable>;
      })}</div>
      <Editable as={Link} contentKey="mobile-not-sure" canEditText canEditLink className="conversion-talk" to="/contact">Not sure? Talk to Bravo. <span aria-hidden="true">→</span></Editable>
    </div>
    <Editable as="section" contentKey="mobile-training-offer" ref={offer} className="conversion-offer" aria-labelledby="conversion-price-title" data-site-service="training">
      <div className="conversion-offer-copy">
        <Editable as="h2" contentKey="mobile-training-heading" canEditText id="conversion-price-title">Private dog training</Editable>
        <p className="conversion-price"><CatalogPrice/><span> / month</span></p>
        <ul>{['Personalized training','Up to one hour per scheduled training day','Monday through Friday','Up to five training visits per week','Client-selected scheduling, subject to availability','Training in real-world environments','Bravo comes to you','Manual monthly renewal'].map((term,index)=><Editable as="li" key={term} contentKey={`mobile-training-term-${index}`} canEditText>{term}</Editable>)}</ul>
        <details className="conversion-catalog-terms"><summary>Current program terms</summary><p>{training?.description}</p><p>One dog. Additional dogs: <CatalogPrice field="additionalDogCents"/>/month each. Aggression assessments and specialist programs are separate.</p></details>
        <Editable as={Link} contentKey="mobile-training-start" canEditText canEditLink className="conversion-button" to={training?.enabled === false ? '/contact' : '/portal?program=training'} onClick={() => trackVisit('pricing_booking_clicked')}>{training?.enabled === false ? 'Ask about training' : 'Start my training plan'} <span aria-hidden="true">→</span></Editable>
      </div>
    </Editable>
  </section>;
}
export function MobileHomeNav() {
  function openMenu() {
    const menu = document.querySelector('.app-header .menu-toggle');
    if (menu?.getAttribute('aria-expanded') !== 'true') menu?.click();
    menu?.focus();
  }
  return <nav className="mobile-home-nav mobile-conversion" aria-label="Quick navigation">
    <a href="#home-title" aria-label="Home"><span aria-hidden="true">⌂</span>Home</a>
    <Link to="/portal?program=training" className="mobile-home-book" onClick={() => trackVisit('sticky_booking_clicked')}><span aria-hidden="true">▦</span>Book now</Link>
    <Link to="/live"><span aria-hidden="true">▷</span>Live cams</Link>
    <a href="#reviews"><span aria-hidden="true">☆</span>Reviews</a>
    <button type="button" onClick={openMenu} aria-controls="bravo-navigation"><span aria-hidden="true">☰</span>More</button>
  </nav>;
}
export function ConversionFAQ() {
  return <section className="conversion-faq cinema-shell" aria-labelledby="conversion-faq-title"><Editable as="h2" contentKey="mobile-faq-title" canEditText id="conversion-faq-title">Before your first visit.</Editable>{[
    ['Does choosing a date confirm my appointment?', 'No. Send your request and Bravo will confirm the visit details. Your chosen date and time remain a request until confirmed.'],
    ['Can I plan the whole month?', 'Yes. Choose “Plan my entire month” in the booking flow, or use My Schedule if you already have an active training membership.'],
    ['Does my membership renew automatically?', 'No. Training renews manually each month. Your review shows the current price before you continue.'],
    ['What if my dog is aggressive or reactive?', 'Start with the separate two-trainer assessment. Bravo will discuss handling, suitability and the next steps with you.'],
  ].map(([q,a],i)=><details key={q}><Editable as="summary" contentKey={`mobile-faq-${i}-question`} canEditText>{q}</Editable><Editable as="p" contentKey={`mobile-faq-${i}-answer`} canEditText>{a}</Editable></details>)}</section>;
}
