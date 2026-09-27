import { createHash } from 'node:crypto';
import { OPTIMIZED_HERO_FILM_SRC, OPTIMIZED_HERO_POSTER } from '../shared/hero-film.js';

// A delivery copy of the published film, with its complete duration and framing.
// Match the actual upload, never its revision alone: replacement videos and
// isolated test databases must continue using their own media.
const sourceUploadHash = '334a6c2f3498baf10cb661d33651e0c9842b9c9d942881024a1f6ebe7134146e';
export function heroRendition(row) {
  if (!row?.uploadId || createHash('sha256').update(row.uploadId).digest('hex') !== sourceUploadHash) return null;
  return OPTIMIZED_HERO_FILM_SRC;
}
export function heroPosterRendition(row) {
  return row?.revision === 1 && row.hasPoster && heroRendition(row) ? OPTIMIZED_HERO_POSTER : null;
}
