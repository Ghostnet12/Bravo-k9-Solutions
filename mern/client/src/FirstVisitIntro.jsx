import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { money, TRAINING_ADDITIONAL_DOG_CENTS, TRAINING_FOCUSES } from '../../shared/catalog';
export default function FirstVisitIntro({ form, setForm, dogCount, setDogCount, focus, setFocus, cents, onContinue, onFullSchedule }) {
  return <Editable as="section" contentKey="first-visit-intro" className="panel first-visit-intro">
    <Editable as="h2" contentKey="first-visit-title" canEditText>Let’s start with your dog.</Editable>
    <Editable as="p" contentKey="first-visit-copy" canEditText>Tell us what you’d like help with, then choose a first visit. You can plan the rest with your trainer.</Editable>
    <div className="price-total"><span>Private training · {dogCount} {dogCount === 1 ? 'dog' : 'dogs'}</span><strong>{money(cents + (dogCount - 1) * TRAINING_ADDITIONAL_DOG_CENTS)}<small>/month</small></strong></div>
    <Editable as="p" contentKey="first-visit-terms" canEditText>Private visits at home. One-hour appointment slots. Renew monthly when you’re ready—no automatic payment. Saving a request does not charge your card.</Editable>
    <form onSubmit={event => { event.preventDefault(); onContinue(); }}>
      <div className="form-grid"><label>Dog’s name<input aria-label="Dog’s name" required maxLength={80} autoComplete="off" value={form.dogName} onChange={event => setForm(old => ({ ...old, dogName:event.target.value }))}/></label>
      <label>Number of dogs<input aria-label="Number of dogs" type="number" min="1" max="10" required value={dogCount} onChange={event => setDogCount(Math.max(1,Math.min(10,Number(event.target.value)||1)))}/></label></div>
      <label>What would you like help with?<select aria-label="What would you like help with?" value={focus} onChange={event => setFocus(event.target.value)}>{TRAINING_FOCUSES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Anything you’d like your trainer to know? (optional)<textarea aria-label="Anything you’d like your trainer to know? (optional)" rows="3" maxLength={1500} value={form.notes} onChange={event => setForm(old=>({...old,notes:event.target.value}))} placeholder="For example: pulling on walks or jumping on visitors"/></label>
      <div className="first-visit-actions"><button className="button" type="submit">Choose a first visit →</button><a className="button button-ghost" href="tel:+16058242767">Talk to Bravo</a></div>
    </form>
    <details className="home-availability"><summary>Need a different starting point?</summary><p>For aggression or difficult handling, start with a <Link to="/behavior-assessment">two-trainer assessment</Link>.</p><button type="button" className="quiet-button" onClick={onFullSchedule}>Open the full scheduler</button><p><Link to="/schedule">Existing member? Manage your schedule →</Link></p></details>
  </Editable>;
}
