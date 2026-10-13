import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, Footer } from './ui';
import { FCI_HOME, cleanFCIItems } from '../../shared/fci';
import './fci-support.css';
const resources = [
  { icon: '◎', title: 'Breed standards', detail: 'Understand breed heritage, purpose and internationally published standards.', href: 'https://www.fci.be/en/Nomenclature/' },
  { icon: '◇', title: 'Responsible breeding', detail: 'Explore responsible breeding practices and the preservation of distinct breeds.', href: 'https://www.fci.be/en/Breeding-42.html' },
  { icon: '♡', title: 'Health & welfare', detail: 'Put canine health, well-being and quality of life at the heart of the conversation.', href: 'https://www.fci.be/en/Welfare-well-being-and-protection-for-pedigree-dogs-worldwide-1291.html' },
  { icon: '✧', title: 'Canine education', detail: 'Discover international knowledge for breeders, handlers and dog enthusiasts.', href: 'https://www.fci.be/en/Commission-for-Education-Public-Relations-6875.html' },
];
const dateLabel = date => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date));
export default function FCISupportPage() {
  const [feed, setFeed] = useState({ items: [] });
  const rail = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/fci-updates', { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        const items = cleanFCIItems(data.items);
        if (!controller.signal.aborted) setFeed(previous => ({ ...data, items: items.length ? items : previous.items }));
      } catch { /* Keep the last visible verified links during a connection loss. */ }
    };
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 300000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  function move(direction) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.current?.scrollBy({ left: direction * rail.current.clientWidth, behavior: reduced ? 'instant' : 'smooth' });
  }
  const lastSuccess = feed.lastSuccessAt && !Number.isNaN(Date.parse(feed.lastSuccessAt)) ? dateLabel(feed.lastSuccessAt) : null;
  return <><Header/><main id="main-content" tabIndex={-1} className="fci-page">
    <section className="fci-hero" aria-labelledby="fci-heading">
      <div className="fci-hero-inner">
        <Link to="/" className="fci-back">← Back to Bravo</Link>
        <img className="fci-identity" src="/images/fci-official-identity.jpeg" alt="FCI — Fédération Cynologique Internationale. For pedigree dogs worldwide." width="796" height="240"/>
        <p className="fci-kicker">BRAVO K9 SOLUTIONS · FCI SUPPORT</p>
        <h1 id="fci-heading">GLOBAL STANDARDS.<br/><em>STRONGER DOGS.</em></h1>
        <p className="fci-hero-copy">Breed heritage. Canine welfare. A world of knowledge.<br/>A stronger future begins with understanding the dog.</p>
        <a className="fci-button" href={FCI_HOME} target="_blank" rel="noopener noreferrer">VISIT FCI.BE <span aria-hidden="true">↗</span></a>
      </div>
      <div className="fci-hero-note">INTERNATIONAL KNOWLEDGE.<br/><strong>REAL-WORLD PURPOSE.</strong></div>
    </section>
    <div className="fci-body">
      <section className="fci-intro" aria-labelledby="fci-support-heading">
        <img src="/images/bravo-fci-logo.jpeg" alt="Bravo K9 Solutions" width="1024" height="1024" loading="lazy"/>
        <div><p className="fci-kicker">TRUST. TRAIN. DEPLOY.</p><h2 id="fci-support-heading">BETTER UNDERSTANDING.<br/><em>A STRONGER FUTURE.</em></h2><p>Bravo supports responsible breeding, breed preservation, canine health and international canine education. These official FCI resources help you explore the standards and knowledge behind dogs worldwide.</p><p className="fci-independence">An independent Bravo initiative. No FCI membership, accreditation, certification or endorsement is implied.</p></div>
      </section>
      <section className="fci-cards" aria-label="Explore official FCI resources">{resources.map(item => <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer"><span className="fci-card-icon" aria-hidden="true">{item.icon}</span><h3>{item.title}</h3><p>{item.detail}</p><span className="fci-resource-action">EXPLORE FCI <span aria-hidden="true">↗</span></span></a>)}</section>
      <section className="fci-news" aria-labelledby="fci-news-heading">
        <div className="fci-news-heading"><div><p className="fci-kicker">FROM THE OFFICIAL SOURCE</p><h2 id="fci-news-heading">LATEST FROM FCI</h2></div><div className="fci-rail-controls"><button type="button" aria-label="Previous FCI announcements" onClick={() => move(-1)}>←</button><button type="button" aria-label="Next FCI announcements" onClick={() => move(1)}>→</button></div></div>
        <p className="fci-news-description">Official announcements, linked directly to FCI. {lastSuccess ? `Last successful check: ${lastSuccess}. ${feed.stale ? 'Showing saved updates while the source is unavailable.' : 'Checked daily.'}` : 'Visit FCI for the latest published updates.'}</p>
        <div ref={rail} className="fci-news-rail" tabIndex={0} role="region" aria-label="FCI announcements — swipe or use arrow controls">{feed.items.length ? feed.items.map((item, index) => <a className="fci-news-card" key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"><span className="fci-news-art" aria-hidden="true"><span>FCI</span><small>OFFICIAL ANNOUNCEMENT</small><b>{String(index + 1).padStart(2, '0')}</b></span><div>{item.date && <time dateTime={item.date}>{dateLabel(item.date)}</time>}<h3>{item.title}</h3><span className="fci-resource-action">READ ON FCI.BE ↗</span></div></a>) : <a className="fci-news-fallback" href={FCI_HOME} target="_blank" rel="noopener noreferrer"><span className="fci-kicker">THE SOURCE, ALWAYS WITHIN REACH</span><h3>Explore the latest official announcements</h3><p>News, events and notices from the Fédération Cynologique Internationale.</p><span className="fci-resource-action">VISIT FCI.BE ↗</span></a>}</div>
      </section>
      <div className="fci-signoff"><span>International standards. Real-world results.</span><Link to="/dog-training">EXPLORE BRAVO TRAINING →</Link></div>
    </div>
  </main><Footer/></>;
}
