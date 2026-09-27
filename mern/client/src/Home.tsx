import GoalFinder from './GoalFinder';
import { WorkshopDetails } from './WorkshopDetails';
import { publicTrainerName } from '../../shared/discovery';
import { useEffect, useRef, useState } from 'react';
import { Header, Footer } from './ui';
import { Editable } from './SiteContent';
import Link from './Link';
import { api } from './api';
import { useBravo } from './context';
import { SERVICES, money, TRAINING_ADDITIONAL_DOG_CENTS } from '../../shared/catalog';
import { lessonLibraryVisible } from '../../shared/lesson-library';
import { HOME_HERO_SOURCE, HOME_HERO_ALT, HOME_HERO_KEY } from '../../shared/home-hero.js';
import { framingStyle } from '../../shared/site-images.js';
import { getSiteImages } from './site-image-state.js';
import HeroPhotoCarousel from './HeroPhotoCarousel';
import CinematicFilm from './CinematicFilm';
import useCinematicMotion from './useCinematicMotion';
import HomeBanner from './HomeBanner';
import HomeAdCarousel from './HomeAdCarousel';
import ProofVideoCarousel from './ProofVideoCarousel';
import FacebookRecommendations from './FacebookRecommendations';
import ReviewPreview from './ReviewPreview';
import ReviewStars from './ReviewStars';
import TrainerIntroduction from './TrainerIntroduction';
import TrainerScheduleCard, { useLiveTrainerSchedules } from './TrainerScheduleCard';
import LessonOffers from './LessonOffers';
import './trainer-schedules.css';
import './home-polish.css';

const secondary = ['walking', 'aggression'];
type Trainer = { id: string; name: string; role: string; title: string; bio: string };
const displayName = publicTrainerName;
const portraits: Record<string, string> = { 'David Northrop': 'david-northrop', 'Ashley Northrop': 'ashley-northrop', 'Ashley Leverock': 'ashley-leverock', 'Janet Hughes': 'janet-hughes' };

