import CatalogPrice from './CatalogPrice';
import { reviewExcerpt } from '../../shared/review-markup';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBravo } from './context';
import { api } from './api';
import { SERVICES } from '../../shared/catalog';
import { GOALS, goalBookingPath, goalDetailsPath, proofMatches } from '../../shared/discovery';
import { trackVisit } from './telemetry';
import ProgramMedia from './ProgramMedia';
import { Editable, useSiteContent } from './SiteContent';

export default function GoalFinder({ review = null }) {
  const { config } = useBravo();
  const {entries}=useSiteContent();
  const [selected, setSelected] = useState('manners'), [clips, setClips] = useState([]);
  const goal = GOALS.find(item => item.id === selected);
  const service = (config?.services?.length ? config.services : SERVICES).find(item => item.id === goal.program);
  const clip = goal.proof && clips.find(item => proofMatches(item, goal.proof));
  useEffect(() => { let current = true; api('/proof-videos').then(data => { if (current) setClips(Array.isArray(data.clips) ? data.clips : []); }).catch(() => {}); return () => { current = false; }; }, []);
  return <Editable as="section" contentKey="copy-goalfinder-1" className="goal-finder cinema-shell" id="find-training" aria-labelledby="goal-title">
    <Editable as="p" contentKey="goal-eyebrow" canEditText className="cinema-eyebrow">YOUR DOG. YOUR STARTING POINT.</Editable>
    <Editable as="h2" contentKey="discovery-goal-title" canEditText id="goal-title">What does your dog struggle with?</Editable>
    <div className="goal-choices" role="group" aria-label="Choose a training goal">{GOALS.map(item => {
      const price = (config?.services?.length ? config.services : SERVICES).find(service => service.id === item.program);
      const specialist = item.id === 'specialist';
      return <Editable as="div" contentKey={`goal-${item.id}-card`} data-site-service={item.program} className="goal-choice" key={item.id} data-selected={selected === item.id}>
      <Editable as={Link} contentKey={`goal-${item.id}-choice`} canEditLink className="goal-choice-link" to={specialist || price?.enabled === false ? '/contact' : goalDetailsPath(item)} aria-labelledby={`goal-tab-${item.id}`} aria-describedby={`goal-price-${item.id}`} onClick={() => trackVisit('goal_selected')}>
        <Editable as="span" id={`goal-tab-${item.id}`} contentKey={`goal-${item.id}-label`} canEditText>{item.label}</Editable>
        <span className="goal-tab-price" id={`goal-price-${item.id}`}>{specialist ? <><Editable as="strong" contentKey={`goal-${item.id}-unit`} canEditText>Talk with Bravo</Editable><Editable as="small" contentKey={`goal-${item.id}-summary`} canEditText>Scope & pricing are goal-specific</Editable></> : price?.enabled === false ? <span>Contact Bravo for availability</span> : price ? <><CatalogPrice service={item.program}/> <Editable as="span" contentKey={`goal-${item.id}-unit`} canEditText>{price.interval === 'once' ? 'initial intake' : price.interval === 'walk' ? '/ dog / walk' : '/ month'}</Editable><Editable as="small" contentKey={`goal-${item.id}-summary`} canEditText>{item.program === 'aggression' ? 'Two-trainer assessment' : item.program === 'walking' ? `${price.durationMinutes || 30}-minute walk` : 'Training · one dog'}</Editable></> : 'Ask Bravo for pricing'}</span>
        <Editable as="span" contentKey={`goal-${item.id}-action`} canEditText className="goal-choice-action">{specialist ? 'Discuss your goal' : price?.enabled === false ? 'Ask about availability' : item.program === 'aggression' ? 'See assessment details' : item.program === 'walking' ? 'See walking details' : 'See training & pricing'} <span aria-hidden="true">→</span></Editable>
      </Editable>
      <Editable as="button" contentKey="copy-goalfinder-2" canEditText className="goal-preview" type="button" aria-label={`Preview ${entries[`goal-${item.id}-label`]?.value?.text ?? item.label}`} aria-pressed={selected === item.id} aria-controls="goal-result" onClick={() => setSelected(item.id)}>Preview details</Editable>
      </Editable>;
    })}</div>
    <p className="goal-help"><Editable as={Link} contentKey="goal-not-sure" canEditText canEditLink to="/contact">Not sure? Talk to Bravo →</Editable></p>
    <div className="goal-result" id="goal-result" key={selected}>
      <Editable as="div" contentKey={`goal-${goal.id}-copy`} aria-live="polite" aria-atomic="true"><Editable as="h3" contentKey={`goal-${goal.id}-title`} canEditText>{goal.title}</Editable><Editable as="p" contentKey={`goal-${goal.id}-description`} canEditText>{goal.description}</Editable>{service && goal.id !== 'specialist' && <p data-site-service={goal.program} className="goal-price"><CatalogPrice service={goal.program}/> <span>{goal.program === 'aggression' ? 'initial intake · ongoing training separate' : goal.program === 'walking' ? `/dog · ${service.durationMinutes || 30} minutes per walk` : '/month · one dog · manual renewal'}</span></p>}
        <Editable as="p" contentKey={`goal-${goal.id}-details`} canEditText className="helper">{goal.id === 'specialist' ? 'Specialist and working-dog plans are scoped individually. Contact Bravo to discuss suitability, preparation, and pricing.' : goal.program === 'training' ? 'Private visits. Monday–Friday, up to one hour per day. We come to you in Aberdeen.' : goal.program === 'walking' ? 'Choose your walking dates and times. Each 30-minute walk is priced per dog.' : 'Two trainers. Call before the visit to discuss handling or access concerns.'}</Editable>
        <div className="goal-actions">{goal.id === 'specialist' ? <Editable as={Link} contentKey={`goal-${goal.id}-book`} canEditText canEditLink className="button" to="/contact">Talk with Bravo →</Editable> : service?.enabled !== false && <Editable as={Link} contentKey={`goal-${goal.id}-book`} canEditText canEditLink className="button" to={goalBookingPath(goal)}>{goal.program === 'aggression' ? 'Request an assessment' : goal.program === 'walking' ? 'Schedule a walk' : 'Plan my first visit'} →</Editable>}<Editable as={Link} contentKey={`goal-${goal.id}-included`} canEditText canEditLink className="inline-link" to={goalDetailsPath(goal)}>{goal.id === 'specialist' ? 'Explore working-dog goals' : 'What’s included'}</Editable></div>
      </Editable>
      <ProgramMedia key={goal.id} goal={goal} automaticClip={clip}/>
    </div>
    <aside className="goal-early-review" data-review-highlight="" aria-label={review ? 'A Bravo client’s experience' : undefined}>{review && <><blockquote>“{reviewExcerpt(review)}”</blockquote><p>{review.authorName} · {review.source}</p><Editable as={Link} contentKey="copy-goalfinder-3" canEditText canEditLink className="inline-link" to="/#reviews">Read client experiences →</Editable></>}</aside>
  </Editable>;
}
