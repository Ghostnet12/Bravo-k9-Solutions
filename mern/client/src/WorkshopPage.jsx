import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { Page } from './ui';
import { WorkshopDetails } from './WorkshopDetails';
export default function WorkshopPage() {
  return <Page title="Come. Learn. Go further." eyebrow="BRAVO WORKSHOPS" intro="Hands-on learning with the trainers, built around real dogs and real situations."><WorkshopDetails/><Editable as="section" contentKey="copy-workshoppage-1" className="panel prose"><Editable as="h2" contentKey="copy-workshoppage-2" canEditText>Before you come.</Editable><Editable as="p" contentKey="copy-workshoppage-3" canEditText>Ask what the session covers and whether you should bring your dog. Bravo confirms attendance details directly before the event.</Editable><p><Editable as="span" contentKey="copy-workshoppage-4" canEditText>For aggression or difficult handling, talk with Bravo privately before attending. </Editable><Editable as={Link} contentKey="copy-workshoppage-5" canEditText canEditLink to="/behavior-assessment">Explore a two-trainer assessment →</Editable></p></Editable></Page>;
}