export default function Home() {
  const root = useRef(null);
  useCinematicMotion(root);
  const [hero] = useState(() => getSiteImages()[HOME_HERO_KEY]);
  const { config, user } = useBravo();
  const catalog = config?.services?.length ? config.services : SERVICES;
  const training = catalog.find(service => service.id === 'training');
  const [team, setTeam] = useState<Trainer[]>([]);
  const [teamVisible, setTeamVisible] = useState(false);
  const liveSchedules = useLiveTrainerSchedules(teamVisible);
  const [reviews, setReviews] = useState<{reviews: Array<{_id: string; authorName: string; rating: number; body: string}>; average: number; count: number}>({ reviews: [], average: 0, count: 0 });
  const lessonsOpen = lessonLibraryVisible(config, user);
  useEffect(() => {
    let live = true;
    api('/team').then(data => { if (live) setTeam(Array.isArray(data.team) ? [...data.team].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner')) : []); }).catch(() => { if (live) setTeam([]); });
    api('/reviews').then(data => { if (live) setReviews(data); }).catch(() => {});
    const observer = new IntersectionObserver(([entry]) => setTeamVisible(entry.isIntersecting), { rootMargin: '300px' });
    const section = document.getElementById('team');
    if (section) observer.observe(section);
    return () => { live = false; observer.disconnect(); };
  }, []);
  return <div ref={root} className="bravo-home cinema-home">
    <Header/>
    <main id="main-content" tabIndex={-1}>
      <CinematicFilm>
        <div className="cinema-hero-copy cinema-shell">
          <Editable as="p" contentKey="cinema-location" canEditText className="cinema-eyebrow">ABERDEEN, SOUTH DAKOTA</Editable>
          <Editable as="h1" contentKey="cinema-hero-title" canEditText id="home-title">Training built<br/>around the dog.</Editable>
          <Editable as="p" contentKey="cinema-hero-intro" canEditText className="cinema-hero-intro">Not treats. Not toys. Understanding.</Editable>
          <div className="cinema-actions"><a className="cinema-button cinema-button-light" href="#training">Explore training</a><Link className="cinema-link" href="/portal?program=training">Book training <span aria-hidden="true">↗</span></Link></div>
        </div>
        <div className="cinema-hero-baseline cinema-shell"><span>REAL DOGS. REAL LIFE. BRAVO.</span><a href="#method" aria-label="Discover the Bravo approach">SCROLL TO DISCOVER <span aria-hidden="true">↓</span></a></div>
      </CinematicFilm>
      <div className="home-service-strip cinema-service-strip"><span>Private training · {training ? money(training.cents) : '$200'}/month · one dog · We come to you.</span><a href="tel:+16058242767">Let’s talk <span>(605) 824-2767</span></a></div>
      <div className="cinema-shell site-media-tools-slot site-media-tools-slot--home" data-site-media-tools=""/>

      <GoalFinder/>
      <section id="method" className="cinema-intro cinema-shell" aria-labelledby="method-title" data-reveal="">
        <p className="cinema-eyebrow">THE BRAVO APPROACH</p>
        <Editable as="h2" contentKey="cinema-method-title" canEditText id="method-title">Understanding changes<br/><span>everything.</span></Editable>
        <Editable as="p" contentKey="cinema-method-copy" canEditText>We start with the dog in front of us. Their personality. Their instincts. Their world. Then we build trust through clear communication.</Editable>
        <div className="cinema-method-signature"><span>Trust.</span><span>Train.</span><span>Deploy.</span></div>
      </section>

      <section className="cinema-story" data-step="0" aria-labelledby="real-world-title">
        <div className="cinema-story-stage">
          <img src="/images/bravo-client-training.jpeg" width="828" height="1121" loading="lazy" alt="A Bravo dog practicing calm behavior alongside its trainer in a busy store"/>
          <div className="cinema-story-shade" aria-hidden="true"/>
          <div className="cinema-story-copy cinema-shell"><p className="cinema-eyebrow">TRAINING FOR THE LIFE YOU LIVE</p>
            <h2 id="real-world-title"><span className="cinema-story-line">The real world<br/>doesn’t sit still.</span><span className="cinema-story-line">Stairs. Crowds.<br/>Noise. Distractions.</span><span className="cinema-story-line">Build understanding.<br/>Everywhere.</span></h2>
            <p>We train where life happens. And we do it over and over—across breeds, temperaments, and everyday challenges.</p>
            <div className="cinema-story-progress" aria-hidden="true"><i/><i/><i/></div>
          </div>
        </div>
      </section>

      <section id="dogs" className="cinema-dogs cinema-shell" aria-labelledby="dogs-title">
        <div className="cinema-section-heading" data-reveal=""><div><p className="cinema-eyebrow">INDIVIDUAL DOGS. INDIVIDUAL APPROACH.</p><Editable as="h2" contentKey="cinema-dogs-title" canEditText id="dogs-title">Different dogs.<br/><span>Same goal.</span></Editable></div><p>Clear communication.<br/>Our method adapts to the dog standing in front of us.</p></div>
        <div className="cinema-dog-gallery home-hero-authentic">
          <HeroPhotoCarousel><img className="home-hero-image" src={hero?.src || HOME_HERO_SOURCE} width="828" height="1121" loading="lazy" fetchPriority="low" alt={hero?.framed ? hero.alt : HOME_HERO_ALT} style={hero?.framed ? framingStyle(hero) : undefined} data-site-image-original={HOME_HERO_SOURCE} data-site-image-original-alt={HOME_HERO_ALT} data-site-media-original-styles='{"objectFit":"","objectPosition":"","transform":"","transformOrigin":"","clipPath":""}'/></HeroPhotoCarousel>
          <div className="cinema-gallery-note"><span>THE BRAVO FIELD NOTES</span><p>Real moments.<br/>Real connection.</p><small>Swipe to meet more of Bravo.</small></div>
        </div>
      </section>

      <section id="training" className="cinema-programs cinema-shell" aria-labelledby="program-title">
        <div className="cinema-section-heading" data-reveal=""><div><p className="cinema-eyebrow">FIND YOUR STARTING POINT</p><Editable as="h2" contentKey="cinema-program-title" canEditText id="program-title">A better everyday.<br/><span>Starts here.</span></Editable></div><Link href="/dog-training" className="cinema-link">How training works <span aria-hidden="true">↗</span></Link></div>
        {training && training.enabled !== false && <article className="home-training-offer cinema-training-card" data-reveal="">
          <div className="cinema-program-image"><img src="/images/service-dog-training.webp" width="1536" height="1024" loading="lazy" alt="Dog practicing attentive behavior in a public setting"/></div>
          <div className="cinema-program-copy"><p className="cinema-eyebrow">PROFESSIONAL TRAINING</p><h3>More connection.<br/>More possibility.</h3><p className="cinema-price">{money(training.cents)}<span> / month · one dog</span></p><p>Up to one hour per day. Monday–Friday.<br/>Private sessions. We come to you.</p><Link className="cinema-button" href="/portal?program=training">Start with private training <span aria-hidden="true">↗</span></Link><details className="cinema-details"><summary>Membership details</summary><p>Choose days and times in your profile; Bravo confirms requested visits. Up to five one-hour visits per week. Each additional dog is {money(TRAINING_ADDITIONAL_DOG_CENTS)}/month. Manual renewal. No automatic monthly charge.</p></details></div>
        </article>}
        <div className="cinema-secondary-programs">{secondary.map(id => { const service = catalog.find(s => s.id === id); return service && service.enabled !== false ? <article key={id} data-reveal=""><p className="cinema-eyebrow">{id === 'walking' ? 'MOVEMENT. STRUCTURE. ROUTINE.' : 'EXPERIENCE. CONTROL. STRUCTURE.'}</p><h3>{id === 'walking' ? 'Better walks.' : 'A more considered approach.'}</h3><p>{id === 'walking' ? 'Dog walking with the Bravo team. Thirty minutes of real movement.' : 'Aggressive dog intake. Start with an assessment and a conversation about what comes next.'}</p><div><span>{money(service.cents)} <small>{id === 'walking' ? '/ dog · 30 min' : 'initial intake'}</small></span><Link href={id === 'walking' ? '/dog-walking' : '/behavior-assessment'} aria-label={id === 'walking' ? 'Explore dog walking' : 'Explore aggressive dog intake'}>Explore <span aria-hidden="true">↗</span></Link></div></article> : null; })}</div>
        <details className="cinema-details cinema-specialists"><summary>Specialist and working-dog programs <span aria-hidden="true">+</span></summary><p>Talk with Bravo about your dog, suitability, and the preparation your goals require.</p><div>{['Service Dogs', 'Law Enforcement', 'Executive Protection', 'Search & Rescue'].map(name => <Link key={name} href="/contact">{name}<span aria-hidden="true">↗</span></Link>)}</div></details>
      </section>

      <section id="team" className="cinema-team" aria-labelledby="team-title"><div className="cinema-shell">
        <div className="cinema-section-heading" data-reveal=""><div><p className="cinema-eyebrow">THE HUMANS BEHIND BRAVO</p><Editable as="h2" contentKey="cinema-team-title" canEditText id="team-title">Your dog’s people.<br/><span>And yours.</span></Editable></div><p>David. Ashley. Your dog.<br/>That’s where the work begins.</p></div>
        <div className="home-team-grid cinema-team-grid">{team.map(person => <article key={person.id || person.name} data-reveal=""><div className="cinema-portrait"><img src={`/images/${portraits[person.name] || 'bravo-logo-small'}.webp`} data-site-image-key={`team-${(person.name === 'Ashley Leverock' ? 'Ashley Northrop' : person.name).toLowerCase().replaceAll(' ', '-')}`} width="1000" height="1400" loading="lazy" alt={`${displayName(person.name)}, ${person.title}`}/></div><div className="home-person cinema-person"><p className="cinema-eyebrow">{person.role === 'owner' ? 'FOUNDER / LEAD TRAINER' : person.title}</p><h3>{displayName(person.name)}</h3><details className="cinema-details"><summary>Meet {person.name.split(' ')[0]} <span aria-hidden="true">+</span></summary><TrainerIntroduction person={person}/>{person.id && <><details className="home-availability"><summary>View {person.name.split(' ')[0]}’s working hours</summary><TrainerScheduleCard person={person} live={liveSchedules}/></details><Link className="cinema-link" href={`/portal?program=training&trainer=${encodeURIComponent(person.id)}`}>Request a visit with {person.name.split(' ')[0]} →</Link></>}</details></div></article>)}</div>
      </div></section>

      <section id="reviews" className="cinema-proof" aria-labelledby="reviews-title"><div className="cinema-shell">
        <div className="cinema-proof-intro" data-reveal=""><img src="/images/bravo-logo-small.webp" width="64" height="72" alt="" data-site-image-ignore=""/><p className="cinema-eyebrow">PROOF IN THE EVERYDAY</p><Editable as="h2" contentKey="cinema-proof-title" canEditText id="reviews-title">Don’t take<br/><span>our word for it.</span></Editable><p>Watch the work. Hear from the people who live with the difference.</p></div>
        <ProofVideoCarousel/>
        <FacebookRecommendations/>
        {reviews.reviews.length > 0 && <div className="cinema-account-reviews"><p>{reviews.average} out of 5 · {reviews.count} verified Bravo account {reviews.count === 1 ? 'review' : 'reviews'}</p><div className="review-grid home-proof-reviews">{reviews.reviews.slice(0, 3).map(review => <article className="panel" key={review._id}><ReviewStars rating={review.rating}/><ReviewPreview body={review.body} author={review.authorName}/><strong>{review.authorName}</strong><small>Verified Bravo account</small></article>)}</div></div>}
        <Link className="cinema-link" href="/account#your-review">Share your experience <span aria-hidden="true">↗</span></Link>
      </div></section>

      <section id="workshops" className="cinema-events" aria-labelledby="workshops-title"><div className="cinema-shell cinema-section-heading" data-reveal=""><div><p className="cinema-eyebrow">MORE WAYS TO LEARN</p><Editable as="h2" contentKey="cinema-workshops-title" canEditText id="workshops-title">Come. Learn.<br/><span>Go further.</span></Editable></div><p>Saturday workshops, upcoming courses,<br/>and what’s next at Bravo.</p></div><div className="cinema-shell"><WorkshopDetails compact/></div><HomeBanner/><HomeAdCarousel/></section>

      <section id="online" className="cinema-online" aria-labelledby="online-title"><div className="cinema-shell cinema-online-inner"><div data-reveal=""><p className="cinema-eyebrow">BRAVO. ANYWHERE.</p><Editable as="h2" contentKey="cinema-online-title" canEditText id="online-title">Closer to understanding.<br/><span>Wherever you are.</span></Editable><Editable as="p" contentKey="cinema-online-copy" canEditText>Professional dog-training education from David and Ashley. Learn the method, understand the why, and bring it into your everyday life.</Editable>{lessonsOpen ? <Link href="/learn" className="cinema-button cinema-button-light">Explore online lessons <span aria-hidden="true">↗</span></Link> : <Link href="/learn" className="cinema-button cinema-button-light">Online courses · Coming soon →</Link>}</div><div className="cinema-learning-visual" data-reveal=""><div className="home-lesson-preview"><img src="/images/training-education.webp" width="1600" height="900" loading="lazy" alt="A handler demonstrating clear communication with a dog"/></div><div className="cinema-learning-caption"><img src="/images/bravo-logo-small.webp" width="42" height="48" alt="" data-site-image-ignore=""/><span>Understanding.<br/><strong>At your own pace.</strong></span></div></div></div>{lessonsOpen && <details className="cinema-shell cinema-details"><summary>Online lesson options</summary><LessonOffers/></details>}</section>

      <section className="cinema-close cinema-shell" aria-labelledby="booking-title" data-reveal=""><p className="cinema-eyebrow">GOOD THINGS START WITH UNDERSTANDING.</p><Editable as="h2" contentKey="cinema-close-title" canEditText id="booking-title">Let’s meet<br/><span>your dog.</span></Editable><p>Tell us about your dog. We’ll help you take the next step.</p><div className="cinema-actions"><Link href="/portal?program=training" className="cinema-button">Book training <span aria-hidden="true">↗</span></Link><a href="tel:+16058242767" className="cinema-link">Talk to Bravo</a></div><span className="cinema-close-location">ABERDEEN, SOUTH DAKOTA · WE COME TO YOU</span></section>
    </main><Footer/>
  </div>;
}
