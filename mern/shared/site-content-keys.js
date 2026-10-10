// Preserve the existing publishing registry while extending the customer journey.
import { CONTENT_KEYS as BASE_CONTENT_KEYS } from './site-content-base-keys.js';
export const CONTENT_KEYS = {
  ...BASE_CONTENT_KEYS,
  'nav-training-pricing': { text: true, link: true },
  'nav-bravo-approach': { text: true, link: true },
  'nav-bravo-phone': { text: true, link: true },
  'goal-not-sure': { text: true, link: true },
  'training-renewal-visible': { text: true },
  'home-specialist-4': { text: true, link: true },
};
