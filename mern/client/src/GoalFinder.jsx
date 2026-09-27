import { recommendations } from './FacebookRecommendations';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { SERVICES, money } from '../../shared/catalog';
import { GOALS, goalBookingPath, goalDetailsPath, proofMatches } from '../../shared/discovery';
import { trackVisit } from './telemetry';
import ProgramMedia from './ProgramMedia';
import { Editable } from './SiteContent';

export default function GoalFinder() {
  const { config } = useBravo();
  const [selected, setSelected] = useState('manners'), [clips, setClips] = useState([]);
  const goal = GOALS.find(item => item.id === selected);
  const service = (config?.services || SERVICES).find(item => item.id === goal.program);
  const clip = goal.proof && clips.find(item => proofMatches(item, goal.proof));
  useEffect(() => { let current = true; api('/proof-videos').then(data => { if (current) setClips(Array.isArray(data.clips) ? data.clips : []); }).catch(() => {}); return () => { current = false; }; }, []);
  return <section className="goal-finder cinema-shell" id="find-training" aria-labelledby="goal-title">
    <Editable as="p" contentKey="goal-eyebrow" canEditText className="cinema-eyebrow">YOUR DOG. YOUR STARTING POINT.</Editable>
    <Editable as="h2" contentKey="discovery-goal-title" canEditText id="goal-title">What would you like help with?</Editable>
    <div className="goal-choices" role="group" aria-label="Choose a training goal">{GOALS.map(item => {
      const price = (config?.services || SERVICES).find(service => service.id === item.program);
      return <div className="goal-choice" key={item.id} data-selected={selected === item.id}>
      <Link className="goal-choice-link" to={price?.enabled === false ? '/contact' : goalBookingPath(item)} aria-labelledby={`goal-tab-${item.id}`} aria-describedby={`goal-price-${item.id}`} onClick={() => trackVisit('goal_selected')}>
        <Editable as="span" id={`goal-tab-${item.id}`} contentKey={`goal-${item.id}-label`} canEditText>{item.label}</Editable>
        <span className="goal-tab-price" id={`goal-price-${item.id}`}>{price ? <>{money(price.cents)} <span>{price.interval === 'once' ? 'initial intake' : price.interval === 'walk' ? '/ dog / walk' : '/ month'}</span><small>{item.program === 'aggression' ? 'Two-trainer assessment' : item.program === 'walking' ? `${price.durationMinutes || 30}-minute walk` : 'Training · one dog'}</small></> : 'Ask Bravo for pricing'}</span>
        <span className="goal-choice-action">{price?.enabled === false ? 'Ask about availability' : 'Choose program'} <span aria-hidden="true">→</span></span>
      </Link>
      <button className="goal-preview" type="button" aria-label={`Preview ${item.label}`} aria-pressed={selected === item.id} aria-controls="goal-result" onClick={() => setSelected(item.id)}>Preview details</button>
      </div>;
    })}</div>
    <div className="goal-result" id="goal-result" key={selected}>
      <Editable as="div" contentKey={`goal-${goal.id}-copy`} aria-live="polite" aria-atomic="true"><Editable as="h3" contentKey={`goal-${goal.id}-title`} canEditText>{goal.title}</Editable><Editable as="p" contentKey={`goal-${goal.id}-description`} canEditText>{goal.description}</Editable>{service && <p className="goal-price">{money(service.cents)} <span>{goal.program === 'aggression' ? 'initial intake · ongoing training separate' : goal.program === 'walking' ? `/dog · ${service.durationMinutes || 30} minutes per walk` : '/month · one dog · manual renewal'}</span></p>}
        <Editable as="p" contentKey={`goal-${goal.id}-details`} canEditText className="helper">{goal.program === 'training' ? 'Private visits. Monday–Friday, up to one hour per day. We come to you in Aberdeen.' : goal.program === 'walking' ? 'Choose your walking dates and times. Each 30-minute walk is priced per dog.' : 'Two trainers. Call before the visit to discuss handling or access concerns.'}</Editable>
        <div className="goal-actions">{service?.enabled !== false && <Editable as={Link} contentKey={`goal-${goal.id}-book`} canEditText canEditLink className="button" to={goalBookingPath(goal)}>{goal.program === 'aggression' ? 'Request an assessment' : goal.program === 'walking' ? 'Schedule a walk' : 'Plan my first visit'} →</Editable>}<Editable as={Link} contentKey={`goal-${goal.id}-included`} canEditText canEditLink className="inline-link" to={goalDetailsPath(goal)}>What’s included</Editable></div>
      </Editable>
      <ProgramMedia key={goal.id} goal={goal} automaticClip={clip}/>
    </div>
    <aside className="goal-early-review" aria-label="A Bravo client’s experience"><blockquote>“{recommendations[0].excerpt}”</blockquote><p>{recommendations[0].author} · {recommendations[0].source}</p><Link to="/#reviews">Read client experiences →</Link></aside>
  </section>;
}
