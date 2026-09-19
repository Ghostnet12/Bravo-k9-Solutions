export const SITE_IMAGE_KEY = /^[a-z0-9][a-z0-9._-]{0,119}$/;
export const SITE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const SITE_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const MEDIA_CHUNK_BYTES = 400 * 1024;
// Administrator is the existing delegated owner role, not the public Staff title.
export const isImageEditor = user => user?.role === 'owner' && !user?.blocked;
export const DAVID_IMAGE = '/images/hero-bravo-launch.webp';
export function defaultSiteImage(source) { return source; }
// Explicit photo locations: raster logos and UI artwork must never become
// editable just because they use an <img> or live in /images.
const PHOTO_ASSETS = new Set([
  'bravo-client-training.jpeg', 'hero-bravo-k9.webp', 'hero-bravo-launch.webp', 'training-education.webp',
  'protection-training.webp', 'team-trainers.webp', 'tracking-training.webp',
  'david-northrop.webp', 'obedience-real-world.webp', 'service-dog-training.webp',
  'dog-sitting-care.webp', 'ashley-northrop.webp', 'ashley-leverock.webp', 'janet-hughes.webp',
]);
const PHOTO_SLOTS = new Set(['home-hero', 'home-training-hero', 'home-method', 'home-learning', 'learning-banner']);
export function isEditableMediaKey(key) {
  return typeof key === 'string' && SITE_IMAGE_KEY.test(key) && (
    PHOTO_SLOTS.has(key) || PHOTO_ASSETS.has(key.replace(/^asset-/, '')) && key.startsWith('asset-') ||
    /^(?:team|lesson)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || !!videoTarget(key)
  );
}
export function sourceImageKey(source, origin) {
  try {
    const url = new URL(source, origin);
    if (url.origin !== new URL(origin).origin) return null;
    const file = /^\/images\/([a-z0-9._-]+)$/i.exec(url.pathname);
    const lesson = /^\/api\/lessons\/([a-z0-9-]+)\/image$/.exec(url.pathname);
    const saved = /^\/api\/site-images\/([a-z0-9._-]+)\/image$/.exec(url.pathname);
    const key = file && PHOTO_ASSETS.has(file[1].toLowerCase()) ? `asset-${file[1].toLowerCase()}` : lesson ? `lesson-${lesson[1]}` : saved?.[1];
    return isEditableMediaKey(key) && !key.startsWith('video-') ? key : null;
  } catch { return null; }
}
export function sourceVideoKey(source, origin) {
  try {
    const url = new URL(source, origin);
    if (url.origin !== new URL(origin).origin) return null;
    const lesson = /^\/api\/lessons\/([a-z0-9-]{1,80})\/video$/.exec(url.pathname);
    const file = /^\/videos\/([a-z0-9][a-z0-9._-]{0,90}\.(?:mp4|webm))$/i.exec(url.pathname);
    return lesson ? `video-lesson-${lesson[1]}` : file ? `video-asset-${file[1].toLowerCase()}` : null;
  } catch { return null; }
}
export function videoTarget(key) {
  const lesson = /^video-lesson-([a-z0-9-]{1,80})$/.exec(key);
  const asset = /^video-asset-([a-z0-9][a-z0-9._-]{0,90}\.(?:mp4|webm))$/.exec(key);
  return lesson ? { lessonId: lesson[1], source: `/api/lessons/${lesson[1]}/video` }
    : asset ? { lessonId: null, source: `/videos/${asset[1]}` } : null;
}
export function normalizeFraming(value = {}) {
  const bounded = (n, fallback, min, max) => Number.isFinite(Number(n)) && n != null ? Math.min(max, Math.max(min, Number(n))) : fallback;
  return { alt: String(value.alt ?? ''), x: bounded(value.x, 50, 0, 100), y: bounded(value.y, 50, 0, 100), zoom: bounded(value.zoom, 1, 1, 3), fit: value.fit === 'contain' ? 'contain' : 'cover' };
}
export function mediaSettingsChanged(before, after) {
  const a = normalizeFraming(before), b = normalizeFraming(after);
  return Object.keys(a).some(key => a[key] !== b[key]);
}
// Zoom without changing the layout box or letting enlarged pixels spill out.
export function framingStyle(input) {
  const { x, y, zoom, fit } = normalizeFraming(input), inset = 1 - 1 / zoom;
  return { objectFit: fit, objectPosition: `${x}% ${y}%`, transformOrigin: `${x}% ${y}%`, transform: `scale(${zoom})`, clipPath: zoom === 1 ? 'none' : `inset(${y * inset}% ${(100 - x) * inset}% ${(100 - y) * inset}% ${x * inset}%)` };
}
