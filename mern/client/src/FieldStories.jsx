import { Editable } from './SiteContent';
import { publishedFieldStories } from '../../shared/field-experience';
export default function FieldStories({ clips, onChoose }) {
  const stories = publishedFieldStories(clips);
  if (!stories.length) return null;
  return <section id="field-stories" className="field-stories" aria-labelledby="field-stories-title" data-proof-action="">
    <div className="field-stories-heading"><div><Editable as="p" contentKey="field-stories-eyebrow" canEditText className="cinema-eyebrow">BRAVO FIELD STORIES</Editable><Editable as="h3" contentKey="field-stories-title" canEditText id="field-stories-title">Real sessions. A closer look.</Editable></div><Editable as="p" contentKey="field-stories-intro" canEditText>Meet the work behind the results. Start with a session, then see what to notice.</Editable></div>
    <div className="field-story-grid">{stories.map(story => <article key={story.key} className="field-story-card">
      <button className="field-story-image" type="button" onClick={() => onChoose(story.clip.id)} aria-label={`View session: ${story.clip.title}`}>
        {story.clip.poster ? <img src={story.clip.poster} alt="" loading="lazy" width="480" height="320" data-site-image-ignore=""/> : <img src="/bravo-shield-192.png" alt="" width="192" height="192" loading="lazy" data-site-image-ignore=""/>}<span aria-hidden="true">View session ↗</span>
      </button>
      <div className="field-story-copy"><p className="cinema-eyebrow">{story.chapter}</p><h4>{story.clip.title}</h4><p className="field-story-note">{story.clip.description}</p>
        <details><summary><Editable as="span" contentKey={`field-story-${story.key}-question`} canEditText>{story.question}</Editable></summary><Editable as="p" contentKey={`field-story-${story.key}-notice`} canEditText>{story.notice}</Editable></details>
        <small>{story.clip.facebookUrl ? 'Opens the original Facebook Reel from the library below.' : 'Recorded Bravo session · play it in the library below.'}</small>
      </div>
    </article>)}</div>
  </section>;
}
