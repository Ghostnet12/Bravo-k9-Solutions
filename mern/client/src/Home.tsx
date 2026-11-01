import { useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Header, Footer } from './ui';
import { Editable } from './SiteContent';
import Link from './Link';
import CatalogPrice from './CatalogPrice';
import LiveBanner from './LiveBanner';
import { trackVisit } from './telemetry';
import { HOME_SECTION_ROUTES } from '../../shared/home-routes';
import { CINEMATIC_HERO_SOURCE, CINEMATIC_HERO_KEY, CINEMATIC_HERO_ALT, CINEMATIC_HERO_SRCSET, CINEMATIC_HERO_SIZES } from '../../shared/cinematic-hero.js';
import useCinematicMotion from './useCinematicMotion';
import './mobile-conversion.css';

export default function Home() {
  const { hash } = useLocation();
  const root = useRef(null);
  useCinematicMotion(root);
  // Previously shared section URLs continue to reach the content that moved.
  const destination = HOME_SECTION_ROUTES[hash];
  if (destination) return <Navigate to={destination} replace/>;
  return <div ref={root} className="bravo-home cinema-home conversion-home bravo-redesign bravo-hub">
    <Header homeChapters/>
    <Editable as="main" contentKey="copy-home-1" id="main-content" tabIndex={-1}>
      <section className="home-hero cinema-hero home-hero--confidence" aria-labelledby="home-title">
        <div className="cinema-hero-media"><div className="cinema-film"><img className="cinema-hero-still" data-site-image-key={CINEMATIC_HERO_KEY} src={CINEMATIC_HERO_SOURCE} srcSet={CINEMATIC_HERO_SRCSET} sizes={CINEMATIC_HERO_SIZES} width="1024" height="1536" alt={CINEMATIC_HERO_ALT} fetchPriority="high"/><div className="cinema-hero-shade" aria-hidden="true"/></div></div>
        <div className="cinema-hero-copy cinema-shell">
          <Editable as="p" contentKey="polish-hero-location" canEditText className="cinema-eyebrow">TRUST. TRAIN. DEPLOY.</Editable>
          <h1 id="home-title"><Editable as="span" contentKey="conversion-hero-title" canEditText>Dog training.<br/><em>For real life.</em></Editable></h1>
          <Editable as="p" contentKey="hero-booking-location" canEditText className="hero-service-location">Aberdeen, SD · At home and in everyday places</Editable>
          <p className="cinema-hero-intro"><Editable as="span" contentKey="conversion-hero-intro" canEditText>Real life. Real confidence. A calmer life together.</Editable></p>
          <div className="polish-hero-actions"><Editable as={Link} contentKey="mobile-hero-book" canEditText canEditLink href="/portal?program=training" className="cinema-button conversion-button" onClick={() => trackVisit('hero_booking_clicked')}>Start My Training Plan <span aria-hidden="true">→</span></Editable><Editable as={Link} contentKey="polish-hero-explore" canEditText canEditLink href="/training" className="cinema-link">Explore Training</Editable></div>
          <Editable as="p" contentKey="hero-plan-explainer" canEditText className="hero-plan-explainer">Choose your trainer. Request a visit. Bravo confirms the details.</Editable>
        </div>
        <div className="cinema-hero-baseline cinema-shell"><Editable as="span" contentKey="copy-home-4" canEditText>REAL DOGS. REAL LIFE. BRAVO.</Editable><Editable as="a" contentKey="copy-home-5" canEditText canEditLink href="#explore-bravo" aria-label="Explore Bravo">SCROLL TO DISCOVER <span aria-hidden="true">↓</span></Editable></div>
      </section>
      <div className="home-live-status cinema-shell"><LiveBanner/></div>
      <section className="hub-training cinema-shell" id="explore-bravo" aria-labelledby="hub-training-title" data-reveal="">
        <div className="hub-feature-image"><img src="/images/obedience-real-world.webp" width="1200" height="800" alt="A trainer and dog owner practicing outdoors" loading="lazy"/></div>
        <div className="hub-feature-copy">
          <Editable as="p" contentKey="hub-training-eyebrow" canEditText className="cinema-eyebrow">PRIVATE TRAINING. PERSONAL ATTENTION.</Editable>
          <Editable as="h2" contentKey="hub-training-heading" canEditText id="hub-training-title">A better everyday.<br/><span>Starts here.</span></Editable>
          <Editable as="p" contentKey="hub-training-copy" canEditText>From puppy foundations to everyday obedience. A plan for your dog, in the places you live.</Editable>
          <p className="hub-price"><CatalogPrice service="training"/><span> / month</span></p>
          <Editable as="p" contentKey="hub-training-note" canEditText className="hub-note">Private visits Monday–Friday. Manual renewal.</Editable>
          <div className="hub-actions"><Editable as={Link} contentKey="hub-training-link" canEditText canEditLink href="/training" className="cinema-button">Explore training <span aria-hidden="true">→</span></Editable><Link href="/behavior-assessment" className="cinema-link">Behavior concerns?</Link></div><nav className="hub-trust-links" aria-label="Check Bravo before booking"><span>Get to know Bravo:</span><Link href="/results">Watch real training</Link><Link href="/reviews">Read client reviews</Link><Link href="/team">Meet the trainers</Link></nav>
        </div>
      </section>
      <section className="hub-stories cinema-shell" aria-label="Discover Bravo">
        <article className="hub-tile hub-results" data-reveal="">
          <div className="hub-tile-copy"><Editable as="p" contentKey="hub-results-eyebrow" canEditText className="cinema-eyebrow">THE WORK SPEAKS.</Editable><Editable as="h2" contentKey="hub-results-title" canEditText>Real dogs.<br/><span>Real progress.</span></Editable><Editable as="p" contentKey="hub-results-copy" canEditText>Step inside a Bravo training session.</Editable><div className="hub-actions"><Editable as={Link} contentKey="hub-results-link" canEditText canEditLink href="/results" className="cinema-link">See the work <span aria-hidden="true">→</span></Editable><Link href="/reviews" className="cinema-link">Client stories <span aria-hidden="true">→</span></Link></div></div>
          <img src="/images/bravo-client-training.jpeg" width="828" height="1121" loading="lazy" alt="Bravo training a dog in an everyday setting"/>
        </article>
        <article className="hub-tile hub-team" data-reveal="">
          <div className="hub-tile-copy"><Editable as="p" contentKey="hub-team-eyebrow" canEditText className="cinema-eyebrow">TRUST. TRAIN. DEPLOY.</Editable><Editable as="h2" contentKey="hub-team-title" canEditText>Your dog.<br/><span>Our commitment.</span></Editable><Editable as="p" contentKey="hub-team-copy" canEditText>Meet the people and the approach behind Bravo.</Editable><div className="hub-actions"><Editable as={Link} contentKey="hub-team-link" canEditText canEditLink href="/team" className="cinema-link">Meet your team <span aria-hidden="true">→</span></Editable><Link href="/our-approach" className="cinema-link">Our approach <span aria-hidden="true">→</span></Link></div></div>
          <div className="hub-shield"><img src="/images/bravo-logo.webp" width="300" height="340" alt="Bravo K9 Solutions shield" loading="lazy" data-site-image-ignore=""/></div>
        </article>
      </section>
      <section className="hub-transport cinema-shell" aria-labelledby="hub-transport-title" data-reveal="">
        <img src="/images/bravo-k9-transport-small.webp" width="800" height="450" alt="Bravo’s black Dodge Durango K9 transport vehicle" loading="lazy" data-site-image-ignore=""/>
        <div><Editable as="p" contentKey="hub-transport-eyebrow" canEditText className="cinema-eyebrow">TRANSPORT SERVICE LAUNCHING</Editable><Editable as="h2" contentKey="hub-transport-title" canEditText id="hub-transport-title">The Bravo standard.<br/><span>On the road.</span></Editable><Editable as={Link} contentKey="hub-transport-link" canEditText canEditLink href="/k9-transport" className="cinema-link">Explore K9 Transport <span aria-hidden="true">→</span></Editable></div>
      </section>
      <section className="hub-close cinema-shell" aria-labelledby="booking-title" data-reveal="">
        <Editable as="h2" contentKey="hub-close-title" canEditText id="booking-title">Your next chapter.<br/><span>Starts with your dog.</span></Editable><div className="hub-actions"><Editable as={Link} contentKey="copy-home-62" canEditText canEditLink href="/portal?program=training" className="cinema-button">Book training <span aria-hidden="true">↗</span></Editable><Editable as="a" contentKey="copy-home-63" canEditText canEditLink href="tel:+16058242767" className="cinema-link">Talk to Bravo</Editable></div>
        <nav className="hub-more" aria-label="More from Bravo"><Link href="/workshops">Workshops</Link><Link href="/live">Bravo Live</Link><Link href="/tools-of-the-trade">Tools of the Trade</Link><Link href="/learn">Online lessons</Link><Link href="/fci-support">FCI support</Link><Link href="/how-to">Booking help</Link></nav>
      </section>
      <div className="cinema-shell site-media-tools-slot site-media-tools-slot--home" data-site-media-tools=""/>
    </Editable><Footer/>
  </div>;
}
