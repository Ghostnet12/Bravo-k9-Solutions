import { createPortal } from 'react-dom';

// Keep action results visible even when the form is far down a long page.
// Messages remain until dismissed or replaced; errors never disappear on a timer.
export default function ActionFeedback({ error, notice, onDismiss }) {
  if (!error && !notice) return null;
  return createPortal(<aside className={`action-feedback ${error ? 'is-error' : ''}`} aria-label="Action result">
    <div role={error ? 'alert' : 'status'} aria-atomic="true"><span className="feedback-icon" aria-hidden="true">{error ? '!' : '✓'}</span><p>{error || notice}</p></div>
    <button type="button" onClick={onDismiss} aria-label="Dismiss message">×</button>
  </aside>, document.body);
}
