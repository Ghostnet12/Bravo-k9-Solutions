import { useRef, useState, useSyncExternalStore } from 'react';
import { Editable } from './SiteContent';
import { getSiteImages } from './site-image-state';
import { framingStyle } from '../../shared/site-images';
import { HOME_HERO_SOURCE, HOME_HERO_ALT } from '../../shared/home-hero';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const steps = [
  { id: 'trust', label: 'Trust.', key: 'copy-home-11', title: 'First, we get to know your dog.', copy: 'Talk through your goals while we observe your dog’s behavior and everyday surroundings.', detail: 'Bring your questions. Tell us what happens at home, on walks and around distractions. Your first visit starts with a conversation.', caption: 'Understand the dog. Understand the goal.' },
  { id: 'train', label: 'Train.', key: 'copy-home-12', title: 'Watch it. Practice it. Build on it.', copy: 'Watch your trainer demonstrate, then practice clear communication with their guidance.', detail: 'Work alongside your trainer. Ask questions, try the handling together and leave with a clear idea of what to practice.', caption: 'Clear guidance. Practice together.' },
  { id: 'deploy', label: 'Deploy.', key: 'copy-home-13', title: 'Take the practice into everyday life.', copy: 'Know what to practice between visits and how to use it in your dog’s daily routine.', detail: 'Put your trainer’s guidance to work in familiar situations. Bring your progress and questions to the next session so the plan can keep developing.', caption: 'Real places. Everyday practice.' },
];

export default function TrainingJourney() {
  const interactive = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [selected, setSelected] = useState(0);
  const [photo] = useState(() => getSiteImages()['home-method']);
  const buttons = useRef([]);
  function move(event, index) {
    const next = event.key === 'ArrowRight' ? (index + 1) % steps.length : event.key === 'ArrowLeft' ? (index + steps.length - 1) % steps.length : event.key === 'Home' ? 0 : event.key === 'End' ? steps.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setSelected(next); buttons.current[next]?.focus();
  }
  return <div className="training-journey" data-interactive={interactive}>
    <div className="journey-tabs" role={interactive ? 'tablist' : undefined} aria-label="Explore the Bravo approach">
      {steps.map((step, index) => {
        const Tag = interactive ? 'button' : 'div';
        return <Tag className="journey-tab" key={step.id} id={`journey-tab-${step.id}`} {...(interactive ? { type: 'button', role: 'tab', 'aria-selected': selected === index, 'aria-controls': `journey-panel-${step.id}`, tabIndex: selected === index ? 0 : -1, onClick: () => setSelected(index), onKeyDown: event => move(event, index), ref: node => { buttons.current[index] = node; } } : {})}>
          <span className="journey-index" aria-hidden="true">0{index + 1}</span>
          <Editable as="span" contentKey={step.key} canEditText>{step.label}</Editable>
        </Tag>;
      })}
    </div>
    <div className="journey-stage">
      <div className="journey-photo">
        <img src={photo?.src || HOME_HERO_SOURCE} data-site-image-key="home-method" width="828" height="1121" alt={photo?.framed ? photo.alt : HOME_HERO_ALT} style={photo?.framed ? framingStyle(photo) : undefined} loading="lazy"/>
        <div className="journey-photo-caption" key={selected}><span>THE BRAVO APPROACH</span><Editable as="p" contentKey={`journey-${steps[selected].id}-caption`} canEditText>{steps[selected].caption}</Editable></div>
      </div>
      <div className="journey-panels">
        {steps.map((step, index) => <section className="journey-panel" key={step.id} id={`journey-panel-${step.id}`} hidden={interactive && selected !== index} role={interactive ? 'tabpanel' : undefined} aria-labelledby={`journey-tab-${step.id}`} tabIndex={interactive ? 0 : undefined}>
          <span className="journey-panel-number" aria-hidden="true">0{index + 1}<small> / 03</small></span>
          <Editable as="h3" contentKey={`journey-${step.id}-title`} canEditText>{step.title}</Editable>
          <Editable as="p" contentKey={`home-method-${step.id}-copy`} canEditText>{step.copy}</Editable>
          <Editable as="p" contentKey={`journey-${step.id}-detail`} canEditText className="journey-detail">{step.detail}</Editable>
        </section>)}
      </div>
    </div>
  </div>;
}
