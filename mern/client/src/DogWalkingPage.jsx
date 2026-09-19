import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { AppointmentNotice, Page, Notice } from './ui';
import { useBravo } from './context';
import { money } from '../../shared/catalog';

export default function DogWalkingPage() {
  const { config } = useBravo();
  const service = config?.services?.find(item => item.id === 'walking');
  const rate = service?.cents ?? 2500;
  return <Page title="Dog Walking in Aberdeen." eyebrow="BRAVO K9 DOG WALKING" intro="Professional, dependable walks from the Bravo team—priced clearly for one dog or several.">
    <Editable as="section" contentKey="dogwalkingpage-1" className="dog-walking-hero panel"><Editable as="div" contentKey="dogwalkingpage-2"><Editable as="p" contentKey="dogwalkingpage-3" canEditText className="kicker gold">SIMPLE, CLEAR CARE</Editable><Editable as="h2" contentKey="dogwalkingpage-4">30 minutes.<br/>{money(rate)} per dog.</Editable><Editable as="p" contentKey="dogwalkingpage-5" canEditText>Choose the number of dogs, select an available time, and see the complete total before you save your request.</Editable>{service?.enabled === false ? <Notice>Online dog-walking requests are temporarily paused. Contact Bravo for help.</Notice> : <Editable as={Link} contentKey="dogwalkingpage-6" canEditLink canEditText className="button" to="/portal?program=walking">Book Dog Walking <span aria-hidden="true">↗</span></Editable>}</Editable><dl><Editable as="div" contentKey="dogwalkingpage-8"><dt>Rate</dt><dd>{money(rate)} per dog</dd></Editable><Editable as="div" contentKey="dogwalkingpage-9"><dt>Duration</dt><dd>30-minute walk</dd></Editable><Editable as="div" contentKey="dogwalkingpage-10"><dt>Examples</dt><dd>1 dog = {money(rate)}<br/>2 dogs = {money(rate * 2)}<br/>3 dogs = {money(rate * 3)}</dd></Editable></dl></Editable>
    <AppointmentNotice/>
    <Editable as="section" contentKey="dogwalkingpage-11" className="panel prose"><Editable as="h2" contentKey="dogwalkingpage-12" canEditText>What to expect.</Editable><Editable as="p" contentKey="dogwalkingpage-13" canEditText>Dog Walking is scheduled separately from Bravo training programs. The booking summary shows the number of dogs, rate per dog, number of walks, duration, and total.</Editable><Editable as="p" contentKey="dogwalkingpage-14" canEditText>Walk requests remain subject to availability and Bravo confirmation. Tell the team about access instructions or handling needs in the private booking notes.</Editable><Editable as={Link} contentKey="dogwalkingpage-15" canEditLink canEditText className="inline-link" to="/contact">Questions about walking service? Contact Bravo →</Editable></Editable>
  </Page>;
}
