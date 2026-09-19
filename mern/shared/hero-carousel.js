export const DEFAULT_HERO_CAROUSEL = { revision: 0, intervalSeconds: 5, photos: ['team-david-northrop', 'team-ashley-northrop'] };
export const HERO_PHOTO_DEFAULTS = {
  'team-david-northrop': { src: '/images/david-northrop.webp', alt: 'David Northrop, Bravo trainer' },
  'team-ashley-northrop': { src: '/images/ashley-northrop.webp', alt: 'Ashley Northrop, Bravo trainer' },
};
export const isHeroPhotoKey = key => Object.hasOwn(HERO_PHOTO_DEFAULTS, key) || /^hero-photo-[a-f0-9-]{36}$/.test(key);

export const heroVideoId = key => /^hero-video-([a-f0-9-]{36})$/.exec(key)?.[1] || null;
export const isHeroMediaKey = key => isHeroPhotoKey(key) || !!heroVideoId(key);
