import Link from './Link';
import TrainerScheduleCard, { useLiveTrainerSchedules } from './TrainerScheduleCard';
import './trainer-schedules.css';
import { useEffect, useState } from 'react';
import { api } from './api';
import { Header, Footer } from './ui';
import ServiceIcon from './ServiceIcon';
import { useBravo } from './context';
import { SERVICES, money } from '../../shared/catalog';
import { HOME_HERO_SOURCE, HOME_HERO_ALT } from '../../shared/home-hero.js';
import { framingStyle } from '../../shared/site-images.js';
import { getSiteImages } from './site-image-state.js';
import ProofVideoCarousel from './ProofVideoCarousel';

const secondary = ['walking', 'aggression'];
const serviceDetails: Record<string, { label: string; text: string; features: string[] }> = {
  training: { label: 'BUILD A BETTER EVERYDAY', text: 'Calmer walks. Clearer boundaries. A dog you can depend on.', features: ['$200/month for one dog', '+$100/month each additional dog', 'Private training at your home'] },
  walking: { label: '30 MINUTES. REAL MOVEMENT.', text: 'Reliable dog walking from the Bravo team, scheduled around your day.', features: ['$25 per dog', '30-minute walk', 'Simple multi-dog pricing'] },
  aggression: { label: 'START WITH UNDERSTANDING', text: 'A focused first step for dogs who need a more considered approach.', features: ['Initial assessment with two trainers', 'Behavior and handling review', 'Discuss the next steps with Bravo'] },
  online: { label: 'TRAIN BETWEEN SESSIONS', text: 'Private member lessons from the Bravo team, available when you need them.', features: ['Trainer-uploaded video lessons', 'Captions and written transcripts', 'Learn at your own pace'] },
};
export default function Home() {
  const [hero] = useState(() => getSiteImages()['home-hero']);
  const { config } = useBravo();
  const liveSchedules = useLiveTrainerSchedules();
  const catalog = config?.services?.length ? config.services : SERVICES;
  const training = catalog.find(service => service.id === 'training');
  const [team, setTeam] = useState<Array<{id: string; name: string; role: string; title: string; bio: string}>>([]);
  const [reviews, setReviews] = useState<{reviews: Array<{_id: string; authorName: string; rating: number; body: string}>; average: number; count: number}>({ reviews: [], average: 0, count: 0 });
  useEffect(() => { api('/team').then(people => setTeam(people.team)).catch(() => {}); api('/reviews').then(feedback => setReviews(feedback)).catch(() => {}); }, []);
  const portraits: Record<string, string> = { 'David Northrop': 'david-northrop', 'Ashley Northrop': 'ashley-northrop', 'Ashley Leverock': 'ashley-leverock', 'Janet Hughes': 'janet-hughes' };
  return <div className="bravo-home"><Header/>
    <main id="main-content" tabIndex={-1}>
      <section className="home-hero" aria-labelledby="home-title">
        <img className="home-hero-image" src={hero?.src || HOME_HERO_SOURCE} width="1774" height="887" loading="eager" fetchPriority="high" alt={hero?.framed ? hero.alt : HOME_HERO_ALT} style={hero?.framed ? framingStyle(hero) : undefined} data-site-image-original={HOME_HERO_SOURCE} data-site-image-original-alt={HOME_HERO_ALT} data-site-media-original-styles='{"objectFit":"","objectPosition":"","transform":"","transformOrigin":"","clipPath":""}'/>
        <div className="home-hero-shade"/>
        <div className="shell home-hero-inner"><div className="home-hero-copy">
          <p className="eyebrow">ABERDEEN, SOUTH DAKOTA <span> / </span> MOBILE DOG TRAINING</p>
          <h1 id="home-title">Real-life<br/><em>dog training.</em></h1>
          <p className="home-intro">Private mobile dog training in Aberdeen, South Dakota. We come to you with practical support for a calmer everyday life with your dog.</p>
          <div className="home-hero-actions"><Link className="button" href="/portal?program=training">Start private training <span aria-hidden="true">→</span></Link><a className="button button-ghost" href="#reviews">See client results</a></div>
          <div className="hero-service-note"><span>PRIVATE SESSIONS</span><span>WE COME TO YOU</span><span>PROFESSIONAL TRAINERS</span></div>
        </div><div className="hero-field-note"><span>THE BRAVO STANDARD</span><p>Trust.<br/>Train.<br/><em>Deploy.</em></p></div></div>
      </section>
      <div className="home-service-strip"><div className="shell"><p><strong>A professional on your team.</strong><span>Private sessions. Clear communication. Practical structure.</span></p><a href="tel:+16058242767">Talk to Bravo <span>(605) 824-2767</span></a></div></div>
      <div className="shell site-media-tools-slot site-media-tools-slot--home" data-site-media-tools=""/>
      <section className="home-section shell home-proof" id="reviews" aria-labelledby="reviews-title">
        <div className="home-section-heading"><div><p className="eyebrow">01 / PROOF BEFORE PROMISES</p><h2 id="reviews-title">Real clients.<br/><em>Real progress.</em></h2></div><p>{reviews.count ? <><strong>{reviews.average} out of 5</strong> from {reviews.count} verified Bravo account {reviews.count === 1 ? 'review' : 'reviews'}.</> : 'Verified feedback will appear here as Bravo clients choose to share it.'}</p></div>
        <div className="home-proof-grid" aria-label="Why clients choose Bravo"><article><strong>PRIVATE</strong><span>One trainer, one household, and a plan built around your dog.</span></article><article><strong>FULL-TIME</strong><span>Professional Bravo trainers serving clients in and around Aberdeen.</span></article><article><strong>MOBILE</strong><span>Training where everyday behavior actually happens—we come to you.</span></article><article><strong>ACCOUNT VERIFIED</strong><span>Published reviews are tied to real Bravo client accounts.</span></article></div>
        <ProofVideoCarousel/>
        {reviews.reviews.length > 0 && <div className="review-grid home-proof-reviews">{reviews.reviews.slice(0, 3).map(review => <article key={review._id} className="panel"><div className="review-stars" role="img" aria-label={`${review.rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div><p>“{review.body}”</p><strong>{review.authorName}</strong><small>Verified Bravo account</small></article>)}</div>}
        {team.length > 0 && <div className="home-proof-team"><p className="eyebrow">THE PROFESSIONALS BEHIND THE WORK</p><div>{team.slice(0, 3).map(person => <span key={person.id}><strong>{person.name}</strong><small>{person.title}</small></span>)}</div></div>}
        <div className="home-proof-links"><a className="inline-link" href="#team">Meet the trainers →</a><Link className="inline-link" href="/account#your-review">Share your experience →</Link></div>
      </section>
      <section className="home-section shell" id="training" aria-labelledby="program-title">
        <div className="home-section-heading"><div><p className="eyebrow">02 / START HERE</p><h2 id="program-title">Private training.<br/><em>One clear first step.</em></h2></div><p>Most families should begin with Bravo’s core training program. Your trainer can identify the right focus after learning about your dog and your goals.</p></div>
        {training && training.enabled !== false && <article className="home-training-offer"><div className="home-training-main"><ServiceIcon service="training"/><p className="eyebrow">{serviceDetails.training.label}</p><h3>{training.name}</h3><p>{serviceDetails.training.text}</p><div className="home-price">{money(training.cents)}<span>/ month for one dog</span></div><ul>{serviceDetails.training.features.map(feature => <li key={feature}>{feature}</li>)}</ul><div className="home-training-actions"><Link className="button" href="/portal?program=training">Start with private training <span aria-hidden="true">→</span></Link><Link className="home-text-link" href="/dog-training">See how training works <span aria-hidden="true">↗</span></Link></div></div><aside aria-label="Who private training is for"><p className="eyebrow">A STRONG START FOR</p><ul><li>Puppy foundations and everyday obedience</li><li>Leash behavior, boundaries, and calm decisions</li><li>Owners who want private, practical instruction</li></ul><p>No card is charged when you save a request. Bravo reviews and confirms every visit.</p></aside></article>}
        <div className="home-secondary-heading"><div><p className="eyebrow">NEED A DIFFERENT START?</p><h3>Choose the situation that fits.</h3></div><p>These services stay available without competing with the main training path.</p></div>
        <div className="home-secondary-services">{secondary.map(id => { const service = catalog.find(s => s.id === id); const detail = serviceDetails[id]; return service && service.enabled !== false ? <article key={id}><ServiceIcon service={id}/><div><p className="eyebrow">{detail.label}</p><h3>{service.name}</h3><p>{detail.text}</p></div><div className="home-secondary-action"><strong>{money(service.cents)} <small>{service.interval === 'walk' ? '/ dog' : 'initial intake'}</small></strong><Link className="home-text-link" href={id === 'walking' ? '/dog-walking' : '/behavior-assessment'}>Explore <span aria-hidden="true">↗</span></Link></div></article> : null; })}</div>
      </section>
      <section className="home-method shell" id="method" aria-labelledby="method-title"><div className="home-method-photo"><img src="/images/obedience-real-world.webp" width="1200" height="800" loading="lazy" alt="Trainer and dog owner working together outdoors"/><span>TRAIN FOR THE LIFE YOU ACTUALLY LIVE.</span></div><div className="home-method-copy"><p className="eyebrow">03 / THE BRAVO METHOD</p><h2 id="method-title">Clear structure.<br/><em>Lasting trust.</em></h2><p>We work where life happens. No treats, no toys, and no crowded classes. Just professional handling and a clearer relationship with your dog.</p><ol className="home-process"><li><span>01</span><div><h3>Meet the dog.</h3><p>We come to you, learn the full picture, and see your dog in its own environment.</p></div></li><li><span>02</span><div><h3>Build the plan.</h3><p>Your trainer shapes the work around your dog, your routines, and your goals.</p></div></li><li><span>03</span><div><h3>Make it hold.</h3><p>Bring that structure into walks, doorways, distractions, and everyday decisions.</p></div></li></ol></div></section>
      <section className="home-section shell" aria-labelledby="specialties-title"><div className="home-section-heading"><div><p className="eyebrow">PURPOSE BEYOND OBEDIENCE</p><h2 id="specialties-title">Different work.<br/><em>The same standard.</em></h2></div><Link className="home-text-link" href="/contact">Discuss a specialist program <span aria-hidden="true">↗</span></Link></div><div className="home-specialties">{[
        ['Job-specific training', 'Focused foundations shaped around a defined working goal.'],
        ['Service dog foundations', 'Public-access manners, task foundations, and handler confidence.'],
        ['Protection & working K9s', 'Control, sound nerves, clear outs, and responsible handling.'],
        ['Tracking & search', 'Scent foundations, accuracy, and a stronger handler partnership.'],
      ].map(([title, copy], index) => <article key={title}><span className="eyebrow">0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="home-team-section" id="team"><div className="shell"><div className="home-section-heading"><div><p className="eyebrow">04 / YOUR BRAVO TEAM</p><h2>People behind<br/><em>the progress.</em></h2></div><p>Meet the full-time professionals doing the work, then check their public working schedules below.</p></div><div className="home-team-grid">{team.map(person => <article key={person.id}><div className="home-portrait"><img src={`/images/${portraits[person.name] || 'bravo-logo-small'}.webp`} width="1000" height="1400" loading="lazy" alt={`${person.name}, ${person.role}`}/></div><div className="home-person"><p className="eyebrow">{person.role === "owner" ? "OWNER" : "STAFF"}</p><h3>{person.name}</h3><p>{person.title}</p><p>{person.bio}</p><TrainerScheduleCard person={person} live={liveSchedules}/><Link className="inline-link" href="/contact">Contact trainer →</Link></div></article>)}</div></div></section>
      <section className="home-section shell home-learning"><div><p className="eyebrow">KEEP LEARNING WITH BRAVO</p><h2>The work behind<br/><em>the progress.</em></h2><p>Members can learn from staff-published video lessons with captions and readable transcripts—at home and at their own pace.</p><div className="home-learning-price"><strong>{money(catalog.find(service => service.id === 'online')?.cents ?? 5000)} <span>/ month online</span></strong><span>A focused library built by your trainers.</span></div><Link className="button button-ghost" href="/learn">Explore the lesson catalog <span aria-hidden="true">↗</span></Link></div><Link className="home-lesson-preview" href="/learn"><img src="/images/training-education.webp" width="1600" height="900" loading="lazy" alt="Handler demonstrating a lesson with a Belgian Malinois"/><div><span className="badge">MEMBER LEARNING</span><h3>Leash pressure:<br/>timing over force.</h3><span className="home-text-link">Explore training topics <span aria-hidden="true">↗</span></span></div></Link></section>
      <section className="home-close"><div className="shell"><div><p className="eyebrow">THE FIRST STEP IS SIMPLE.</p><h2>Let’s meet<br/><em>your dog.</em></h2></div><div><p>Choose a program, find an opening, and let Bravo know what you need.</p><Link className="button" href="/portal">Request your first visit <span aria-hidden="true">↗</span></Link><a href="tel:+16058242767">Prefer to talk? (605) 824-2767</a></div></div></section>
    </main><Footer/>
  </div>;
}
