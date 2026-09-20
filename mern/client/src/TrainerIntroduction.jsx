import { Editable } from './SiteContent';

// Only established roles and specialties belong in these defaults.
// Experience, qualifications and client outcomes must come from the trainers.
const introductions = {
  'David Northrop': {
    key: 'trainer-david-introduction',
    focusKey: 'trainer-david-focus',
    text: 'Meet David, Bravo’s owner and lead trainer. Start a conversation about your dog, your goals, and the practical challenges you face at home. David can help you discuss where to begin with Bravo.',
    focus: 'Obedience · Service-dog foundations',
    quote: 'David is very knowledgeable and my dogs love him.',
    author: 'Andrea Leigh Duarte',
  },
  'Ashley Northrop': {
    key: 'trainer-ashley-introduction',
    focusKey: 'trainer-ashley-focus',
    text: 'Meet Ashley, a Bravo trainer with a specialty in Pitbulls. Tell her about your dog’s personality and the everyday situations you want help with. Ask about her approach and whether she is the right fit for your dog.',
    focus: 'Pitbull training · Everyday behavior',
    quote: 'David & Ashley are both fantastic trainers.',
    author: 'Cassidy Bierman',
  },
};
introductions['Ashley Leverock'] = introductions['Ashley Northrop'];

export default function TrainerIntroduction({ person }) {
  const introduction = introductions[person.name];
  if (!introduction) return person.bio ? <p className="trainer-introduction">{person.bio}</p> : null;
  return <>
    <p className="trainer-focus"><Editable as="strong" contentKey={`${introduction.focusKey}-label`} canEditText>Areas of focus</Editable><br/><Editable as="span" contentKey={introduction.focusKey} canEditText>{introduction.focus}</Editable></p>
    <Editable as="p" contentKey={introduction.key} canEditText className="trainer-introduction">{person.bio || introduction.text}</Editable>
    <blockquote className="trainer-client-quote"><p>“{introduction.quote}”</p><cite>{introduction.author} · Facebook recommendation</cite></blockquote>
    <div className="trainer-proof-links"><a href="#work-proof-title">Watch the team train</a><a href="#facebook-recommendations-title">Read the client reviews</a></div>
  </>;
}
