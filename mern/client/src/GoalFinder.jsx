import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { SERVICES, money } from '../../shared/catalog';
import { GOALS, proofMatches } from '../../shared/discovery';
import { trackVisit } from './telemetry';
import { Editable } from './SiteContent';

export default function GoalFinder() {
  const { config } = useBravo();
  const [selected, setSelected] = useState('manners'), [clips, setClips] = useState([]);
  const goal = GOALS.find(item => item.id === selected);
  const service = (config?.services || SERVICES).find(item => item.id === goal.program);
  const clip = goal.proof && clips.find(item => proofMatches(item, goal.proof));
  useEffect(() => { let current = true; api('/proof-videos').then(data => { if (current) setClips(data.clips || []); }).catch(() => {}); return () => { current = false; }; }, []);
  return <section className="goal-finder cinema-shell" id="find-training" aria-labelledby="goal-title">
    <p className="cinema-eyebrow">YOUR DOG. YOUR STARTING POINT.</p>
    <Editable as="h2" contentKey="discovery-goal-title" canEditText id="goal-title">What would you like help with?</Editable>
    <div className="goal-choices" role="group" aria-label="Choose a training goal">{GOALS.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); trackVisit('goal_selected'); }}>{item.label}</button>)}</div>
    <div className="goal-result" key={selected}>
      <div aria-live="polite" aria-atomic="true"><h3>{goal.title}</h3><p>{goal.description}</p>{service && <p className="goal-price">{money(service.cents)} <span>{goal.program === 'aggression' ? 'initial intake · ongoing training separate' : '/month · one dog · manual renewal'}</span></p>}
        <p className="helper">{goal.program === 'training' ? 'Private visits. Monday–Friday, up to one hour per day. We come to you in Aberdeen.' : 'Two trainers. Call before the visit to discuss handling or access concerns.'}</p>
        <div className="goal-actions">{service?.enabled !== false && <Link className="button" to={`/portal?program=${goal.program}&focus=${goal.focus}`}>{goal.program === 'aggression' ? 'Request an assessment' : 'Plan my first visit'} →</Link>}<Link className="inline-link" to={goal.program === 'aggression' ? '/behavior-assessment' : '/dog-training'}>What’s included</Link></div>
      </div>
      {clip ? <figure className="goal-proof">{clip.src ? <video key={clip.src} src={clip.src} poster={clip.poster || undefined} controls playsInline preload="none" aria-label={clip.title}/> : <a href={clip.facebookUrl}><img src={clip.poster} width="640" height="420" loading="lazy" alt={clip.title}/><span>Watch on Facebook ↗</span></a>}<figcaption><strong>{clip.title}</strong><p>{clip.description}</p><Link to={`/#reviews`}>Explore more training videos →</Link></figcaption></figure> : <div className="goal-consult"><img src="/images/bravo-client-training.jpeg" width="828" height="1121" loading="lazy" alt="Bravo training in an everyday public setting"/><div><strong>Let’s talk about your dog.</strong><p>Not sure where to begin? We’ll help you choose.</p><a href="tel:+16058242767">Call (605) 824-2767</a></div></div>}
    </div>
  </section>;
}
