// Keep the original source/key so published edits and undo remain compatible.
export const CINEMATIC_HERO_SRCSET = [600, 900, 1200].map(width => `/images/mobile-bravo-cinematic-${width}.webp ${width}w`).concat('/images/mobile-bravo-cinematic.webp 1536w').join(', ');
export const CINEMATIC_HERO_SIZES = '100vw';
