import LiveBanner from './LiveBanner';
import { CINEMATIC_HERO_SRCSET, CINEMATIC_HERO_SIZES } from '../../shared/cinematic-hero.js';
import { ConversionTrust, MobileDiscovery, TrainingOffer, ConversionFAQ, HomeSectionOrder, useCompactLayout } from './MobileConversion';
import { trackVisit } from './telemetry';
import './mobile-conversion.css';
import { initialRecommendations } from './review-state';
import CatalogPrice from './CatalogPrice';
import { publicTrainerName } from '../../shared/discovery';
import GoalFinder from './GoalFinder';
import { WorkshopDetails } from './WorkshopDetails';
import { useEffect, useRef, useState } from 'react';
import { Header, Footer } from './ui';
import { Editable } from './SiteContent';
import Link from './Link';
import { api } from './api';
import { useBravo } from './context';
import { SERVICES } from '../../shared/catalog';
import { lessonLibraryVisible } from '../../shared/lesson-library';
import { HOME_HERO_SOURCE, HOME_HERO_ALT, HOME_HERO_KEY } from '../../shared/home-hero.js';
import { framingStyle } from '../../shared/site-images.js';
import { getSiteImages } from './site-image-state.js';
import HeroPhotoCarousel from './HeroPhotoCarousel';

import useCinematicMotion from './useCinematicMotion';
import ProofVideoCarousel from './ProofVideoCarousel';
import FacebookRecommendations from './FacebookRecommendations';
import ReviewPreview from './ReviewPreview';
import ReviewStars from './ReviewStars';
import TrainerIntroduction from './TrainerIntroduction';
import { trainerIntroductions } from '../../shared/trainer-profile';
import TrainerScheduleCard, { useLiveTrainerSchedules } from './TrainerScheduleCard';
import LessonOffers from './LessonOffers';
import './trainer-schedules.css';
import './home-polish.css';
import './home-fci.css';
import './home-tools.css';
import './field-experience.css';

const secondary = ['walking', 'aggression'];
type Trainer = { id: string; name: string; role: string; title: string; bio: string; image?: string; imageKey?: string; profileKey?: string };

const portraits: Record<string, string> = { 'David Northrop': 'david-northrop', 'Ashley Northrop': 'ashley-northrop', 'Ashley Leverock': 'ashley-leverock', 'Janet Hughes': 'janet-hughes' };

