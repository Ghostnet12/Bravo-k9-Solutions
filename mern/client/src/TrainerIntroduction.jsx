import { Editable } from './SiteContent';

// Only established roles and specialties belong in these defaults.
// Experience, qualifications and client outcomes must come from the trainers.
const introductions = {
  'David Northrop': {
    key: 'trainer-david-introduction',
    text: 'Meet David, Bravo’s owner and lead trainer. Start a conversation about your dog, your goals, and the practical challenges you face at home. David can help you discuss where to begin with Bravo.',
    focus: 'Owner · lead trainer',
  },
  'Ashley Northrop': {
    key: 'trainer-ashley-introduction',
    text: 'Meet Ashley, a Bravo trainer with a specialty in Pitbulls. Tell her about your dog’s personality and the everyday situations you want help with. Ask about her approach and whether she is the right fit for your dog.',
    focus: 'Trainer · Pitbull specialist',
  },
};
introductions['Ashley Leverock'] = introductions['Ashley Northrop'];

export default function TrainerIntroduction({ person }) {
  const introduction = introductions[person.name];
  if (!introduction) return person.bio ? <p className="trainer-introduction">{person.bio}</p> : null;
  return <>
    <Editable as="p" contentKey={introduction.key} canEditText className="trainer-introduction">{person.bio || introduction.text}</Editable>
  </>;
}
