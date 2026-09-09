/* eslint-disable @next/next/no-img-element -- direct static image delivery is required by the Sites host */
import Link from "./Link";
import BrandLockup from "./Brand";

const programs = [
  { eyebrow: "01 / Everyday control", title: "Obedience & behavior", copy: "Clear communication, dependable boundaries, and calm decisions that hold up at home and out in the world.", meta: "Mobile • Private • Real-world", image: "/images/obedience-real-world.webp", alt: "Trainer coaching a dog owner during a real-world obedience session" },
  { eyebrow: "02 / Purpose-built", title: "Service dog foundations", copy: "Public-access manners, task foundations, and handler confidence developed with care and practical structure.", meta: "Focus • Neutrality • Reliability", image: "/images/service-dog-training.webp", alt: "Service dog foundations training in a public environment" },
  { eyebrow: "03 / Advanced work", title: "Protection & working K9s", copy: "Disciplined development for capable dogs—built around control, sound nerves, clear outs, and responsible handling.", meta: "Control • Confidence • Purpose", image: "/images/protection-training.webp", alt: "Controlled working K9 protection training" },
  { eyebrow: "04 / Nose to ground", title: "Tracking & search", copy: "Purposeful scent work that develops drive, accuracy, environmental confidence, and a stronger handler partnership.", meta: "Scent • Search • Teamwork", image: "/images/tracking-training.webp", alt: "Working dog following a scent track through prairie grass" },
];

