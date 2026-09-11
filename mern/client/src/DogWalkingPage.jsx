import { Link } from 'react-router-dom';
import { AppointmentNotice, Page, Notice } from './ui';
import { useBravo } from './context';
import { money } from '../../shared/catalog';

export default function DogWalkingPage() {
  const { config } = useBravo();
  const service = config?.services?.find(item => item.id === 'walking');
  const rate = service?.cents ?? 2500;
  return <Page title="Dog Walking in Aberdeen." eyebrow="BRAVO K9 DOG WALKING" intro="Professional, dependable walks from the Bravo team—priced clearly for one dog or several.">
    <section className="dog-walking-hero panel"><div><p className="kicker gold">SIMPLE, CLEAR CARE</p><h2>30 minutes.<br/>{money(rate)} per dog.</h2><p>Choose the number of dogs, select an available time, and see the complete total before you save your request.</p>{service?.enabled === false ? <Notice>Online dog-walking requests are temporarily paused. Contact Bravo for help.</Notice> : <Link className="button" to="/portal?program=walking">Book Dog Walking <span aria-hidden="true">↗</span></Link>}</div><dl><div><dt>Rate</dt><dd>{money(rate)} per dog</dd></div><div><dt>Duration</dt><dd>30-minute walk</dd></div><div><dt>Examples</dt><dd>1 dog = {money(rate)}<br/>2 dogs = {money(rate * 2)}<br/>3 dogs = {money(rate * 3)}</dd></div></dl></section>
    <AppointmentNotice/>
    <section className="panel prose"><h2>What to expect.</h2><p>Dog Walking is scheduled separately from Bravo training programs. The booking summary shows the number of dogs, rate per dog, number of walks, duration, and total.</p><p>Walk requests remain subject to availability and Bravo confirmation. Tell the team about access instructions or handling needs in the private booking notes.</p><Link className="inline-link" to="/contact">Questions about walking service? Contact Bravo →</Link></section>
  </Page>;
}
