export const FUNNEL_STAGES = ['visit', 'homepage_viewed', 'goal_selected', 'booking_started', 'trainer_step', 'visit_step', 'review_step', 'hero_booking_clicked', 'sticky_booking_clicked', 'pricing_viewed', 'pricing_booking_clicked', 'dog_step_completed', 'trainer_step_completed', 'visit_step_completed'];
// Only fixed labels cross the monitoring boundary. Never accept URL parameters,
// messages, form fields, account identifiers, or arbitrary event properties.
export const CHANNELS = ['direct', 'search', 'social', 'referral'];
export const CLIENT_ERRORS = ['page_crash', 'script_error', 'unhandled_promise', 'network_error', 'request_timeout'];
export const PUBLIC_PAGES = ['/', '/dog-training', '/dog-walking', '/behavior-assessment', '/contact', '/accessibility', '/media-rights', '/workshops', '/learn'];
export function routeArea(path = '') {
  const clean = String(path).split(/[?#]/)[0];
  if (clean === '/') return 'home';
  if (PUBLIC_PAGES.includes(clean)) return clean.slice(1);
  if (/^\/api\/config\/?$/.test(clean)) return 'configuration';
  if (/^\/api\/(site-content|site-banner|site-ads)(\/|$)/.test(clean)) return 'content';
  if (/^\/(api\/)?live(\/|$)/.test(clean)) return 'live';
  if (/^\/api\/(proof-videos|reviews)(\/|$)/.test(clean)) return 'proof';
  if (/^\/api\/team(\/|$)/.test(clean)) return 'team';
  if (/^\/(api\/)?(auth|account|reset-password)(\/|$)/.test(clean)) return 'account';
  if (/^\/api\/stripe(\/|$)/.test(clean) || /^\/api\/bookings\/[^/]+\/checkout$/.test(clean)) return 'checkout';
  if (/^\/(api\/)?(admin|site-images)(\/|$)/.test(clean)) return 'team';
  if (/^\/(api\/)?(client-schedule|schedule)(\/|$)/.test(clean)) return 'schedule';
  if (/^\/(api\/)?(portal|bookings|availability|quote)(\/|$)/.test(clean)) return 'booking';
  if (/^\/(api\/)?(learn|lessons)(\/|$)/.test(clean)) return 'lessons';
  if (/^\/(api\/)?(community|messages|notifications)(\/|$)/.test(clean)) return 'messages';
  return 'other';
}
export const AREAS = [...new Set([...PUBLIC_PAGES.map(routeArea), 'configuration', 'content', 'live', 'proof', 'account', 'checkout', 'team', 'schedule', 'booking', 'lessons', 'messages', 'other'])];
