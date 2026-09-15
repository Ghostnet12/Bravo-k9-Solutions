// Existing Facebook proof stays available until an administrator replaces it.
export const DEFAULT_PROOF_VIDEOS = [
  { id: '1850999522754029', title: 'Consistency in the real world', description: 'Two dogs holding structure during a nighttime public training session.', poster: '/images/proof/bravo-proof-consistency.jpg' },
  { id: '1068433732560103', title: 'Off-leash vocal direction', description: 'Beginning service-dog work using left and right vocal commands.', poster: '/images/proof/bravo-proof-service-dog.jpg' },
  { id: '1079472767813329', title: 'Confidence around distractions', description: 'Beau’s first real-world exposure visit in an unfamiliar environment.', poster: '/images/proof/bravo-proof-real-world.jpg' },
].map((clip, order) => ({ ...clip, order, revision: 0, src: null, facebookUrl: `https://www.facebook.com/reel/${clip.id}/` }));

export const PROOF_PAGE_SIZE = 24;
export const PROOF_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
// Accept only Facebook Reel destinations, never arbitrary redirect URLs.
export function normalizeFacebookReelUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const text = value.trim();
    const url = new URL(/^(?:www\.|m\.|mbasic\.)?facebook\.com\//i.test(text) ? `https://${text}` : text);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !['facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com'].includes(url.hostname)) return null;
    const reel = /^\/reel\/(\d+)\/?$/.exec(url.pathname);
    if (reel) return `https://www.facebook.com/reel/${reel[1]}/`;
    const share = /^\/share\/r\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    return share ? `https://www.facebook.com/share/r/${share[1]}/` : null;
  } catch { return null; }
}
export function proofVideoType(file) {
  if (PROOF_VIDEO_TYPES.includes(file.type)) return file.type;
  return /\.mp4$/i.test(file.name) ? 'video/mp4' : /\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : '';
}
export const compareProofVideos = (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
