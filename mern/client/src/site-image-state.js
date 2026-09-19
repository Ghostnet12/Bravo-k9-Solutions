import { readHomeHero, HOME_HERO_KEY } from '../../shared/home-hero.js';

const initialHero = readHomeHero(typeof document === 'undefined' ? null : document);
let images = initialHero ? { [HOME_HERO_KEY]: initialHero } : {};

// Home and the inline editor start with the same server-published snapshot.
// Keep subsequent edits here too, including navigation away and back to Home.
export const getSiteImages = () => images;
export function setSiteImages(value) { images = value || {}; }
