export default function ReviewPreview({ body, excerpt, author }) {
  const text = String(body || '');
  const opening = text.slice(0, 180);
  const preview = excerpt && text.includes(excerpt) ? excerpt : text.length > 180 ? opening.slice(0, opening.lastIndexOf(' ') > 0 ? opening.lastIndexOf(' ') : 180) : text;
  if (preview === text) return <blockquote className="review-copy"><p>{text}</p></blockquote>;
  return <div className="review-copy">
    <blockquote className="review-excerpt"><p>{text.startsWith(preview) ? '' : '…'}{preview}{text.endsWith(preview) ? '' : '…'}</p></blockquote>
    <details className="review-full">
      <summary><span className="review-read-more">Read full review</span><span className="review-read-less">Show less</span><span className="sr-only"> by {author}</span></summary>
      <blockquote><p>{text}</p></blockquote>
    </details>
  </div>;
}
