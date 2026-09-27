import { recommendations } from './FacebookRecommendations';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { SERVICES, money } from '../../shared/catalog';
import { GOALS, proofMatches } from '../../shared/discovery';
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
    <div className="goal-choices" role="group" aria-label="Choose a training goal">{GOALS.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); trackVisit('goal_selected'); }}><Editable as="span" contentKey={`goal-${item.id}-label`} canEditText>{item.label}</Editable></button>)}</div>
    <div className="goal-result" key={selected}>
      <Editable as="div" contentKey={`goal-${goal.id}-copy`} aria-live="polite" aria-atomic="true"><Editable as="h3" contentKey={`goal-${goal.id}-title`} canEditText>{goal.title}</Editable><Editable as="p" contentKey={`goal-${goal.id}-description`} canEditText>{goal.description}</Editable>{service && <p className="goal-price">{money(service.cents)} <span>{goal.program === 'aggression' ? 'initial intake · ongoing training separate' : '/month · one dog · manual renewal'}</span></p>}
        <Editable as="p" contentKey={`goal-${goal.id}-details`} canEditText className="helper">{goal.program === 'training' ? 'Private visits. Monday–Friday, up to one hour per day. We come to you in Aberdeen.' : 'Two trainers. Call before the visit to discuss handling or access concerns.'}</Editable>
        <div className="goal-actions">{service?.enabled !== false && <Editable as={Link} contentKey={`goal-${goal.id}-book`} canEditText canEditLink className="button" to={`/portal?program=${goal.program}&focus=${goal.focus}`}>{goal.program === 'aggression' ? 'Request an assessment' : 'Plan my first visit'} →</Editable>}<Editable as={Link} contentKey={`goal-${goal.id}-included`} canEditText canEditLink className="inline-link" to={goal.program === 'aggression' ? '/behavior-assessment' : '/dog-training'}>What’s included</Editable></div>
      </Editable>
      <ProgramMedia key={goal.id} goal={goal} automaticClip={clip}/>
    </div>
    <aside className="goal-early-review" aria-label="A Bravo client’s experience"><blockquote>“{recommendations[0].excerpt}”</blockquote><p>{recommendations[0].author} · {recommendations[0].source}</p><Link to="/#reviews">Read client experiences →</Link></aside>
  </section>;
}
