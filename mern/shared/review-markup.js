import { clientStory, featuredClientReviews } from './client-stories.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function reviewExcerpt(review) {
  const text = String(review.body || ''), opening = text.slice(0, 180);
  return review.excerpt && text.includes(review.excerpt) ? review.excerpt : text.length > 180 ? opening.slice(0, opening.lastIndexOf(' ') > 0 ? opening.lastIndexOf(' ') : 180) : text;
}
function card(review) {
  const story = clientStory(review);
  const body = String(review.body || ''), excerpt = story?.outcome || reviewExcerpt(review), rating = review.rating;
  const stars = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? `<div class="review-stars review-stars--gold" role="img" aria-label="${rating} out of 5 stars"><span aria-hidden="true">${'★'.repeat(rating)}<span class="review-stars-empty">${'☆'.repeat(5 - rating)}</span></span></div>` : '';
  const copy = excerpt === body ? `<blockquote class="review-copy"><p>${escape(body)}</p></blockquote>` : `<div class="review-copy"><blockquote class="review-excerpt"><p>${body.startsWith(excerpt) ? '' : '…'}${escape(excerpt)}${body.endsWith(excerpt) ? '' : '…'}</p></blockquote><details class="review-full"><summary><span class="review-read-more">Read full review</span><span class="review-read-less">Show less</span><span class="sr-only"> by ${escape(review.authorName)}</span></summary><blockquote><p>${escape(body)}</p></blockquote></details></div>`;
  const context = story ? `<h4>${escape(story.title)}</h4><dl class="client-story-context"><div><dt>Starting point</dt><dd>${escape(story.startingPoint)}</dd></div><div><dt>Training focus</dt><dd>${escape(story.focus)}</dd></div></dl><p class="client-story-outcome-label">Their owner reported</p>` : '';
  return `<article class="panel${story ? ' client-story-card' : ''}">${stars}<small>${escape(review.source)}</small>${context}${copy}<strong>${escape(review.authorName)}</strong></article>`;
}
export function recommendationMarkup(reviews) {
  if (!reviews?.length) return '';
  const { featured, more, hasStories } = featuredClientReviews(reviews);
  return `<h3 id="facebook-recommendations-title">What our clients say</h3><p class="facebook-recommendations-intro">${hasStories ? 'Real starting points. Progress described by their owners. Each dog and household is different.' : 'Shared by Bravo clients.'}</p><div class="review-grid home-proof-reviews">${featured.map(card).join('')}</div>${more.length ? `<details class="facebook-recommendations-more"><summary>More client reviews <span aria-hidden="true">+</span></summary><div class="review-grid home-proof-reviews">${more.map(card).join('')}</div></details>` : ''}<a class="inline-link facebook-recommendations-link" href="https://www.facebook.com/share/1DcYgGp3Sj/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Visit Bravo on Facebook (opens in a new tab)">Visit Bravo on Facebook <span aria-hidden="true">↗</span></a>`;
}
export function reviewHighlightMarkup(reviews) {
  const review = reviews?.[0];
  return review ? `<blockquote>“${escape(reviewExcerpt(review))}”</blockquote><p>${escape(review.authorName)} · ${escape(review.source)}</p><a class="inline-link" href="/#reviews" data-site-content-key="copy-goalfinder-3" data-site-content-text="true" data-site-original-text="Read client experiences →" data-site-original-link="/#reviews">Read client experiences →</a>` : '';
}