const process = [
  ["01", "We meet the dog", "We come to you, learn the full picture, and watch how the dog behaves in its real environment."],
  ["02", "We build the structure", "A professional trainer creates a clear plan around the dog, the handler, and the outcome—not a generic class."],
  ["03", "We make it hold", "Training moves into real life so obedience stays useful when the street, doorway, stranger, or distraction changes."],
];

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1}>
      <header className="site-header">
        <BrandLockup />
        <nav className="desktop-nav" aria-label="Primary navigation"><a href="#training">Training</a><a href="#method">Our method</a><a href="#team">Team</a><Link href="/learn">Online training</Link><Link href="/community">Bravo Room</Link></nav>
        <div className="header-actions"><Link className="text-link login-link" href="/account">Client login</Link><Link className="button button-small" href="/portal">Book training <span>↗</span></Link></div>
        <details className="mobile-menu"><summary aria-label="Open menu"><span></span><span></span></summary><div><a href="#training">Training</a><a href="#method">Our method</a><a href="#team">Team</a><Link href="/learn">Online training • $50/mo</Link><Link href="/community">Bravo Room</Link><Link href="/portal">Book training</Link></div></details>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <img className="hero-image" src="/images/hero-bravo-k9.webp" width="1782" height="883" fetchPriority="high" decoding="async" alt="Professional handler working a Belgian Malinois in a prairie training field" />
        <div className="hero-shade" />
        <div className="hero-content shell">
          <p className="kicker"><span /> Aberdeen, South Dakota • Mobile training</p>
          <h1 id="hero-title">Training that<br /><em>holds up</em> in<br />the real world.</h1>
          <p className="hero-copy">Professional, psychology-based dog training built around structure, clear communication, and results you can live with.</p>
          <div className="button-row"><Link className="button" href="/portal">Schedule training <span>↗</span></Link><a className="button button-ghost" href="#training">Explore programs <span>↓</span></a></div>
        </div>
        <div className="hero-proof"><div><strong>No treats.</strong><span>No toys. Clear communication.</span></div><div><strong>Private training.</strong><span>Built around your dog.</span></div><div><strong>We come to you.</strong><span>Aberdeen & surrounding areas.</span></div></div>
      </section>

      <section className="trust-strip" aria-label="Bravo K9 highlights"><span>PROFESSIONAL TRAINERS</span><i>•</i><span>REAL-WORLD OBEDIENCE</span><i>•</i><span>BODY-CAM TRANSPARENCY</span><i>•</i><span>MOBILE SERVICE</span></section>

      <section className="section shell" id="training" aria-labelledby="training-title">
        <div className="section-heading split-heading"><div><p className="kicker gold"><span /> Training programs</p><h2 id="training-title">One standard.<br />Different missions.</h2></div><p>From a calmer home to advanced working-dog performance, every plan starts with the dog in front of us—not a one-size-fits-all script.</p></div>
        <div className="program-grid">{programs.map((program) => <article className="program-card" key={program.title}><div className="program-image"><img src={program.image} width="1200" height="800" loading="lazy" decoding="async" alt={program.alt} /></div><div className="program-card-copy"><p className="program-eyebrow">{program.eyebrow}</p><h3>{program.title}</h3><p>{program.copy}</p><Link className="program-meta" href="/portal"><span>{program.meta}</span><b aria-hidden="true">↗</b><span className="sr-only">Schedule {program.title}</span></Link></div></article>)}</div>
      </section>

      <section className="care-feature shell-wide" aria-labelledby="care-title">
        <div className="care-feature-image"><img src="/images/dog-sitting-care.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="Professional dog sitter caring for a small dog and a golden retriever in their home" /></div>
        <div className="care-feature-copy"><p className="kicker gold"><span /> Dog sitting • $20 per day</p><h2 id="care-title">Familiar home.<br />Dependable care.</h2><p>Choose several care days, set a different time for each visit, or let the scheduler find open times between your departure and return.</p><ul><li>Care in your dog’s own environment</li><li>Clear daily pricing before checkout</li><li>Editable auto-scheduled visits</li></ul><Link className="button" href="/portal/dog-sitting">Schedule dog sitting <span>↗</span></Link></div>
      </section>

      <section className="image-story shell-wide">
        <div className="story-image"><img src="/images/service-dog-training.webp" width="1200" height="676" loading="lazy" decoding="async" alt="Trainer and client working with a service dog in public" /><span className="image-label">SERVICE DOG FOUNDATIONS</span></div>
        <div className="story-copy"><p className="kicker gold"><span /> More than commands</p><h2>Calm is a skill.<br />So is trust.</h2><p>Good training changes what happens between the commands. We teach the dog how to make better choices—and teach the handler how to create a clear, dependable relationship.</p><ul><li><span>01</span>Clear structure without gimmicks</li><li><span>02</span>Private coaching in real environments</li><li><span>03</span>Professional handling from the first session</li></ul><Link className="text-link gold-link" href="/portal">Find the right program <span>↗</span></Link></div>
      </section>

      <section className="section method-section" id="method" aria-labelledby="method-title"><div className="shell"><div className="section-heading centered"><p className="kicker gold"><span /> The Bravo method</p><h2 id="method-title">Simple process.<br /><em>Serious</em> follow-through.</h2></div><div className="process-grid">{process.map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></div></section>

      <section className="protection-feature shell-wide"><img src="/images/protection-training.webp" width="1200" height="800" loading="lazy" decoding="async" alt="Controlled professional bite-sleeve training with a Belgian Malinois" /><div className="protection-overlay" /><div className="protection-copy"><p className="kicker"><span /> Control before intensity</p><h2>Drive is power.<br />Control is the standard.</h2><p>Protection work is never about chaos. It is confidence, clarity, obedience, and a dog that can switch on—and come back under control.</p><Link className="button" href="/portal">Talk to a trainer <span>↗</span></Link></div></section>

      <section className="section shell team-section" id="team" aria-labelledby="team-title">
        <div className="section-heading split-heading team-heading"><div><p className="kicker gold"><span /> Meet the trainers</p><h2 id="team-title">Experience you can<br />see in the dog.</h2></div><p>Bravo is built by people who care about the work, the mission, and what happens after the trainer leaves.</p></div>
        <div className="trainer-grid">
          <article className="trainer-profile">
            <div className="trainer-portrait"><img src="/images/david-northrop.webp" width="1254" height="1568" loading="lazy" decoding="async" alt="David Northrop, founder and lead trainer at Bravo K9 Solutions" /></div>
            <div className="trainer-profile-copy"><span>01 / FOUNDER</span><h3>David Northrop</h3><p>Founder & Lead Trainer</p><small>Behavior • Working K9s • Service work</small></div>
          </article>
          <article className="trainer-profile">
            <div className="trainer-portrait"><img src="/images/ashley-leverock.webp" width="1003" height="1568" loading="lazy" decoding="async" alt="Ashley Leverock, pitbull specialist and dog trainer at Bravo K9 Solutions" /></div>
            <div className="trainer-profile-copy"><span>02 / SPECIALIST</span><h3>Ashley Leverock</h3><p>Pitbull Specialist & Trainer</p><small>Obedience • Behavior • Handler coaching</small></div>
          </article>
          <article className="trainer-profile">
            <div className="trainer-portrait"><img src="/images/janet-hughes.webp" width="1122" height="1402" loading="lazy" decoding="async" alt="Janet Hughes, dog trainer at Bravo K9 Solutions" /></div>
            <div className="trainer-profile-copy"><span>03 / TRAINER</span><h3>Janet Hughes</h3><p>Dog Trainer</p><small>Foundations • Structure • Owner support</small></div>
          </article>
        </div>
      </section>

      <section className="tracking-section shell-wide"><img src="/images/tracking-training.webp" width="1400" height="779" loading="lazy" decoding="async" alt="Working dog following a scent trail through prairie grass" /><div><p className="kicker"><span /> Tracking & search</p><h2>The nose knows.<br />We teach the team.</h2><p>From scent foundations to purposeful tracks, we develop the dog’s natural ability and the handler’s ability to read the work.</p></div></section>

      <section className="learn-teaser"><div className="shell learn-grid"><div><p className="kicker gold"><span /> Online training • $50 per month</p><h2>Learn the work<br />behind the work.</h2><p>Member-only lessons on everyday handling, safe tool use, structure, timing, and the small details that change a dog. The public can browse the catalog; active members unlock the videos.</p><Link className="button" href="/learn">See the program <span>↗</span></Link></div><div className="video-panel" aria-label="Online training membership preview"><div className="video-screen"><div className="play-button locked">LOCKED</div><span>MEMBER LESSON 01</span><strong>Leash pressure:<br />timing over force</strong><b className="video-price">$50 <small>/ MONTH</small></b></div><div className="video-meta"><span>06:42</span><span>FOUNDATIONS</span><span>MEMBERS ONLY</span></div></div></div></section>

      <section className="booking-cta shell-wide"><div><p className="kicker"><span /> Ready when you are</p><h2>See real availability.<br />Choose your time.<br /><em>Start the work.</em></h2><p>Open the client scheduling experience, select a program, and see which appointment times are still available.</p><Link className="button button-light" href="/portal">Open the scheduler <span>↗</span></Link></div><div className="booking-callout"><span>BRAVO SCHEDULING</span><strong>9 AM–9 PM</strong><p>Aberdeen local time. Choose dates and view Bravo’s current openings in the scheduler.</p><Link className="button button-light" href="/portal">Find a time ↗</Link></div></section>

      <footer><div className="shell footer-grid"><div><BrandLockup className="footer-mark" /><p>Professional mobile dog training<br />in Aberdeen, South Dakota.</p></div><div><small>EXPLORE</small><a href="#training">Training</a><a href="#method">Our method</a><Link href="/learn">Online training • $50/mo</Link><Link href="/community">Bravo Room</Link></div><div><small>CLIENTS</small><Link href="/account">Account login</Link><Link href="/portal">Schedule training</Link><Link href="/media-rights">Photo & media rights</Link><a href="tel:+16058242767">(605) 824-2767</a></div><div><small>OUR STANDARD</small><p className="footer-tagline">TRUST.<br />TRAIN.<br /><em>DEPLOY.</em></p></div></div><div className="shell footer-bottom"><span>© 2026 Bravo K9 Solutions, LLC</span><span>Aberdeen, SD • We come to you</span></div></footer>
    </main>
  );
}
