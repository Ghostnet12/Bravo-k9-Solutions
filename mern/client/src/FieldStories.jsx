import './bravo-motion.css';
import { useEffect, useRef, useState } from 'react';
import useStoryRail from './useStoryRail';
import { Editable } from './SiteContent';
import { publishedFieldStories } from '../../shared/field-experience';
export default function FieldStories({ clips, onChoose }) {
  const stories = publishedFieldStories(clips);
  const { rail, position, overflow, go, handlers } = useStoryRail(stories.map(story => story.key));
  const section = useRef(null), [nearby, setNearby] = useState(false);
  useEffect(() => {
    if (nearby || !stories.length) return;
    if (typeof IntersectionObserver !== 'function') { setNearby(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '400px' });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, [nearby, stories.length]);
  if (!stories.length) return null;
  return <section ref={section} id="field-stories" className="field-stories" aria-labelledby="field-stories-title" data-proof-action="">
    <div className="field-stories-heading" data-reveal=""><Editable as="h3" contentKey="field-stories-title" canEditText id="field-stories-title">Featured sessions</Editable></div>
    <div ref={rail} id="field-story-rail" className="field-story-grid" role="region" aria-label="Browse Bravo Field Stories" tabIndex={0} {...handlers}>{stories.map(story => <article key={story.key} className="field-story-card" data-reveal="">
      <button className="field-story-image" type="button" onClick={() => onChoose(story.clip.id)} aria-label={`View session: ${story.clip.title}`}>
        {story.clip.poster ? <img src={nearby ? story.clip.poster : undefined} alt="" loading="lazy" width="480" height="320" data-site-image-ignore=""/> : <img src="/bravo-shield-192.png" alt="" width="192" height="192" loading="lazy" data-site-image-ignore=""/>}<span aria-hidden="true">View session ↗</span>
      </button>
      <div className="field-story-copy"><p className="cinema-eyebrow">{story.chapter}</p><h4>{story.clip.title}</h4><p className="field-story-note">{story.clip.description}</p>
        <details><summary><Editable as="span" contentKey={`field-story-${story.key}-question`} canEditText>{story.question}</Editable></summary><Editable as="p" contentKey={`field-story-${story.key}-notice`} canEditText>{story.notice}</Editable></details>
        <small>{story.clip.facebookUrl ? 'Opens the original Facebook Reel from the library below.' : 'Recorded Bravo session · play it in the library below.'}</small>
      </div>
    </article>)}</div>
    {stories.length > 1 && <div className="field-story-controls" hidden={!overflow} data-proof-action="">
      <button type="button" onClick={() => go(-1)} disabled={position === 0} aria-controls="field-story-rail" aria-label="Previous Field Story">← <span>Previous</span></button>
      <p role="status" aria-live="polite"><span className="sr-only">Field Story </span>{position + 1} of {stories.length}</p>
      <button type="button" onClick={() => go(1)} disabled={position === stories.length - 1} aria-controls="field-story-rail" aria-label="Next Field Story"><span>Next</span> →</button>
    </div>}
  </section>;
}
