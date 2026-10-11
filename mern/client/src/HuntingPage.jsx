import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from './ui';
import { Editable } from './SiteContent';
import { api } from './api';
import { HUNTING_GOALS, huntingInquiryPath } from '../../shared/field-experience';
import './field-experience.css';
export default function HuntingPage() {
  const [goal, setGoal] = useState(''), [artwork, setArtwork] = useState(null);
  useEffect(() => {
    let current = true;
    api('/site-ads').then(data => {
      const ad = data.ads?.find(item => item.id === 'ad-2b5c8355-930e-40dc-b036-4c99a92cf18c' && item.title === 'Gunner' && item.enabled !== false);
      if (current && ad && /^\/api\/site-ads\/[a-z0-9-]+\/image(?:\?v=\d+)?$/.test(ad.src || '')) setArtwork(ad);
    }).catch(() => {});
    return () => { current = false; };
  }, []);
  return <Page title="Drive meets direction." eyebrow="HUNTING DOG TRAINING · ABERDEEN, SD" intro="A purpose in the field. A connection with you." className="hunting-page">
    <section className="hunting-hero" aria-labelledby="hunting-intro-title">
      <div><Editable as="p" contentKey="hunting-eyebrow" canEditText className="cinema-eyebrow">BUILT AROUND YOUR DOG</Editable><Editable as="h2" contentKey="hunting-intro-title" canEditText id="hunting-intro-title">Start with the dog.<br/>Train for the goal.</Editable><Editable as="p" contentKey="hunting-intro" canEditText>Tell Bravo about your dog, your experience together, and the work you have in mind. We’ll discuss suitability and the right starting point before a specialist plan is agreed.</Editable><div className="field-actions"><Link className="button" to={huntingInquiryPath()}>Talk about hunting training ↗</Link><a className="inline-link" href="#hunting-goals">Explore your goals ↓</a></div><Editable as="p" contentKey="hunting-pricing" canEditText className="helper">Individually scoped. Bravo confirms specialist pricing directly; the standard monthly obedience price does not apply automatically.</Editable></div>
      <div className={`hunting-hero-media ${artwork ? 'has-artwork' : ''}`}>{artwork ? <img src={artwork.src} alt={artwork.alt || 'Bravo hunting dog training — Gunner'} width="1200" height="800" data-site-image-ignore="" onError={() => setArtwork(null)}/> : <div className="hunting-mark" aria-hidden="true"><img src="/graphics/compass.svg" alt="" width="112" height="112"/><span>TRUST.<br/>TRAIN.<br/>DEPLOY.</span></div>}</div>
    </section>
    <section id="hunting-goals" className="hunting-goals panel" aria-labelledby="hunting-goals-title"><Editable as="p" contentKey="hunting-goals-eyebrow" canEditText className="cinema-eyebrow">YOUR DOG. YOUR DIRECTION.</Editable><Editable as="h2" contentKey="hunting-goals-title" canEditText id="hunting-goals-title">What would you like to work toward?</Editable><Editable as="p" contentKey="hunting-goals-intro" canEditText>These are conversation starters, not a diagnosis or a promised training package. Choose one—or go straight to Bravo.</Editable><div className="hunting-goal-options" role="group" aria-label="Choose a hunting training interest">{HUNTING_GOALS.map(item => <button type="button" key={item.id} aria-pressed={goal === item.id} onClick={() => setGoal(old => old === item.id ? '' : item.id)}>{item.label}{goal === item.id && <span aria-hidden="true"> ✓</span>}</button>)}</div><p className="hunting-selection" role="status">{goal ? `Your interest: ${HUNTING_GOALS.find(item => item.id === goal).label}.` : 'No selection required.'}</p><Link className="button" to={huntingInquiryPath(goal)}>Discuss my dog with Bravo →</Link></section>
    <section className="hunting-process" aria-labelledby="hunting-process-title"><Editable as="h2" contentKey="hunting-process-title" canEditText id="hunting-process-title">A clear next step.</Editable><div className="hunting-process-grid">{[
      ['Talk through the goal.', 'Tell us your dog’s age, previous training, and what you want to do together.'],
      ['Discuss suitability.', 'Bravo helps establish the starting point and any preparation needed.'],
      ['Agree on a plan.', 'Confirm the scope, price, location and next steps with your trainer before committing.'],
    ].map(([title,copy],index)=><article key={title}><span className="hunting-step" aria-hidden="true">0{index+1}</span><Editable as="h3" contentKey={`hunting-step-${index}-title`} canEditText>{title}</Editable><Editable as="p" contentKey={`hunting-step-${index}-copy`} canEditText>{copy}</Editable></article>)}</div></section>
    <section className="panel hunting-faq" aria-labelledby="hunting-faq-title"><Editable as="h2" contentKey="hunting-faq-title" canEditText id="hunting-faq-title">Before we head into the field.</Editable><details><summary>Do I need to choose a program first?</summary><p>No. Start with a conversation about your dog and your goals. You do not need to select or buy a standard membership to make a specialist inquiry.</p></details><details><summary>Is hunting training the same as monthly obedience?</summary><p>No. Specialist goals and pricing are discussed individually. Everyday obedience may be part of the conversation, but this page does not quote or sell a hunting package.</p></details><details><summary>Where does training take place?</summary><p>Bravo is based in Aberdeen, South Dakota. The team confirms the appropriate location and arrangements for your plan directly.</p></details><div className="field-actions"><a href="tel:+16058242767" className="button button-ghost">Call (605) 824-2767</a><Link to="/#team" className="inline-link">Meet your trainers →</Link><Link to="/dog-training" className="inline-link">Looking for everyday obedience?</Link></div></section>
  </Page>;
}
