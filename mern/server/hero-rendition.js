import { createHash } from 'node:crypto';
import { HERO_FILM_RENDITIONS, OPTIMIZED_HERO_FILM_SRC, OPTIMIZED_HERO_POSTER } from '../shared/hero-film.js';

// A delivery copy of the published film, with its complete duration and framing.
// Match the actual upload, never its revision alone: replacement videos and
// isolated test databases must continue using their own media.
export function heroRendition(row) {
  if (!row?.uploadId) return null;
  const rendition = HERO_FILM_RENDITIONS[createHash('sha256').update(row.uploadId).digest('hex')];
  if (!rendition || (row._id && String(row._id) !== rendition.id)) return null;
  return rendition.src;
}
export function heroPosterRendition(row) {
  return row?.revision === 1 && row.hasPoster && heroRendition(row) === OPTIMIZED_HERO_FILM_SRC ? OPTIMIZED_HERO_POSTER : null;
}
