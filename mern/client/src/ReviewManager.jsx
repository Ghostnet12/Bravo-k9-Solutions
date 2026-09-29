import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import ActionFeedback from './ActionFeedback';
import ReviewPreview from './ReviewPreview';
import ReviewStars from './ReviewStars';
import './review-manager.css';

const emptyReview = () => ({ authorName: '', body: '', rating: null, source: 'Client review' });
export default function ReviewManager() {
  const [reviews, setReviews] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [editing, setEditing] = useState(null);
  const [query, setQuery] = useState(''), [removed, setRemoved] = useState(false);
  const form = useRef(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setReviews((await api('/admin/reviews')).reviews); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  function edit(review) {
    setEditing(review ? { ...review } : emptyReview()); setError(''); setNotice('');
    requestAnimationFrame(() => { form.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); form.current?.querySelector('input')?.focus({ preventScroll: true }); });
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { id, authorName, body, rating, source, revision, kind } = editing;
      const result = await api(`/admin/reviews${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: { authorName, body, rating, ...(kind === 'customer' ? {} : { source }), ...(id ? { expectedRevision: revision } : {}) } });
      setReviews(rows => id ? rows.map(row => row.id === id ? result.review : row) : [...rows, result.review]);
      if (!id) { setRemoved(false); setQuery(''); }
      setEditing(null); setNotice(id ? 'Review changes saved.' : 'Review added to the website.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function changeVisibility(review) {
    if (!review.hidden && !window.confirm(`Remove ${review.authorName}’s review from the website? You can restore it from Removed reviews.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/admin/reviews/${review.id}`, { method: review.hidden ? 'PATCH' : 'DELETE', body: { expectedRevision: review.revision, ...(review.hidden ? { hidden: false } : {}) } });
      setReviews(rows => rows.map(row => row.id === review.id ? result.review : row));
      setNotice(review.hidden ? 'Review restored.' : 'Review removed from the website.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const visible = reviews.filter(review => !!review.hidden === removed && `${review.authorName} ${review.body} ${review.source}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="owner-review-manager" aria-labelledby="owner-reviews-title">
    <div className="section-label"><div><p className="kicker gold">OWNER CONTROLS</p><h2 id="owner-reviews-title">Manage reviews.</h2></div><button type="button" className="button button-small" disabled={busy || loading} onClick={() => edit(null)}>Add review</button></div>
    <p>Manage imported reviews and customer account reviews in one place.</p>
    <ActionFeedback error={error} notice={notice} onDismiss={() => { setError(''); setNotice(''); }}/>
    {editing && <form ref={form} className="panel review-editor" onSubmit={save} aria-label={editing.id ? 'Edit review' : 'Add review'}>
      <h3>{editing.id ? 'Edit review' : 'Add a review'}</h3>
      <fieldset disabled={busy}>
        <label>Reviewer name<input aria-label="Reviewer name" required minLength={2} maxLength={100} value={editing.authorName} onChange={event => setEditing(row => ({ ...row, authorName: event.target.value }))}/></label>
        <div className="form-grid">
          {editing.kind === 'customer' ? <p className="helper">Submitted through a Bravo account. Only client-account reviews appear publicly.</p> : <label>Review source<select aria-label="Review source" value={editing.source} onChange={event => setEditing(row => ({ ...row, source: event.target.value }))}>{['Client review', 'Google review', 'Facebook recommendation', 'Facebook comment'].map(source => <option key={source}>{source}</option>)}</select></label>}
          <label>Star rating<select aria-label="Star rating" value={editing.rating ?? ''} onChange={event => setEditing(row => ({ ...row, rating: event.target.value ? Number(event.target.value) : null }))}>{editing.kind !== 'customer' && <option value="">No star rating provided</option>}{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? 'star' : 'stars'}</option>)}</select></label>
        </div>
        <label>Review text<textarea aria-label="Review text" required minLength={10} maxLength={editing.kind === 'customer' ? 1200 : 4000} rows={7} value={editing.body} onChange={event => setEditing(row => ({ ...row, body: event.target.value }))}/></label>
        <p className="helper">Use the customer’s words and only include a star rating they provided.</p>
        <div className="record-actions"><button className="button" type="submit">{busy ? 'Saving…' : editing.id ? 'Save changes' : 'Publish review'}</button><button className="quiet-button" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
      </fieldset>
    </form>}
    <div className="panel review-manager-filters"><label>Search reviews<input aria-label="Search reviews" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Reviewer name or words"/></label><label className="check-label"><input aria-label="Removed reviews" type="checkbox" checked={removed} onChange={event => setRemoved(event.target.checked)}/>Removed reviews</label><button type="button" className="quiet-button" disabled={busy || loading} onClick={load}>Reload reviews</button></div>
    {loading ? <p role="status">Loading reviews…</p> : <div className="admin-bookings">{visible.length ? visible.map(review => <article className="panel managed-review" key={review.id} aria-label={`Review by ${review.authorName}`}>
      <div className="record-top">{review.rating != null ? <ReviewStars rating={review.rating}/> : <span className="badge">No star rating</span>}<small>{review.source}</small>{review.hidden && <span className="badge">Removed</span>}</div>
      <h3>{review.authorName}</h3><ReviewPreview body={review.body} author={review.authorName}/>
      <div className="record-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => edit(review)}>Edit review</button><button type="button" className={`quiet-button${review.hidden ? '' : ' danger-link'}`} disabled={busy} onClick={() => changeVisibility(review)}>{review.hidden ? 'Restore review' : 'Remove review'}</button></div>
    </article>) : <p className="panel">{removed ? 'No removed reviews match.' : 'No reviews match.'}</p>}</div>}
  </section>;
}
