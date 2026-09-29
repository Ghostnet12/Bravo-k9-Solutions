const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function reviewExcerpt(review) {
  const text = String(review.body || ''), opening = text.slice(0, 180);
  return review.excerpt && text.includes(review.excerpt) ? review.excerpt : text.length > 180 ? opening.slice(0, opening.lastIndexOf(' ') > 0 ? opening.lastIndexOf(' ') : 180) : text;
}
function card(review) {
  const body = String(review.body || ''), excerpt = reviewExcerpt(review), rating = review.rating;
  const stars = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? `<div class="review-stars review-stars--gold" role="img" aria-label="${rating} out of 5 stars"><span aria-hidden="true">${'★'.repeat(rating)}<span class="review-stars-empty">${'☆'.repeat(5 - rating)}</span></span></div>` : '';
  const copy = excerpt === body ? `<blockquote class="review-copy"><p>${escape(body)}</p></blockquote>` : `<div class="review-copy"><blockquote class="review-excerpt"><p>${body.startsWith(excerpt) ? '' : '…'}${escape(excerpt)}${body.endsWith(excerpt) ? '' : '…'}</p></blockquote><details class="review-full"><summary><span class="review-read-more">Read full review</span><span class="review-read-less">Show less</span><span class="sr-only"> by ${escape(review.authorName)}</span></summary><blockquote><p>${escape(body)}</p></blockquote></details></div>`;
  return `<article class="panel">${stars}<small>${escape(review.source)}</small>${copy}<strong>${escape(review.authorName)}</strong></article>`;
}
export function recommendationMarkup(reviews) {
  if (!reviews?.length) return '';
  return `<h3 id="facebook-recommendations-title">What our clients say</h3><p class="facebook-recommendations-intro">Shared by Bravo clients.</p><div class="review-grid home-proof-reviews">${reviews.slice(0, 3).map(card).join('')}</div>${reviews.length > 3 ? `<details class="facebook-recommendations-more"><summary>More client reviews <span aria-hidden="true">+</span></summary><div class="review-grid home-proof-reviews">${reviews.slice(3).map(card).join('')}</div></details>` : ''}<a class="inline-link facebook-recommendations-link" href="https://www.facebook.com/share/1DcYgGp3Sj/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Visit Bravo on Facebook (opens in a new tab)">Visit Bravo on Facebook <span aria-hidden="true">↗</span></a>`;
}
export function reviewHighlightMarkup(reviews) {
  const review = reviews?.[0];
  return review ? `<blockquote>“${escape(reviewExcerpt(review))}”</blockquote><p>${escape(review.authorName)} · ${escape(review.source)}</p><a class="inline-link" href="/#reviews">Read client experiences →</a>` : '';
}
