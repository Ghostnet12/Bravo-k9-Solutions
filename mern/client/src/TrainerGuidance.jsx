import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isSpecialistFocus } from '../../shared/catalog';
import { Editable } from './SiteContent';

export default function TrainerGuidance({ trainers, focus, dogCount, onChoose, disabled }) {
  const [need, setNeed] = useState(isSpecialistFocus(focus) || focus === 'not-sure' ? 'specialist' : 'everyday');
  const available = trainers.filter(person => !person.disabled && !person.joint && !person.full && (!Number.isFinite(person.spotsRemaining) || person.spotsRemaining >= dogCount));
  const recommendation = need === 'pitbull' ? available.find(person => /pit\s*bull/i.test(person.title || '')) : available.find(person => /lead/i.test(person.title || '') || person.role === 'owner');
  return <details className="trainer-guidance">
    <Editable as="summary" contentKey="booking-trainer-help" canEditText>Help me choose a trainer</Editable>
    <label>What kind of help do you need?<select aria-label="What kind of help do you need?" value={need} onChange={event => setNeed(event.target.value)}><option value="everyday">Puppy manners or everyday obedience</option><option value="pitbull">Pitbull training support</option><option value="aggression">Aggression or difficult handling</option><option value="specialist">Specialist goals or I’m not sure</option></select></label>
    {need === 'aggression' ? <p>Start with Bravo’s two-trainer assessment so the team can review your dog’s needs. <Link to="/behavior-assessment">Explore the behavior assessment →</Link></p> : need === 'specialist' ? <p>Let Bravo help choose the right program before you commit. <Link to="/contact">Talk through your dog’s needs →</Link> You can also choose a trainer below for obedience foundations; specialist acceptance and pricing are separate.</p> : recommendation ? <div className="trainer-recommendation"><p><strong>{recommendation.name}</strong><br/>{recommendation.title || 'Lead trainer'}</p><p>{need === 'pitbull' ? 'Their public profile lists Pitbull training as a specialty.' : 'Start with Bravo’s lead trainer for a plan around everyday skills.'} You can choose another trainer below.</p><button type="button" className="button button-ghost" disabled={disabled} onClick={() => onChoose(recommendation)}>See {recommendation.name}’s dates →</button></div> : <p>Choose an available trainer below, or <a href="tel:+16058242767">call Bravo for a recommendation</a>. Trainer capacity is checked before sending.</p>}
  </details>;
}
