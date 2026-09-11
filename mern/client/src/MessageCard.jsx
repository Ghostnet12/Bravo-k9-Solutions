const stamp = value => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function MessageCard({ message, showClientRole = false, children }) {
  const role = message.role || message.senderRole;
  const badge = role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff' : showClientRole ? 'Client' : null;
  const kind = ['announcement', 'alert'].includes(message.kind) ? message.kind : 'message';
  return <article className={`conversation-message conversation-message--${kind}`}>
    <header className="conversation-message-heading">
      <strong>{message.authorName || message.senderName}</strong>
      {badge && <span className="badge">{badge}</span>}
      <time dateTime={message.createdAt}>{stamp(message.createdAt)}</time>
    </header>
    {message.recipientName && <small className="conversation-recipient">For {message.recipientName}</small>}
    <p>{message.body}</p>
    {children}
  </article>;
}
