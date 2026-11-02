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

const Arrow = () => <span aria-hidden="true">↗</span>;

export default function Home() {
  const { hash } = useLocation();
  const root = useRef(null);
  useCinematicMotion(root);
  // Keep previously shared chapter links working.
  const destination = HOME_SECTION_ROUTES[hash];
  if (destination) return <Navigate to={destination} replace/>;
  return <div ref={root} className="bravo-hub bravo-studio-home">
    <Header homeChapters/>
    <Editable as="main" contentKey="copy-home-1" id="main-content" tabIndex={-1}>
      <section className="home-hero studio-hero studio-shell" aria-labelledby="home-title">
        <div className="studio-hero-copy">
          <p className="studio-eyebrow"><span className="studio-dot" aria-hidden="true"/> ABERDEEN, SOUTH DAKOTA · WE COME TO YOU</p>
          <h1 id="home-title"><Editable as="span" contentKey="conversion-hero-title" canEditText>Dog training.<br/><em>For real life.</em></Editable></h1>
          <Editable as="p" contentKey="conversion-hero-intro" canEditText className="studio-intro">A calmer walk. A stronger connection. More life together. Private training that starts with your dog—and fits your everyday.</Editable>
          <div className="studio-actions">
            <Editable as={Link} contentKey="mobile-hero-book" canEditText canEditLink href="/portal?program=training" className="studio-button" onClick={() => trackVisit('hero_booking_clicked')}>Start my training plan <Arrow/></Editable>
            <Editable as={Link} contentKey="polish-hero-explore" canEditText canEditLink href="/training" className="studio-text-link">Explore training <span aria-hidden="true">→</span></Editable>
          </div>
          <Editable as="p" contentKey="hero-plan-explainer" canEditText className="studio-reassurance">Choose your trainer. Request a visit. Bravo confirms the details.</Editable>
          <div className="studio-hero-note"><span className="studio-note-line" aria-hidden="true"/><Editable as="p" contentKey="polish-hero-location" canEditText>TRUST. TRAIN. DEPLOY.</Editable><Link href="/our-approach">The Bravo approach <Arrow/></Link></div>
        </div>
        <div className="studio-hero-visual">
          <div className="cinema-hero-media studio-hero-photo"><img className="cinema-hero-still" data-site-image-key={CINEMATIC_HERO_KEY} src={CINEMATIC_HERO_SOURCE} srcSet={CINEMATIC_HERO_SRCSET} sizes={CINEMATIC_HERO_SIZES} width="1024" height="1536" alt={CINEMATIC_HERO_ALT} fetchPriority="high"/></div>
          <div className="studio-photo-label"><span>THE BRAVO WAY</span><strong>Confidence.<br/>In good company.</strong><span className="studio-label-arrow" aria-hidden="true">↗</span></div>
          <div className="studio-vertical-type" aria-hidden="true">REAL DOGS. REAL LIFE. BRAVO.</div>
        </div>
      </section>
      <div className="studio-principles studio-shell" aria-label="Training with Bravo"><span><b>01</b> Your dog. Your goals.</span><span><b>02</b> Training where life happens.</span><span><b>03</b> A team in your corner.</span><a href="#explore-bravo" aria-label="Explore Bravo">MEET YOUR NEXT CHAPTER <span aria-hidden="true">↓</span></a></div>
      <div className="studio-live studio-shell"><LiveBanner/></div>

      <section className="hub-training studio-training studio-shell" id="explore-bravo" aria-labelledby="hub-training-title">
        <div className="studio-section-heading" data-reveal=""><div><p className="studio-eyebrow">A LITTLE STRUCTURE. A BIG DIFFERENCE.</p><Editable as="h2" contentKey="hub-training-heading" canEditText id="hub-training-title">A better everyday.<br/><span>Starts here.</span></Editable></div><Editable as="p" contentKey="hub-training-copy" canEditText>From puppy foundations to everyday obedience. A plan for your dog, in the places you live.</Editable></div>
        <div className="studio-programs">
          <article className="studio-program studio-program-featured" data-reveal="">
            <div className="studio-program-image"><img src="/images/obedience-real-world.webp" width="1536" height="1024" alt="A trainer and dog owner practicing outdoors" loading="lazy"/><span className="studio-image-tag">BUILT AROUND YOUR DOG</span></div>
            <div className="studio-program-copy"><span className="studio-card-number">01 / PRIVATE TRAINING</span><h3>Good habits.<br/>Great company.</h3><p>Build everyday manners, focus, and a better connection—one visit at a time.</p><div className="studio-price"><CatalogPrice service="training"/><span> / month</span></div><Editable as="p" contentKey="hub-training-note" canEditText className="studio-card-note">Private visits Monday–Friday. Manual renewal.</Editable><Editable as={Link} contentKey="hub-training-link" canEditText canEditLink href="/training" className="studio-card-link">Explore private training <Arrow/></Editable></div>
          </article>
          <article className="studio-program" data-reveal=""><div className="studio-program-image"><img src="/images/mobile-bravo-cinematic-600.webp" width="600" height="400" alt="A German Shepherd focused beside its handler" loading="lazy"/></div><div className="studio-program-copy"><span className="studio-card-number">02 / BEHAVIOR SUPPORT</span><h3>Find your<br/>way forward.</h3><p>Start with a conversation about your dog’s behavior and explore the right next step.</p><p className="studio-card-detail">A thoughtful starting point.</p><Link href="/behavior-assessment" className="studio-card-link">Explore behavior assessments <Arrow/></Link></div></article>
          <article className="studio-program" data-reveal=""><div className="studio-program-image"><img src="/images/training-education.webp" width="1200" height="800" alt="Dog training and handler education" loading="lazy"/></div><div className="studio-program-copy"><span className="studio-card-number">03 / BRAVO WORKSHOPS</span><h3>Keep learning.<br/>Keep growing.</h3><p>Explore hands-on learning opportunities for you and your dog with the Bravo team.</p><p className="studio-card-detail">See upcoming availability.</p><Link href="/workshops" className="studio-card-link">Discover workshops <Arrow/></Link></div></article>
        </div>
        <nav className="studio-trust-links" aria-label="Check Bravo before booking"><span>Get to know Bravo.</span><Link href="/results#dogs">Watch real training <Arrow/></Link><Link href="/reviews?from=training">Read client reviews <Arrow/></Link><Link href="/team?from=training">Meet the trainers <Arrow/></Link></nav>
      </section>

      <section className="hub-stories studio-stories studio-shell" aria-label="Discover Bravo">
        <article className="hub-results studio-results" data-reveal=""><div className="studio-proof-photo"><img src="/images/bravo-client-training.jpeg" width="828" height="1121" alt="A dog practicing calm focus beside its handler in a store" loading="lazy"/><span className="studio-proof-caption">THE EVERYDAY IS THE TRAINING GROUND.</span></div><div className="studio-story-copy"><Editable as="p" contentKey="hub-results-eyebrow" canEditText className="studio-eyebrow">THE WORK SPEAKS.</Editable><Editable as="h2" contentKey="hub-results-title" canEditText>Real dogs.<br/><span>Real progress.</span></Editable><Editable as="p" contentKey="hub-results-copy" canEditText>Progress belongs in the moments that matter: a walk through town, a trip to the store, a calmer day at home. Step inside a Bravo training session.</Editable><div className="studio-actions"><Editable as={Link} contentKey="hub-results-link" canEditText canEditLink href="/results" className="studio-button studio-button-outline">See the work <Arrow/></Editable><Link href="/reviews" className="studio-text-link">Client stories <Arrow/></Link></div></div></article>
        <article className="hub-team studio-team" data-reveal=""><div className="studio-team-mark"><img src="/images/bravo-logo.webp" width="300" height="340" alt="Bravo K9 Solutions shield" loading="lazy" data-site-image-ignore=""/></div><div><Editable as="p" contentKey="hub-team-eyebrow" canEditText className="studio-eyebrow">GOOD PEOPLE. A SHARED PURPOSE.</Editable><Editable as="h2" contentKey="hub-team-title" canEditText>Your dog.<br/><span>Our commitment.</span></Editable><Editable as="p" contentKey="hub-team-copy" canEditText>Get to know the people in your corner, and the approach behind every Bravo training plan.</Editable></div><div className="studio-team-actions"><Editable as={Link} contentKey="hub-team-link" canEditText canEditLink href="/team" className="studio-text-link">Meet your team <Arrow/></Editable><Link href="/our-approach" className="studio-text-link">Our approach <Arrow/></Link></div></article>
      </section>

      <section className="hub-transport studio-transport studio-shell" aria-labelledby="hub-transport-title" data-reveal=""><div className="studio-transport-photo"><img src="/images/bravo-k9-transport-small.webp" width="800" height="450" alt="Bravo’s black Dodge Durango K9 transport vehicle" loading="lazy" data-site-image-ignore=""/></div><div className="studio-transport-copy"><Editable as="p" contentKey="hub-transport-eyebrow" canEditText className="studio-eyebrow"><span className="studio-dot" aria-hidden="true"/> COMING SOON · K9 TRANSPORT</Editable><Editable as="h2" contentKey="hub-transport-title" canEditText id="hub-transport-title">The Bravo standard.<br/><span>On the road.</span></Editable><p>A new chapter for Bravo. Explore what’s ahead for K9 transport.</p><Editable as={Link} contentKey="hub-transport-link" canEditText canEditLink href="/k9-transport" className="studio-text-link">Explore K9 Transport <Arrow/></Editable></div></section>

      <section className="hub-close studio-close studio-shell" aria-labelledby="booking-title" data-reveal=""><p className="studio-eyebrow">YOUR DOG’S NEXT CHAPTER</p><Editable as="h2" contentKey="hub-close-title" canEditText id="booking-title">Less friction.<br/><span>More life together.</span></Editable><p>Let’s start with your dog. We’ll take it from there.</p><div className="studio-actions"><Editable as={Link} contentKey="copy-home-62" canEditText canEditLink href="/portal?program=training" className="studio-button">Start my training plan <Arrow/></Editable><Editable as="a" contentKey="copy-home-63" canEditText canEditLink href="tel:+16058242767" className="studio-text-link">Talk to Bravo <Arrow/></Editable></div><nav className="studio-more" aria-label="More from Bravo"><Link href="/workshops">Workshops</Link><Link href="/live">Bravo Live</Link><Link href="/tools-of-the-trade">Tools of the Trade</Link><Link href="/learn">Online lessons</Link><Link href="/fci-support">FCI support</Link><Link href="/how-to">Booking help</Link></nav></section>
      <div className="studio-shell site-media-tools-slot site-media-tools-slot--home" data-site-media-tools=""/>
    </Editable><Footer/>
  </div>;
}
