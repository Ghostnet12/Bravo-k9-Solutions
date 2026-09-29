import ReviewPreview from './ReviewPreview';
import ReviewStars from './ReviewStars';

const ReviewCard = ({ review }) => <article className="panel">
  {review.rating != null && <ReviewStars rating={review.rating}/>}<small>{review.source}</small>
  <ReviewPreview body={review.body} excerpt={review.excerpt} author={review.authorName}/>
  <strong>{review.authorName}</strong>
</article>;

export default function FacebookRecommendations({ reviews = [] }) {
  const featured = reviews.slice(0, 3), more = reviews.slice(3);
  return <div className="facebook-recommendations" data-public-reviews="" aria-labelledby={reviews.length ? 'facebook-recommendations-title' : undefined}>
    {reviews.length > 0 && <>
      <h3 id="facebook-recommendations-title">What our clients say</h3>
      <p className="facebook-recommendations-intro">Shared by Bravo clients.</p>
      <div className="review-grid home-proof-reviews">{featured.map(review => <ReviewCard review={review} key={review.id}/>)}</div>
      {more.length > 0 && <details className="facebook-recommendations-more">
        <summary>More client reviews <span aria-hidden="true">+</span></summary>
        <div className="review-grid home-proof-reviews">{more.map(review => <ReviewCard review={review} key={review.id}/>)}</div>
      </details>}
      <a className="inline-link facebook-recommendations-link" href="https://www.facebook.com/share/1DcYgGp3Sj/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Visit Bravo on Facebook (opens in a new tab)">Visit Bravo on Facebook <span aria-hidden="true">↗</span></a>
    </>}
  </div>;
}
