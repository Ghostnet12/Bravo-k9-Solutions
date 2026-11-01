import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Editable } from './SiteContent';

const steps = [
  { title: 'Your dog', heading: 'Start with your dog.', copy: 'Enter your dog’s name and what you want help with. Add another dog or optional notes if needed. The price shown is for a monthly training membership.', detail: 'Choose “Choose a trainer” for one first visit, or “Plan my entire month” for multiple visits.' },
  { title: 'Trainer', heading: 'Choose who you’ll train with.', copy: 'Use “Help me choose a trainer”, or tap a trainer’s “See dates” card. You can explore their dates before creating an account.', detail: 'Availability is checked again before sending. A full trainer may offer a waiting list; joining it does not reserve a visit or charge you.' },
  { title: 'Date and time', heading: 'Pick a day. Then a time.', copy: 'Use the next available time to go straight to review, or tap a date and choose a time below it. Times are local to Aberdeen, South Dakota.', detail: 'Use “Look for a different date” to explore further ahead. You can go back to change your trainer without sending anything.' },
  { title: 'Review', heading: 'Check it. Send it. Get confirmation.', copy: 'Check your visit and monthly total, then add your phone and visit address. Create an account or sign in right inside booking; your visit stays on the same page.', detail: 'Send your request after checking the details. Creating an account takes no payment. Bravo confirms your visit separately; membership renewal is manual.' },
];
export default function FirstVisitGuide() {
  const [selected, setSelected] = useState(0);
  const step = steps[selected];
  return <section id="first-visit-guide" className="first-visit-guide" aria-labelledby="first-guide-title">
    <Editable as="p" contentKey="first-guide-eyebrow" canEditText className="kicker gold">NEW TO BRAVO?</Editable>
    <Editable as="h2" contentKey="first-guide-title" canEditText id="first-guide-title">Book your first visit.</Editable>
    <Editable as="p" contentKey="first-guide-intro" canEditText>A quick preview of the four steps. Explore at your own pace, then start your request.</Editable>
    <div className="first-guide-steps" role="group" aria-label="Preview the booking steps">{steps.map((item,index) => <button key={item.title} type="button" aria-pressed={selected === index} aria-controls="first-guide-detail" onClick={() => setSelected(index)}><span aria-hidden="true">{index + 1}</span>{item.title}</button>)}</div>
    <div id="first-guide-detail" className="first-guide-detail" aria-live="polite" aria-atomic="true">
      <p className="first-guide-count">Step {selected + 1} of 4</p>
      <Editable as="h3" contentKey={`first-guide-${selected}-title`} canEditText>{step.heading}</Editable>
      <Editable as="p" contentKey={`first-guide-easier-${selected}-copy`} canEditText>{step.copy}</Editable>
      <Editable as="p" contentKey={`first-guide-${selected}-detail`} canEditText className="first-guide-tip">{step.detail}</Editable>
    </div>
    <div className="first-guide-controls"><button type="button" className="quiet-button" disabled={selected === 0} onClick={() => setSelected(index => index - 1)}>← Previous step</button>{selected < 3 ? <button type="button" className="button" onClick={() => setSelected(index => index + 1)}>Next step →</button> : <Link className="button" to="/portal?program=training">Start my training plan →</Link>}</div>
    <p className="first-guide-storage">Your unsent draft stays in this browser tab for up to 12 hours when storage is available. A draft does not reserve an appointment.</p>
  </section>;
}
