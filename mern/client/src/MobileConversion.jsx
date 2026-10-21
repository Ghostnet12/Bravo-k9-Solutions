import { Children, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
export const useCompactLayout = () => useSyncExternalStore(subscribeCompact, compactSnapshot, serverSnapshot);
const homeSectionOrder = ['training', 'reviews', 'team', 'faq', 'booking', 'method', 'tools', 'results', 'dogs', 'workshops', 'fci', 'online'];
// One reading order for every viewport, including the server-rendered page.
// Stable keys preserve media and editor state when the viewport changes.
export function HomeSectionOrder({ children }) {
  return Children.toArray(children).sort((a, b) => homeSectionOrder.indexOf(a.key.split('$').at(-1)) - homeSectionOrder.indexOf(b.key.split('$').at(-1)));
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
export function TrainingOffer() {
  const { config } = useBravo();
  const catalog = config?.services?.length ? config.services : SERVICES;
  const training = catalog.find(item => item.id === 'training');
  const offer = useRef(null);
  useEffect(() => {
    const target = offer.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) trackVisit('pricing_viewed');
    }, { threshold: .4 });
    observer.observe(target); return () => observer.disconnect();
  }, []);
  return <div className="conversion-opening cinema-shell">
    <Editable as="section" contentKey="mobile-training-offer" ref={offer} className="conversion-offer" aria-labelledby="conversion-price-title" data-site-service="training">
      <div className="conversion-offer-copy">
        <Editable as="h2" contentKey="mobile-training-heading" canEditText id="conversion-price-title">Private dog training</Editable>
        <p className="conversion-price"><CatalogPrice/><span> / month · one dog</span></p>
        <p className="conversion-dog-terms">Additional dogs: <CatalogPrice field="additionalDogCents"/>/month each. Manual renewal.</p>
        <ul>{['Up to one hour per scheduled training day','Monday through Friday','Up to five training visits per week','Client-selected scheduling, subject to availability'].map((term,index)=><Editable as="li" key={term} contentKey={`mobile-training-term-${index + 1}`} canEditText>{term}</Editable>)}</ul>
        <Editable as={Link} contentKey="mobile-training-start" canEditText canEditLink className="conversion-button" to={training?.enabled === false ? '/contact' : '/portal?program=training'} onClick={() => trackVisit('pricing_booking_clicked')}>{training?.enabled === false ? 'Ask about training' : 'Start my training plan'} <span aria-hidden="true">→</span></Editable>
        <details className="conversion-catalog-terms"><summary>Current program terms</summary><p>{training?.description}</p><ul>{[[0,'Personalized training'],[5,'Training in real-world environments'],[6,'Bravo comes to you'],[7,'Manual monthly renewal']].map(([index,term]) => <Editable as="li" key={index} contentKey={`mobile-training-term-${index}`} canEditText>{term}</Editable>)}</ul><p>Aggression assessments and specialist programs are separate.</p></details>
      </div>
    </Editable>
  </div>;
}
export function MobileDiscovery() {
  const { config } = useBravo();
  const catalog = config?.services?.length ? config.services : SERVICES;
  return <section className="mobile-conversion" aria-labelledby="conversion-goal-title">
    <div className="conversion-discovery">
      <Editable as="h2" contentKey="mobile-discovery-title" canEditText id="conversion-goal-title">What does your dog struggle with?</Editable>
      <Editable as="p" contentKey="mobile-discovery-intro" canEditText className="conversion-subtitle">Find the right training plan and book today.</Editable>
      <div className="conversion-goals">{MOBILE_GOALS.map(goal => {
        const enabled = catalog.find(item => item.id === goal.service)?.enabled !== false;
        return <Editable as={Link} key={goal.id} contentKey={`mobile-goal-${goal.id}`} className="conversion-goal" data-site-photo-surface="" to={enabled ? goal.href : '/contact'} onClick={() => trackVisit('goal_selected')}>
          <img src={goal.image} alt="" width="480" height="360" loading="lazy"/>
          <div><Editable as="h3" contentKey={`mobile-goal-${goal.id}-title`} canEditText>{goal.title}</Editable><Editable as="p" contentKey={`mobile-goal-${goal.id}-copy`} canEditText>{enabled ? goal.copy : 'Ask Bravo about availability.'}</Editable><span aria-hidden="true" className="conversion-arrow">→</span></div>
        </Editable>;
      })}</div>
      <Editable as={Link} contentKey="mobile-not-sure" canEditText canEditLink className="conversion-talk" to="/contact">Not sure? Talk to Bravo. <span aria-hidden="true">→</span></Editable>
    </div>
  </section>;
}
export function MobileHomeNav({ staticFallback = false }) {
  const location = useLocation();
  function returnToAnchor(event, id) {
    if (location.pathname !== '/' || location.hash !== `#${id}`) return;
    const target = document.getElementById(id);
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: 'instant' }); target.focus({ preventScroll: true }); }
  }
  const { user } = useBravo();
  const staff = ['owner', 'staff'].includes(user?.role);
  const bookingPath = staff ? '/admin?tab=schedule' : user ? '/schedule' : '/portal?program=training';
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const sync = event => setMenuOpen(event.detail.open === true);
    window.addEventListener('bravo-navigation-state', sync);
    setMenuOpen(document.querySelector('.app-header .menu-toggle')?.getAttribute('aria-expanded') === 'true');
    return () => window.removeEventListener('bravo-navigation-state', sync);
  }, []);
  function closeOnEscape(event) {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      window.dispatchEvent(new Event('bravo-navigation-close'));
    }
  }
  function toggleMenu() {
    window.dispatchEvent(new Event('bravo-navigation-toggle'));
  }
  return <nav className="mobile-home-nav mobile-conversion" aria-label="Quick navigation">
    <Link to="/#home-title" aria-label="Home" onClick={event => returnToAnchor(event, 'home-title')}><span aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M3 10 12 3l9 7v11h-6v-7H9v7H3z"/></svg></span>Home</Link>
    <Link to={bookingPath} className="mobile-home-book" onClick={() => trackVisit('sticky_booking_clicked')}><span aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 18h2 M14 18h2"/></svg></span>{user ? 'Schedule' : 'Book now'}</Link>
    <Link to="/#training-programs" onClick={event => returnToAnchor(event, 'training-programs')}><span aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z"/></svg></span>Services</Link>
    <Link to="/#reviews" onClick={event => returnToAnchor(event, 'reviews')}><span aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg></span>Reviews</Link>
    <Link to="/contact"><span aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.19 18a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.09 3.18 2 2 0 0 1 4.08 1h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.05 8.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.92z"/></svg></span>Contact</Link>
    {!staticFallback && <button type="button" data-navigation-toggle="" onClick={toggleMenu} onKeyDown={closeOnEscape} aria-expanded={menuOpen} aria-controls="bravo-navigation"><span aria-hidden="true"><svg width="25" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M4 6h16 M4 12h16 M4 18h16"/></svg></span>More</button>}
  </nav>;
}
export function ConversionFAQ() {
  return <section id="first-visit-help" className="conversion-faq cinema-shell" aria-labelledby="conversion-faq-title"><Editable as="h2" contentKey="mobile-faq-title" canEditText id="conversion-faq-title">Before your first visit.</Editable>{[
    ['Does choosing a date confirm my appointment?', 'No. Send your request and Bravo will confirm the visit details. Your chosen date and time remain a request until confirmed.'],
    ['Can I plan the whole month?', 'Yes. Choose “Plan my entire month” in the booking flow, or use My Schedule if you already have an active training membership.'],
    ['Does my membership renew automatically?', 'No. Training renews manually each month. Your review shows the current price before you continue.'],
    ['What if my dog is aggressive or reactive?', 'Start with the separate two-trainer assessment. Bravo will discuss handling, suitability and the next steps with you.'],
  ].map(([q,a],i)=><details key={q}><Editable as="summary" contentKey={`mobile-faq-${i}-question`} canEditText>{q}</Editable><Editable as="p" contentKey={`mobile-faq-${i}-answer`} canEditText>{a}</Editable></details>)}</section>;
}
