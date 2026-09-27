import { Editable } from './SiteContent';
import { trainerIntroductions as introductions } from '../../shared/trainer-profile';

export default function TrainerIntroduction({ person }) {
  const introduction = introductions[person.profileKey === 'david' ? 'David Northrop' : person.profileKey === 'ashley' ? 'Ashley Northrop' : person.name];
  if (!introduction) return person.bio ? <p className="trainer-introduction">{person.bio}</p> : null;
  return <>
    <p className="trainer-focus"><Editable as="strong" contentKey={`${introduction.focusKey}-label`} canEditText>Areas of focus</Editable><br/><Editable as="span" contentKey={introduction.focusKey} canEditText>{introduction.focus}</Editable></p>
    <Editable as="p" contentKey={introduction.key} canEditText className="trainer-introduction">{person.bio || introduction.text}</Editable>
    <blockquote className="trainer-client-quote"><p>“{introduction.quote}”</p><cite>{introduction.author} · Facebook recommendation</cite></blockquote>
    <div className="trainer-proof-links"><Editable as="a" contentKey="copy-trainerintroduction-1" canEditText canEditLink href="#work-proof-title">Watch the team train</Editable><Editable as="a" contentKey="copy-trainerintroduction-2" canEditText canEditLink href="#facebook-recommendations-title">Read the client reviews</Editable></div>
  </>;
}
