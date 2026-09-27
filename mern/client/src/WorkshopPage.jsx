import { Link } from 'react-router-dom';
import { Page } from './ui';
import { WorkshopDetails } from './WorkshopDetails';
import HomeAdCarousel from './HomeAdCarousel';
export default function WorkshopPage() {
  return <Page title="Come. Learn. Go further." eyebrow="BRAVO WORKSHOPS" intro="Time with the trainers. Practical questions. A deeper understanding of the dog in front of you."><WorkshopDetails/><HomeAdCarousel/><section className="panel prose"><h2>Before you come.</h2><p>Ask about the session’s topics and whether it is suitable for your experience and your dog. Confirm whether to bring your dog before attending.</p><p>For aggression or difficult handling, discuss your situation privately with Bravo first. <Link to="/behavior-assessment">Explore a two-trainer assessment →</Link></p></section></Page>;
}
