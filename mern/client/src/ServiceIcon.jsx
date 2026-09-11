export default function ServiceIcon({ service, className = '' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    training: <><path d="M8 14c-2.5-1.5-3.8-4.2-2.5-6.7C6.8 4.8 9.8 4 12 5.4c2.2-1.4 5.2-.6 6.5 1.9 1.3 2.5 0 5.2-2.5 6.7"/><path d="M8 14c1.2 1.2 2.5 1.8 4 1.8s2.8-.6 4-1.8M9.5 10.5h.01M14.5 10.5h.01M9 18h6"/></>,
    walking: <><path d="M8.2 15.8 16 8a3.4 3.4 0 1 0-4.8-4.8L3.4 11a3.4 3.4 0 0 0 4.8 4.8Z"/><path d="m10.5 13.5 1.8 1.8a3.3 3.3 0 0 1 0 4.7 3.3 3.3 0 0 1-4.7 0l-1.8-1.8"/></>,
    aggression: <><path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    online: <><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="m10 8 5 2.5-5 2.5V8ZM8 21h8M12 17v4"/></>,
  };
  return <span className={`service-icon ${className}`} aria-hidden="true"><svg viewBox="0 0 24 24" {...common}>{paths[service] || paths.training}</svg></span>;
}
