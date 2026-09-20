export default function ReviewStars({ rating }) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return <div className="review-stars review-stars--gold" role="img" aria-label={`${value} out of 5 stars`}>
    <span aria-hidden="true">{'★'.repeat(value)}<span className="review-stars-empty">{'☆'.repeat(5 - value)}</span></span>
  </div>;
}
