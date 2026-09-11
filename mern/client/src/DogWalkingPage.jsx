import { Link } from 'react-router-dom';
import { AppointmentNotice, Page } from './ui';

export default function DogWalkingPage() {
  return <Page title="Dog Walking in Aberdeen." eyebrow="BRAVO K9 DOG WALKING" intro="Professional, dependable walks from the Bravo team—priced clearly for one dog or several.">
    <section className="dog-walking-hero panel"><div><p className="kicker gold">SIMPLE, CLEAR CARE</p><h2>30 minutes.<br/>$25 per dog.</h2><p>Choose the number of dogs, select an available time, and see the complete total before you save your request.</p><Link className="button" to="/portal?program=walking">Book Dog Walking <span aria-hidden="true">↗</span></Link></div><dl><div><dt>Rate</dt><dd>$25 per dog</dd></div><div><dt>Duration</dt><dd>30-minute walk</dd></div><div><dt>Examples</dt><dd>1 dog = $25<br/>2 dogs = $50<br/>3 dogs = $75</dd></div></dl></section>
    <AppointmentNotice/>
    <section className="panel prose"><h2>What to expect.</h2><p>Dog Walking is scheduled separately from Bravo training programs. The booking summary shows the number of dogs, rate per dog, number of walks, duration, and total.</p><p>Walk requests remain subject to availability and Bravo confirmation. Tell the team about access instructions or handling needs in the private booking notes.</p><Link className="inline-link" to="/contact">Questions about walking service? Contact Bravo →</Link></section>
  </Page>;
}
