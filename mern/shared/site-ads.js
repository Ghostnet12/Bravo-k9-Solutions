export const DEFAULT_HOME_ADS = Object.freeze([
  Object.freeze({
    id: 'saturday-workshop-october-3',
    title: 'Saturday Dog Training Workshop',
    alt: 'Bravo K9 Solutions Saturday Dog Training Workshop at Wiley Park in Aberdeen, South Dakota, Saturday October 3 from 12:00 PM to 2:00 PM.',
    link: '/contact',
    image: '/images/saturday-workshop-october-3.jpeg',
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

export function normalizeAdSettings(value = {}) {
  const seconds = Number(value?.autoplaySeconds);
  return { autoplaySeconds: Number.isFinite(seconds) ? Math.min(20, Math.max(3, Math.round(seconds))) : DEFAULT_AD_CAROUSEL.autoplaySeconds };
}

export function cloneDefaultAds() {
  return DEFAULT_HOME_ADS.map(ad => ({ ...ad }));
}
