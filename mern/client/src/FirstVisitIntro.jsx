import BookingProgress from './BookingProgress';
import SpecialistScope from './SpecialistScope';
import { Editable } from './SiteContent';
import { Link } from 'react-router-dom';
import { money, TRAINING_ADDITIONAL_DOG_CENTS, TRAINING_FOCUSES, isSpecialistFocus } from '../../shared/catalog';
export default function FirstVisitIntro({ form, setForm, dogCount, setDogCount, focus, setFocus, cents, additionalDogCents = TRAINING_ADDITIONAL_DOG_CENTS, withLessons = false, onContinue, onFullSchedule, onStageChange, trainerReady, visitReady }) {
  const specialist = isSpecialistFocus(focus);
  return <Editable as="section" contentKey="first-visit-intro" className="panel first-visit-intro">
    <div className="booking-returning"><strong>New to Bravo? Start here.</strong><Editable as={Link} contentKey="copy-firstvisitintro-16" canEditText canEditLink to="/schedule">Already training with Bravo? My Schedule →</Editable></div>
    <BookingProgress current="dog" onChange={onStageChange} trainerReady={trainerReady} visitReady={visitReady}/>
    <Editable as="h2" contentKey="first-visit-title" canEditText>Let’s start with your dog.</Editable>
    <div className="price-total"><span>{specialist ? (withLessons ? 'Obedience foundations + lessons' : 'Obedience foundations') : withLessons ? 'Training + lessons' : 'Private training'} · {dogCount} {dogCount === 1 ? 'dog' : 'dogs'}</span><strong>{money(cents + (dogCount - 1) * additionalDogCents)}<Editable as="small" contentKey="copy-firstvisitintro-1" canEditText>/month</Editable></strong></div>
    <Editable as="p" contentKey="first-visit-renewal-short" canEditText className="first-visit-essential">Manual renewal · no automatic payment. Choose your trainer and date next.</Editable>
    <form onSubmit={event => { event.preventDefault(); onContinue(); }}>
      <div className="form-grid"><label><Editable as="span" contentKey="copy-firstvisitintro-3" canEditText>Dog’s name</Editable><input aria-label="Dog’s name" required maxLength={80} autoComplete="off" value={form.dogName} onChange={event => setForm(old => ({ ...old, dogName:event.target.value }))}/></label>
      <label><Editable as="span" contentKey="copy-firstvisitintro-4" canEditText>Number of dogs</Editable><input aria-label="Number of dogs" type="number" min="1" max="10" required value={dogCount} onChange={event => setDogCount(Math.max(1,Math.min(10,Number(event.target.value)||1)))}/></label></div>
      <label><Editable as="span" contentKey="copy-firstvisitintro-5" canEditText>What would you like help with?</Editable><select aria-label="What would you like help with?" value={focus} onChange={event => setFocus(event.target.value)}>{TRAINING_FOCUSES.map(item => <option key={item.id} value={item.id}>{item.id === 'basic-obedience' ? 'Pulling, jumping, puppy manners or basic obedience' : item.id === 'advanced-obedience' ? 'Build on existing obedience skills' : item.name}</option>)}</select></label>
      <label><Editable as="span" contentKey="copy-firstvisitintro-6" canEditText>Anything you’d like your trainer to know? (optional)</Editable><textarea aria-label="Anything you’d like your trainer to know? (optional)" rows="3" maxLength={1500} value={form.notes} onChange={event => { const notes = event.currentTarget.value; setForm(old=>({...old,notes})); }} placeholder="For example: pulling on walks or jumping on visitors"/></label>
      <SpecialistScope focus={focus} withLessons={withLessons}/>
      <details className="first-visit-details">
        <Editable as="summary" contentKey="first-visit-details-label" canEditText>How visits and monthly training work</Editable>
        <Editable as="p" contentKey="first-visit-copy" canEditText>Tell us what’s difficult with your dog. Start with one visit, or plan your whole month below. Both use the same monthly training membership.</Editable>
        <Editable as="p" contentKey="first-visit-terms" canEditText>Up to five private, one-hour visits per week, Monday–Friday. Renew manually each month; no automatic payment. Choose your trainer and first visit before creating an account.</Editable>
        {withLessons && <Editable as="p" contentKey="copy-firstvisitintro-2" canEditText>Includes online lesson access for one month. Your booking summary shows the current bundle price.</Editable>}
        <Link className="booking-guide-link" to="/how-to">Watch the booking walkthrough →</Link>
      </details>
      <div className="first-visit-recommendation"><Editable as="strong" contentKey={specialist ? (withLessons ? "specialist-booking-bundle-start" : "specialist-booking-start") : "copy-firstvisitintro-7"} canEditText>{specialist ? (withLessons ? "Your starting program: obedience foundations + lessons" : "Your starting program: obedience foundations only") : "Your starting program: private training"}</Editable><p><Editable as="span" contentKey="copy-firstvisitintro-8" canEditText>One trainer, your household, and a plan for your dog. For aggression or difficult handling, </Editable><Editable as={Link} contentKey="copy-firstvisitintro-9" canEditText canEditLink to="/behavior-assessment">start with a two-trainer assessment</Editable>.</p></div>
      <div className="first-visit-actions"><Editable as="button" contentKey={specialist ? "specialist-booking-continue" : "copy-firstvisitintro-10"} canEditText className="button" type="submit">{specialist ? "Choose a trainer for obedience →" : "Choose a trainer →"}</Editable><Editable as="button" contentKey={specialist ? "specialist-booking-month" : "copy-firstvisitintro-15"} canEditText type="button" className="button button-ghost" onClick={onFullSchedule}>{specialist ? "Plan a month of obedience foundations" : "Plan my entire month"}</Editable><Editable as="a" contentKey="copy-firstvisitintro-11" canEditText canEditLink className="button button-ghost" href="tel:+16058242767">Talk to Bravo</Editable></div>
      <p className="booking-request-note">Choosing dates does not confirm an appointment. Review your request before submitting; Bravo confirms visits separately.</p>
    </form>

  </Editable>;
}
