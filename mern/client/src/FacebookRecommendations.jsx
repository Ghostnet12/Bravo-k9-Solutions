import ReviewPreview from './ReviewPreview';
import ReviewStars from './ReviewStars';
import { clientStory, featuredClientReviews } from '../../shared/client-stories';

const ReviewCard = ({ review }) => {
  const story = clientStory(review);
  return <article className={`panel${story ? ' client-story-card' : ''}`}>
  {review.rating != null && <ReviewStars rating={review.rating}/>}<small>{review.source}</small>
  {story && <><h4>{story.title}</h4><dl className="client-story-context"><div><dt>Starting point</dt><dd>{story.startingPoint}</dd></div><div><dt>Training focus</dt><dd>{story.focus}</dd></div></dl><p className="client-story-outcome-label">Their owner reported</p></>}
  <ReviewPreview body={review.body} excerpt={story?.outcome || review.excerpt} author={review.authorName}/>
  <strong>{review.authorName}</strong>
</article>;
};

export default function FacebookRecommendations({ reviews = [] }) {
  const { featured, more, hasStories } = featuredClientReviews(reviews);
  return <div className="facebook-recommendations" id="client-reviews" tabIndex={-1} data-public-reviews="" aria-labelledby={reviews.length ? 'facebook-recommendations-title' : undefined}>
    {reviews.length > 0 && <>
      <h3 id="facebook-recommendations-title">What our clients say</h3>
      <p className="facebook-recommendations-intro">{hasStories ? 'Real starting points. Progress described by their owners. Each dog and household is different.' : 'Shared by Bravo clients.'}</p>
      <div className="review-grid home-proof-reviews">{featured.map(review => <ReviewCard review={review} key={review.id}/>)}</div>
      {more.length > 0 && <details className="facebook-recommendations-more">
        <summary>More client reviews <span aria-hidden="true">+</span></summary>
        <div className="review-grid home-proof-reviews">{more.map(review => <ReviewCard review={review} key={review.id}/>)}</div>
      </details>}
      <a className="inline-link facebook-recommendations-link" href="https://www.facebook.com/share/1DcYgGp3Sj/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Visit Bravo on Facebook (opens in a new tab)">Visit Bravo on Facebook <span aria-hidden="true">↗</span></a>
    </>}
  </div>;
}
