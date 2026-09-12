import { normalizeFraming } from './site-images.js';

export const HOME_HERO_SOURCE = '/images/hero-bravo-launch.webp';
export const HOME_HERO_ALT = 'Professional Bravo K9 trainer working with an attentive Belgian Malinois near Aberdeen';
export const HOME_HERO_META = 'bravo-home-hero';

// Only public photo metadata belongs in the document. Never embed a database
// record, upload ID, user information, or an arbitrary URL in the page head.
export function homeHeroSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  const source = `/api/site-images/home-hero/image?v=${revision}`;
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
