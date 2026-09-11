export const SITE_IMAGE_KEY = /^[a-z0-9][a-z0-9._-]{0,119}$/;
export const SITE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const isImageEditor = user => ['staff', 'owner'].includes(user?.role);
export const DAVID_IMAGE = '/images/hero-bravo-launch.webp';
// Reuse the owner-approved hero; do not invent a new likeness or replace named
// women, customer photos, dog-only photos, or the immutable Bravo branding.
const trainerScenes = new Set([
  '/images/hero-bravo-k9.webp', '/images/obedience-real-world.webp',
  '/images/training-education.webp', '/images/protection-training.webp',
  '/images/service-dog-training.webp', '/images/tracking-training.webp',
]);
export function defaultSiteImage(source) { return trainerScenes.has(source) ? DAVID_IMAGE : source; }
export function sourceImageKey(source, origin) {
  try {
    const url = new URL(source, origin);
    if (url.origin !== new URL(origin).origin) return null;
    const file = /^\/images\/([a-z0-9._-]+)$/i.exec(url.pathname);
    const lesson = /^\/api\/lessons\/([a-z0-9-]+)\/image$/.exec(url.pathname);
    const key = file ? `asset-${file[1].toLowerCase()}` : lesson ? `lesson-${lesson[1]}` : null;
    return key && SITE_IMAGE_KEY.test(key) ? key : null;
  } catch { return null; }
}
