// A dedicated asset keeps the previous hero and its published edits intact.
export const CINEMATIC_HERO_SOURCE = '/images/hero-real-confidence.webp';
export const CINEMATIC_HERO_KEY = 'asset-hero-real-confidence.webp';
export const CINEMATIC_HERO_ALT = 'A German Shepherd sitting calmly beside its handler on a sunlit sidewalk';
export const CINEMATIC_HERO_SRCSET = [600, 900].map(width => `/images/hero-real-confidence-${width}.webp ${width}w`).concat(`${CINEMATIC_HERO_SOURCE} 1024w`).join(', ');
export const CINEMATIC_HERO_SIZES = '(min-width: 1228px) 1180px, (max-width: 700px) calc(100vw - 40px), calc(100vw - 48px)';