export default function Home() {
  const root = useRef(null);
  const compact = useCompactLayout();
  useCinematicMotion(root);
  const [hero] = useState(() => getSiteImages()[HOME_HERO_KEY]);
  const { config, user } = useBravo();
  const catalog = config?.services?.length ? config.services : SERVICES;
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [team, setTeam] = useState<Trainer[]>([]);
  const [teamVisible, setTeamVisible] = useState(false);
  const liveSchedules = useLiveTrainerSchedules(teamVisible);
  const [reviews, setReviews] = useState<{reviews: Array<{_id: string; authorName: string; rating: number; body: string; editedByOwner?: boolean}>; average: number; count: number}>({ reviews: [], average: 0, count: 0 });
  const lessonsOpen = lessonLibraryVisible(config, user);
  useEffect(() => {
    let live = true;
    // The server snapshot seeds only this visit; later navigation reads fresh reviews.
    document.querySelector('meta[name="bravo-reviews"]')?.remove();
    api('/team').then(data => { if (live) setTeam(Array.isArray(data.team) ? [...data.team].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner')) : []); }).catch(() => { if (live) setTeam([]); });
    api('/reviews').then(data => { if (live) { setReviews(data); if (Array.isArray(data.recommendations)) setRecommendations(data.recommendations); } }).catch(() => {});
    const published = event => setTeam(people => people.map(person => person.id === event.detail.id ? event.detail : person));
    window.addEventListener('bravo-team-published', published);
    const observer = new IntersectionObserver(([entry]) => setTeamVisible(entry.isIntersecting), { rootMargin: '300px' });
    const section = document.getElementById('team');
    if (section) observer.observe(section);
    return () => { live = false; observer.disconnect(); window.removeEventListener('bravo-team-published', published); };
  }, []);
  return <div ref={root} className="bravo-home cinema-home conversion-home">
    <Header/>
    <Editable as="main" contentKey="copy-home-1" id="main-content" tabIndex={-1}>
      <section className="home-hero cinema-hero" aria-labelledby="home-title">
        <div className="cinema-hero-media"><div className="cinema-film"><img className="cinema-hero-still" data-site-image-key="asset-mobile-bravo-cinematic.webp" src="/images/mobile-bravo-cinematic.webp" srcSet={CINEMATIC_HERO_SRCSET} sizes={CINEMATIC_HERO_SIZES} width="1536" height="1024" alt="Bravo cinematic dog portrait" fetchPriority="high"/><div className="cinema-hero-shade" aria-hidden="true"/></div></div>
        <div className="cinema-hero-copy cinema-shell">
          <Editable as="p" contentKey="polish-hero-location" canEditText className="cinema-eyebrow">ABERDEEN, SOUTH DAKOTA — WE COME TO YOU.</Editable>
          <h1 id="home-title"><Editable as="span" contentKey="conversion-hero-title" canEditText>REAL DOGS.<br/><em>REAL CONTROL.</em></Editable></h1>
          <p className="cinema-hero-intro"><Editable as="span" contentKey="conversion-hero-intro" canEditText>Personalized training built around your dog. No treats or toys as the foundation. Real-world results.</Editable></p>
          {!compact && <LiveBanner/>}
          <div className="polish-hero-actions"><Editable as={Link} contentKey="mobile-hero-book" canEditText canEditLink href="/portal?program=training" className="cinema-button conversion-button" onClick={() => trackVisit('hero_booking_clicked')}>BOOK YOUR FIRST SESSION <span aria-hidden="true">→</span></Editable><Editable as="a" contentKey="polish-hero-explore" canEditText canEditLink href="#training" className="cinema-link">EXPLORE TRAINING <span aria-hidden="true">→</span></Editable></div>
        </div>
        <div className="cinema-hero-baseline cinema-shell"><Editable as="span" contentKey="copy-home-4" canEditText>REAL DOGS. REAL LIFE. BRAVO.</Editable><Editable as="a" contentKey="copy-home-5" canEditText canEditLink href="#method" aria-label="Discover the Bravo approach">SCROLL TO DISCOVER <span aria-hidden="true">↓</span></Editable></div>
      </section>
      <ConversionTrust/>
      <div id="training" className="home-primary-training"><TrainingOffer/></div>
      {compact && <div className="home-live-status cinema-shell"><LiveBanner/></div>}
      <div className="cinema-shell site-media-tools-slot site-media-tools-slot--home" data-site-media-tools=""/>

      <HomeSectionOrder>
      <section key="tools" className="home-tools cinema-shell" aria-label="Tools of the Trade">
        <Editable as={Link} contentKey="home-tools-of-the-trade" canEditLink href="/tools-of-the-trade" className="home-tools-card" aria-labelledby="home-tools-title home-tools-action" aria-describedby="home-tools-copy">
          <div>
            <Editable as="p" contentKey="home-tools-eyebrow" canEditText className="home-tools-eyebrow">THE BRAVO TOOLKIT</Editable>
            <Editable as="h2" contentKey="home-tools-title" canEditText id="home-tools-title">Know the tools. <span>See the purpose.</span></Editable>
            <Editable as="p" contentKey="home-tools-copy" canEditText id="home-tools-copy">Explore the equipment we use for basic through advanced obedience. We assess your dog first and use only what they need.</Editable>
          </div>
          <Editable as="span" contentKey="home-tools-action" canEditText id="home-tools-action" className="home-tools-action">Explore Tools of the Trade <span aria-hidden="true">→</span></Editable>
        </Editable>
      </section>
      <section key="fci" className="home-fci cinema-shell" aria-labelledby="home-fci-title">
        <Link href="/fci-support" className="home-fci-card" aria-labelledby="home-fci-title home-fci-action">
          <div className="home-fci-identity"><img src="/images/fci-official-identity.jpeg" width="796" height="240" loading="lazy" alt="Fédération Cynologique Internationale — for pedigree dogs worldwide"/></div>
          <div className="home-fci-copy">
            <Editable as="p" contentKey="home-fci-eyebrow" canEditText className="cinema-eyebrow">BRAVO’S FCI SUPPORT INITIATIVE</Editable>
            <Editable as="h2" contentKey="home-fci-title" canEditText id="home-fci-title">Global standards.<br/><span>Stronger dogs.</span></Editable>
            <Editable as="p" contentKey="home-fci-description" canEditText>Discover international breed standards, responsible breeding, canine health, and the latest official FCI announcements.</Editable>
            <Editable as="span" contentKey="home-fci-action" canEditText className="home-fci-action" id="home-fci-action">Explore FCI Support <span aria-hidden="true">↗</span></Editable>
            <small>An independent Bravo initiative. No official FCI affiliation or endorsement.</small>
          </div>
        </Link>
      </section>
      <Editable as="section" key="training" contentKey="copy-home-24" id="training-programs" tabIndex={-1} className="cinema-programs cinema-shell" aria-labelledby={compact ? "conversion-goal-title" : "goal-title"}>
        <MobileDiscovery/><GoalFinder/>
        <div className="cinema-secondary-programs">{secondary.map(id => { const service = catalog.find(s => s.id === id); return service && service.enabled !== false ? <article data-site-service={id} key={id} data-reveal=""><Editable as="p" contentKey={`home-service-${id}-eyebrow`} canEditText className="cinema-eyebrow">{id === 'walking' ? 'MOVEMENT. STRUCTURE. ROUTINE.' : 'EXPERIENCE. CONTROL. STRUCTURE.'}</Editable><Editable as="h3" contentKey={`home-service-${id}-title`} canEditText>{id === 'walking' ? 'Better walks.' : 'Start with an assessment.'}</Editable><Editable as="p" contentKey={`home-service-${id}-copy`} canEditText>{id === 'walking' ? 'Dog walking with the Bravo team. Thirty minutes of focused movement.' : 'Aggressive-dog intake with two trainers. Review the behavior first; decide what comes next second.'}</Editable><div><span><CatalogPrice service={id}/> <small>{id === 'walking' ? '/ dog · 30 min' : 'initial intake'}</small></span><Editable as={Link} contentKey={`home-service-${id}-link`} canEditText canEditLink href={id === 'walking' ? '/dog-walking' : '/behavior-assessment'} aria-label={id === 'walking' ? 'Explore dog walking' : 'Explore aggressive dog intake'}>Explore <span aria-hidden="true">↗</span></Editable></div></article> : null; })}</div>
        <details id="specialist-training" open className="cinema-details cinema-specialists"><Editable as="summary" contentKey="copy-home-37" canEditText>Specialist and working-dog programs <span aria-hidden="true">+</span></Editable><Editable as="p" contentKey="copy-home-38" canEditText>Specialist and working-dog goals are scoped individually. Contact Bravo to discuss suitability, preparation, and pricing.</Editable><div>{['Service Dogs', 'Law Enforcement', 'Executive Protection', 'Search & Rescue', 'Hunting Dog Training'].map((name, index) => <Editable as={Link} contentKey={`home-specialist-${index}`} canEditText canEditLink key={name} href={index === 4 ? '/hunting-dog-training' : '/contact'}>{name}<span aria-hidden="true">↗</span></Editable>)}</div></details>
      </Editable>

      <Editable as="section" key="results" contentKey="home-results-section" id="results" className="cinema-proof home-results" aria-labelledby="results-title"><div className="cinema-shell">
        <div className="cinema-section-heading" data-reveal=""><div><Editable as="p" contentKey="home-results-eyebrow" canEditText className="cinema-eyebrow">REAL DOGS. REAL SESSIONS.</Editable><Editable as="h2" contentKey="home-results-title" canEditText id="results-title">See the work.<br/><span>See the progress.</span></Editable></div><Editable as="p" contentKey="home-results-copy" canEditText>Watch authentic Bravo sessions, with the context behind each dog's training.</Editable></div>
        <ProofVideoCarousel/>
      <Editable as="div" contentKey="copy-home-18" id="dogs" className="cinema-dogs proof-photos" aria-labelledby="dogs-title">
        <div className="cinema-section-heading" data-reveal=""><div><Editable as="p" contentKey="copy-home-19" canEditText className="cinema-eyebrow">ONE STANDARD. DIFFERENT DOGS.</Editable><Editable as="h3" contentKey="cinema-dogs-title" canEditText id="dogs-title">Different dogs.<br/><span>Different starting points.</span></Editable></div><Editable as="p" contentKey="copy-home-17" canEditText>We train where life happens—repeating the work across breeds, temperaments, and real distractions.</Editable></div>
        <div className="cinema-dog-gallery home-hero-authentic">
          <HeroPhotoCarousel><img className="home-hero-image" src={hero?.src || HOME_HERO_SOURCE} width="828" height="1121" loading="lazy" fetchPriority="low" alt={hero?.framed ? hero.alt : HOME_HERO_ALT} style={hero?.framed ? framingStyle(hero) : undefined} data-site-image-original={HOME_HERO_SOURCE} data-site-image-original-alt={HOME_HERO_ALT} data-site-media-original-styles='{"objectFit":"","objectPosition":"","transform":"","transformOrigin":"","clipPath":""}'/></HeroPhotoCarousel>
          <div className="cinema-gallery-note"><Editable as="span" contentKey="copy-home-21" canEditText>THE BRAVO FIELD NOTES</Editable><Editable as="p" contentKey="copy-home-22" canEditText>Real dogs.<br/>Real sessions.</Editable><Editable as="small" contentKey="copy-home-23" canEditText>Swipe through Bravo in the field.</Editable></div>
        </div>
      </Editable>
        <div className="home-results-actions"><Editable as={Link} contentKey="home-results-book" canEditText canEditLink href="/portal?program=training" className="cinema-button">Start training with Bravo <span aria-hidden="true">→</span></Editable><a className="cinema-link" href="#reviews">Read client experiences <span aria-hidden="true">↓</span></a></div>
      </div></Editable>

      <Editable as="section" key="reviews" contentKey="copy-home-42" id="reviews" tabIndex={-1} className="cinema-proof" aria-labelledby="reviews-title"><div className="cinema-shell">
        <div className="cinema-proof-intro" data-reveal=""><img src="/images/bravo-logo-small.webp" width="64" height="72" alt="" data-site-image-ignore=""/><Editable as="p" contentKey="copy-home-43" canEditText className="cinema-eyebrow">PROOF IN THE WORK</Editable><Editable as="h2" contentKey="cinema-proof-title" canEditText id="reviews-title">Don’t take<br/><span>our word for it.</span></Editable><Editable as="p" contentKey="copy-home-44" canEditText>Read what clients noticed at home.</Editable></div>

        <FacebookRecommendations reviews={recommendations}/>
        {reviews.reviews.length > 0 && <div className="cinema-account-reviews"><p>{reviews.average}<Editable as="span" contentKey="copy-home-45" canEditText> out of 5 · </Editable>{reviews.count}<Editable as="span" contentKey="copy-home-46" canEditText> verified Bravo account </Editable>{reviews.count === 1 ? 'review' : 'reviews'}</p><div className="review-grid home-proof-reviews" role="group" aria-label="Client reviews" tabIndex={0}>{reviews.reviews.slice(0, 3).map(review => <Editable as="article" contentKey="copy-home-47" className="panel" key={review._id}><ReviewStars rating={review.rating}/><ReviewPreview body={review.body} author={review.authorName}/><strong>{review.authorName}</strong><Editable as="small" contentKey="copy-home-48" >{review.editedByOwner ? 'Bravo account review · edited by owner' : 'Verified Bravo account'}</Editable></Editable>)}</div></div>}
        <Editable as={Link} contentKey="copy-home-49" canEditText canEditLink className="cinema-link" href="/account#your-review">Share your experience <span aria-hidden="true">↗</span></Editable>
      </div></Editable>

      <Editable as="section" key="team" contentKey="copy-home-39" id="team" className="cinema-team" aria-labelledby="team-title"><div className="cinema-shell">
        <div className="cinema-section-heading" data-reveal=""><div><Editable as="p" contentKey="copy-home-40" canEditText className="cinema-eyebrow">MEET THE BRAVO TEAM</Editable><Editable as="h2" contentKey="cinema-team-title" canEditText id="team-title">The people<br/><span>behind the work.</span></Editable></div><Editable as="p" contentKey="copy-home-41" canEditText>Meet the trainers your dog will actually work with.</Editable></div>
        <div className="home-team-grid cinema-team-grid">{team.map(person => <Editable as="article" contentKey={`trainer-${['david','ashley','janet'].includes(person.profileKey) ? person.profileKey : 'other'}-card`} data-site-trainer={person.id} key={person.id || person.name} data-reveal=""><div className="cinema-portrait"><img src={person.image || `/images/${portraits[person.name] || 'bravo-logo-small'}.webp`} data-site-image-key={person.imageKey || `team-${(person.name === 'Ashley Leverock' ? 'Ashley Northrop' : person.name).toLowerCase().replaceAll(' ', '-')}`} width="1000" height="1400" loading="lazy" alt={`${person.name}, ${person.title}`}/></div><div className="home-person cinema-person"><p className="cinema-eyebrow">{person.title}</p><h3>{publicTrainerName(person.name)}</h3><p className="home-trainer-focus">{trainerIntroductions[person.name] ? <Editable as="span" contentKey={trainerIntroductions[person.name].focusKey} canEditText>{trainerIntroductions[person.name].focus}</Editable> : person.bio}</p><details className="cinema-details"><summary>Meet {person.name.split(' ')[0]} <span aria-hidden="true">+</span></summary><TrainerIntroduction person={person}/>{person.id && <><details className="home-availability"><summary>View {person.name.split(' ')[0]}’s working hours</summary><TrainerScheduleCard person={person} live={liveSchedules}/></details><Link className="cinema-link" href={`/portal?program=training&trainer=${encodeURIComponent(person.id)}`}>Request a visit with {person.name.split(' ')[0]} →</Link></>}</details></div></Editable>)}</div>
      </div></Editable>

      <Editable as="section" key="method" contentKey="copy-home-9" id="method" className="cinema-intro cinema-shell" aria-labelledby="method-title" data-reveal="">
        <Editable as="p" contentKey="copy-home-10" canEditText className="cinema-eyebrow">THE BRAVO APPROACH</Editable>
        <Editable as="h2" contentKey="cinema-method-title" canEditText id="method-title">Understand the dog.<br/><span>Build from there.</span></Editable>
        <Editable as="p" contentKey="cinema-method-copy" canEditText>A clear path from understanding your dog to practicing together in everyday life.</Editable>
        <div className="cinema-method-signature home-method-steps">
          <span className="home-method-step"><Editable as="strong" contentKey="copy-home-11" canEditText>Trust.</Editable><Editable as="span" contentKey="home-method-trust-copy" canEditText className="home-method-copy">Start with your dog’s personality, instincts, and everyday surroundings.</Editable></span>
          <span className="home-method-step"><Editable as="strong" contentKey="copy-home-12" canEditText>Train.</Editable><Editable as="span" contentKey="home-method-train-copy" canEditText className="home-method-copy">Practice clear, consistent communication together.</Editable></span>
          <span className="home-method-step"><Editable as="strong" contentKey="copy-home-13" canEditText>Deploy.</Editable><Editable as="span" contentKey="home-method-deploy-copy" canEditText className="home-method-copy">Bring that practice into real walks, public places, and daily routines.</Editable></span>
        </div>
        <Editable as="a" contentKey="home-method-action" canEditText canEditLink href="#training" className="cinema-link home-method-action">Explore training <span aria-hidden="true">→</span></Editable>
      </Editable>

      <Editable as="section" key="workshops" contentKey="copy-home-50" id="workshops" className="cinema-events" aria-labelledby="workshops-title"><div className="cinema-shell cinema-section-heading" data-reveal=""><div><Editable as="p" contentKey="copy-home-51" canEditText className="cinema-eyebrow">MORE WAYS TO LEARN</Editable><Editable as="h2" contentKey="cinema-workshops-title" canEditText id="workshops-title">Come. Learn.<br/><span>Go further.</span></Editable></div><Editable as="p" contentKey="copy-home-52" canEditText>Hands-on workshops and upcoming Bravo education.</Editable></div><div className="cinema-shell"><WorkshopDetails compact/></div></Editable>

      <Editable as="section" key="online" contentKey="copy-home-53" id="online" className="cinema-online" aria-labelledby="online-title"><div className="cinema-shell cinema-online-inner"><div data-reveal=""><Editable as="p" contentKey="copy-home-54" canEditText className="cinema-eyebrow">BRAVO. ANYWHERE.</Editable><Editable as="h2" contentKey="cinema-online-title" canEditText id="online-title">Learn from Bravo.<br/><span>Wherever you are.</span></Editable><Editable as="p" contentKey="cinema-online-copy" canEditText>Dog-training education from David and Ashley—what to do, why it matters, and how to practice it at home.</Editable>{lessonsOpen ? <Editable as={Link} contentKey="copy-home-55" canEditText canEditLink href="/learn" className="cinema-button cinema-button-light">Explore online lessons <span aria-hidden="true">↗</span></Editable> : <Editable as={Link} contentKey="copy-home-56" canEditText canEditLink href="/learn" className="cinema-button cinema-button-light">Online courses · Coming soon →</Editable>}</div><div className="cinema-learning-visual" data-reveal=""><div className="home-lesson-preview"><img src="/images/training-education.webp" width="1600" height="900" loading="lazy" alt="A handler demonstrating clear communication with a dog"/></div><div className="cinema-learning-caption"><img src="/images/bravo-logo-small.webp" width="42" height="48" alt="" data-site-image-ignore=""/><Editable as="span" contentKey="copy-home-57" canEditText>Learn.<br/><strong>Practice. Repeat.</strong></Editable></div></div></div>{lessonsOpen && <details className="cinema-shell cinema-details"><Editable as="summary" contentKey="copy-home-58" canEditText>Online lesson options</Editable><LessonOffers/></details>}</Editable>

      <ConversionFAQ key="faq"/>
      <Editable as="section" key="booking" contentKey="copy-home-59" className="cinema-close cinema-shell" aria-labelledby="booking-title" data-reveal=""><Editable as="p" contentKey="copy-home-60" canEditText className="cinema-eyebrow">READY WHEN YOU ARE.</Editable><Editable as="h2" contentKey="cinema-close-title" canEditText id="booking-title">Start with<br/><span>your dog.</span></Editable><Editable as="p" contentKey="copy-home-61" canEditText>Tell us what you’re seeing. We’ll help you choose the right first step.</Editable><div className="cinema-actions"><Editable as={Link} contentKey="copy-home-62" canEditText canEditLink href="/portal?program=training" className="cinema-button">Book training <span aria-hidden="true">↗</span></Editable><Editable as="a" contentKey="copy-home-63" canEditText canEditLink href="tel:+16058242767" className="cinema-link">Talk to Bravo</Editable></div><Editable as="span" contentKey="copy-home-64" canEditText className="cinema-close-location">ABERDEEN, SOUTH DAKOTA · WE COME TO YOU</Editable></Editable>
      </HomeSectionOrder>
    </Editable><Footer/>
  </div>;
}

