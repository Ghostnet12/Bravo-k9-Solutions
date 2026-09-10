import Link from './Link';
import { Header, Footer } from './ui';
import { SERVICES, money } from '../../shared/catalog';

const primary = ['training', 'aggression', 'online'];
const serviceDetails: Record<string, { label: string; text: string; features: string[] }> = {
  training: { label: 'BUILD A BETTER EVERYDAY', text: 'Calmer walks. Clearer boundaries. A dog you can depend on.', features: ['Private professional training', 'Your home. Your real environment.', 'A plan around your dog'] },
  aggression: { label: 'START WITH UNDERSTANDING', text: 'A focused first step for dogs who need a more considered approach.', features: ['Initial assessment with two trainers', 'Behavior and handling review', 'Discuss the next steps with Bravo'] },
  online: { label: 'TRAIN BETWEEN SESSIONS', text: 'Private member lessons from the Bravo team, available when you need them.', features: ['Trainer-uploaded video lessons', 'Captions and written transcripts', 'Learn at your own pace'] },
};
const team = [
  { name: 'David Northrop', role: 'Founder & Lead Trainer', image: 'david-northrop', detail: 'Behavior · Working K9s · Service work' },
  { name: 'Ashley Leverock', role: 'Pitbull Specialist & Trainer', image: 'ashley-leverock', detail: 'Obedience · Behavior · Handler coaching' },
  { name: 'Janet Hughes', role: 'Dog Trainer', image: 'janet-hughes', detail: 'Foundations · Structure · Owner support' },
];
export default function Home() {
  return <div className="bravo-home"><Header/>
    <main id="main-content" tabIndex={-1}>
      <section className="home-hero" aria-labelledby="home-title">
        <img className="home-hero-image" src="/images/hero-bravo-k9.webp" width="1782" height="883" fetchPriority="high" alt="Handler and Belgian Malinois in a prairie training field"/>
        <div className="home-hero-shade"/>
        <div className="shell home-hero-inner"><div className="home-hero-copy">
          <p className="eyebrow">ABERDEEN, SOUTH DAKOTA <span> / </span> MOBILE DOG TRAINING</p>
          <h1 id="home-title">Good dogs.<br/>Real work.<br/><em>Everyday life.</em></h1>
          <p className="home-intro">Training that holds up in the real world. Professional, psychology-based guidance—at your home, with your dog.</p>
          <div className="home-hero-actions"><Link className="button" href="/portal">Find your program <span aria-hidden="true">↗</span></Link><a className="home-text-link" href="#method">Meet the Bravo method</a></div>
          <div className="hero-service-note"><span>PRIVATE TRAINING</span><span>WE COME TO YOU</span><span>NO GROUP CLASSES</span></div>
        </div><div className="hero-field-note"><span>THE BRAVO STANDARD</span><p>Trust.<br/>Train.<br/><em>Deploy.</em></p></div></div>
      </section>
      <div className="home-service-strip"><div className="shell"><p><strong>A professional on your team.</strong><span>Private sessions. Clear communication. Practical structure.</span></p><a href="tel:+16058242767">Talk to Bravo <span>(605) 824-2767</span></a></div></div>
      <section className="home-section shell" id="training" aria-labelledby="program-title">
        <div className="home-section-heading"><div><p className="eyebrow">01 / FIND YOUR FIT</p><h2 id="program-title">Your dog.<br/><em>Your way forward.</em></h2></div><p>Choose the support you need. Review real availability before sending your request.</p></div>
        <div className="home-pricing-grid">{primary.map(id => { const service = SERVICES.find(s => s.id === id)!; const detail = serviceDetails[id]; return <article className={`home-price-card ${id === 'training' ? 'featured' : ''}`} key={id}>
          <p className="eyebrow">{detail.label}</p><h3>{service.name}</h3><p className="service-description">{detail.text}</p>
          <div className="home-price">{money(service.cents)}<span>{service.interval === 'month' ? '/ month' : 'initial intake'}</span></div>
          <ul>{detail.features.map(feature => <li key={feature}>{feature}</li>)}</ul><Link className={`button ${id === 'training' ? '' : 'button-ghost'}`} href={id === 'online' ? '/learn' : `/portal?program=${id}`}>{id === 'online' ? 'Explore online lessons' : id === 'aggression' ? 'Request an assessment' : 'Choose training'}<span aria-hidden="true">↗</span></Link>
        </article>; })}</div>
        <p className="home-price-note">Saving a request does not charge your card. Visits are subject to availability and Bravo’s confirmation.</p>
      </section>
      <section className="home-method shell" id="method" aria-labelledby="method-title"><div className="home-method-photo"><img src="/images/obedience-real-world.webp" width="1200" height="800" loading="lazy" alt="Trainer and dog owner working together outdoors"/><span>TRAIN FOR THE LIFE YOU ACTUALLY LIVE.</span></div><div className="home-method-copy"><p className="eyebrow">02 / THE BRAVO METHOD</p><h2 id="method-title">Clear structure.<br/><em>Lasting trust.</em></h2><p>We work where life happens. No treats, no toys, and no crowded classes. Just professional handling and a clearer relationship with your dog.</p><ol className="home-process"><li><span>01</span><div><h3>Meet the dog.</h3><p>We come to you, learn the full picture, and see your dog in its own environment.</p></div></li><li><span>02</span><div><h3>Build the plan.</h3><p>Your trainer shapes the work around your dog, your routines, and your goals.</p></div></li><li><span>03</span><div><h3>Make it hold.</h3><p>Bring that structure into walks, doorways, distractions, and everyday decisions.</p></div></li></ol></div></section>
      <section className="home-section shell" aria-labelledby="specialties-title"><div className="home-section-heading"><div><p className="eyebrow">PURPOSE BEYOND OBEDIENCE</p><h2 id="specialties-title">Different work.<br/><em>The same standard.</em></h2></div><Link className="home-text-link" href="/contact">Discuss a specialist program <span aria-hidden="true">↗</span></Link></div><div className="home-specialties">{[
        ['Obedience & behavior', 'Calm choices, dependable boundaries, and clearer communication.'],
        ['Service dog foundations', 'Public-access manners, task foundations, and handler confidence.'],
        ['Protection & working K9s', 'Control, sound nerves, clear outs, and responsible handling.'],
        ['Tracking & search', 'Scent foundations, accuracy, and a stronger handler partnership.'],
      ].map(([title, copy], index) => <article key={title}><span className="eyebrow">0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="home-team-section" id="team"><div className="shell"><div className="home-section-heading"><div><p className="eyebrow">03 / YOUR BRAVO TEAM</p><h2>People behind<br/><em>the progress.</em></h2></div><p>Professional trainers who care about the work—and what happens after the session ends.</p></div><div className="home-team-grid">{team.map(person => <article key={person.name}><div className="home-portrait"><img src={`/images/${person.image}.webp`} width="1000" height="1400" loading="lazy" alt={`${person.name}, ${person.role}`}/></div><div className="home-person"><p className="eyebrow">{person.role}</p><h3>{person.name}</h3><p>{person.detail}</p></div></article>)}</div></div></section>
      <section className="home-section shell home-learning"><div><p className="eyebrow">KEEP LEARNING WITH BRAVO</p><h2>The work behind<br/><em>the progress.</em></h2><p>Members can learn from staff-published video lessons with captions and readable transcripts—at home and at their own pace.</p><div className="home-learning-price"><strong>$50 <span>/ month online</span></strong><span>A focused library built by your trainers.</span></div><Link className="button button-ghost" href="/learn">Explore the lesson catalog <span aria-hidden="true">↗</span></Link></div><Link className="home-lesson-preview" href="/learn"><img src="/images/training-education.webp" width="1600" height="900" loading="lazy" alt="Handler demonstrating a lesson with a Belgian Malinois"/><div><span className="badge">MEMBER LEARNING</span><h3>Leash pressure:<br/>timing over force.</h3><span className="home-text-link">Explore training topics <span aria-hidden="true">↗</span></span></div></Link></section>
      <section className="home-close"><div className="shell"><div><p className="eyebrow">THE FIRST STEP IS SIMPLE.</p><h2>Let’s meet<br/><em>your dog.</em></h2></div><div><p>Choose a program, find an opening, and let Bravo know what you need.</p><Link className="button" href="/portal">Request your first visit <span aria-hidden="true">↗</span></Link><a href="tel:+16058242767">Prefer to talk? (605) 824-2767</a></div></div></section>
    </main><Footer/>
  </div>;
}
