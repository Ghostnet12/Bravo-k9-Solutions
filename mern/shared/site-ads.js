export const DEFAULT_HOME_ADS = Object.freeze([
  Object.freeze({
    id: 'saturday-workshop-october-3',
    title: 'Saturday Dog Training Workshop',
    alt: 'Bravo K9 Solutions Saturday Dog Training Workshop at Wiley Park in Aberdeen, South Dakota, Saturday October 3 from 12:00 PM to 2:00 PM.',
    link: '/workshops',
    image: '/images/saturday-workshop-october-3.webp',
    enabled: true,
  }),
]);

export const DEFAULT_AD_CAROUSEL = Object.freeze({ autoplaySeconds: 7 });

export const SITE_AD_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function safeAdLink(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('//') && !/[\u0000-\u001f]/.test(text)) return text.slice(0, 1000);
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString().slice(0, 1000) : '';
  } catch { return ''; }
}

// These published campaigns inherited the old Contact default. Resolve only
// their known legacy records; unrelated ads and later explicit edits win.
const LEGACY_AD_DESTINATIONS = Object.freeze([
  ['saturday-workshop-october-3', 'Saturday Dog Training Workshop', '/workshops'],
  ['ad-b3df1e50-01ff-498b-8ddf-e6c3271a125a', 'Online courses', '/learn'],
  ['ad-2b5c8355-930e-40dc-b036-4c99a92cf18c', 'Gunner', '/#specialist-training'],
  ['ad-84622f25-49c4-46b4-9fab-f48956a8988e', 'Saturday workshops', '/workshops'],
  ['ad-25871280-b5a3-430c-bac6-22da0edc2009', 'No treats or toys', '/dog-training'],
  ['ad-10a0021e-75de-42e1-9944-2f89ebdea4f3', 'Live', '/live'],
].map(entry => Object.freeze(entry)));

export function resolveAdDestination(ad = {}) {
  const link = safeAdLink(ad.link || '');
  if (ad.destinationConfigured === true || link !== '/contact') return link;
  const campaign = LEGACY_AD_DESTINATIONS.find(([id, title]) => ad.id === id && ad.title === title);
  return campaign?.[2] || link;
}

export function normalizeAdSettings(value = {}) {
  const seconds = Number(value?.autoplaySeconds);
  return { autoplaySeconds: Number.isFinite(seconds) ? Math.min(20, Math.max(3, Math.round(seconds))) : DEFAULT_AD_CAROUSEL.autoplaySeconds };
}

export function cloneDefaultAds() {
  return DEFAULT_HOME_ADS.map(ad => ({ ...ad }));
}
