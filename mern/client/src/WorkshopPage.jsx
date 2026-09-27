import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { Page } from './ui';
import { WorkshopDetails } from './WorkshopDetails';
import HomeAdCarousel from './HomeAdCarousel';
export default function WorkshopPage() {
  return <Page title="Come. Learn. Go further." eyebrow="BRAVO WORKSHOPS" intro="Time with the trainers. Practical questions. A deeper understanding of the dog in front of you."><WorkshopDetails/><HomeAdCarousel/><Editable as="section" contentKey="copy-workshoppage-1" className="panel prose"><Editable as="h2" contentKey="copy-workshoppage-2" canEditText>Before you come.</Editable><Editable as="p" contentKey="copy-workshoppage-3" canEditText>Ask about the session’s topics and whether it is suitable for your experience and your dog. Confirm whether to bring your dog before attending.</Editable><p><Editable as="span" contentKey="copy-workshoppage-4" canEditText>For aggression or difficult handling, discuss your situation privately with Bravo first. </Editable><Editable as={Link} contentKey="copy-workshoppage-5" canEditText canEditLink to="/behavior-assessment">Explore a two-trainer assessment →</Editable></p></Editable></Page>;
}
