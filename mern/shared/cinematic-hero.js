// A dedicated asset keeps the previous hero and its published edits intact.
export const CINEMATIC_HERO_SOURCE = '/images/hero-real-confidence.webp';
export const CINEMATIC_HERO_KEY = 'asset-hero-real-confidence.webp';
export const CINEMATIC_HERO_ALT = 'A German Shepherd sitting calmly beside its handler on a sunlit sidewalk';
export const CINEMATIC_HERO_SRCSET = [600, 900].map(width => `/images/hero-real-confidence-${width}.webp ${width}w`).concat(`${CINEMATIC_HERO_SOURCE} 1024w`).join(', ');
export const CINEMATIC_HERO_SIZES = '(min-width: 1577px) 820px, (min-width: 701px) 52vw, 100vw';
