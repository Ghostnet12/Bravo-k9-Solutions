import { normalizeFraming } from './site-images.js';

// A new photo slot preserves the previous hero and its saved framing.
export const HOME_HERO_KEY = 'home-training-hero';
export const HOME_HERO_SOURCE = '/images/bravo-client-training.jpeg';
export const HOME_HERO_ALT = 'Bravo training session: a dog sitting attentively beside its trainer in a store aisle';
export const HOME_HERO_META = 'bravo-home-hero';

// Only public photo metadata belongs in the document. Never embed a database
// record, upload ID, user information, or an arbitrary URL in the page head.
export function homeHeroSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  const source = `/api/site-images/${HOME_HERO_KEY}/image?v=${revision}`;
  return {
    ...normalizeFraming(value),
    alt: String(value.alt ?? '').slice(0, 240),
    revision,
    src: value.src === source ? source : null,
    framed: value.framed ?? value.src === source,
    canUndo: value.canUndo === true,
  };
}

export function readHomeHero(document) {
  try {
    return homeHeroSnapshot(JSON.parse(document?.querySelector(`meta[name="${HOME_HERO_META}"]`)?.content || 'null'));
  } catch { return null; }
}
