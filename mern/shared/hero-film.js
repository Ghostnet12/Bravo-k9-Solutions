// The opening-film playlist is independent of the breed carousel and private lessons.
export const DEFAULT_HERO_FILM = {
  id: 'opening', title: 'Bravo training film',
  description: 'Bravo dog training outdoors with its handler',
  src: '/videos/bravo-real-world.mp4', poster: '/images/bravo-film-poster.webp',
  fit: 'cover', sound: false, order: 0, revision: 0,
};

export const HERO_FILM_META = 'bravo-hero-film';
export const OPTIMIZED_HERO_FILM_SRC = '/assets/bravo-opening-565c14182176.mp4';
export const OPTIMIZED_HERO_POSTER = '/assets/bravo-opening-78f72cb21c5c.jpg';
// Published delivery copies are pinned to an upload hash and playlist entry.
// Replacing an upload automatically falls back to that new upload's own route.
export const HERO_FILM_RENDITIONS = {
  '334a6c2f3498baf10cb661d33651e0c9842b9c9d942881024a1f6ebe7134146e': { id: 'opening', src: OPTIMIZED_HERO_FILM_SRC },
  'c7879f4931fa1475d2fbbd6fa1ba4160be5012cf22301e17070fe6aaa7da2cba': { id: 'opening', src: '/assets/bravo-film-c7879f4931fa.mp4' },
  '0be42591ff57b1db021b3af7935059f980c310b58b39f89a411013251ee06f45': { id: '10c92a42-82a7-40cc-a1f1-91d29e490598', src: '/assets/bravo-film-0be42591ff57.mp4' },
};
const HERO_FILM_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

function clipSnapshot(value) {
  if (!value || typeof value !== 'object' || !HERO_FILM_ID.test(String(value.id || ''))) return null;
  const id = String(value.id);
  const revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  const routeSource = `/api/hero-film/${id}/video?v=${revision}`;
  const isOpening = id === DEFAULT_HERO_FILM.id;
  const validSource = value.src === routeSource
    || (isOpening && value.src === DEFAULT_HERO_FILM.src)
    || (revision > 0 && Object.values(HERO_FILM_RENDITIONS).some(rendition => rendition.id === id && rendition.src === value.src));
  if (!validSource) return null;
  const routePoster = `/api/hero-film/${id}/poster?v=${revision}`;
  const poster = isOpening && value.src === DEFAULT_HERO_FILM.src
    ? DEFAULT_HERO_FILM.poster
    : value.poster === routePoster || (isOpening && value.src === OPTIMIZED_HERO_FILM_SRC && revision === 1 && value.poster === OPTIMIZED_HERO_POSTER)
      ? value.poster
      : null;
  return {
    id,
    order: Number.isSafeInteger(value.order) && value.order >= 0 ? value.order : 0,
    revision,
    src: value.src,
    poster,
    title: String(value.title || (isOpening ? DEFAULT_HERO_FILM.title : 'Bravo training video')).slice(0, 120),
    description: String(value.description ?? '').slice(0, 5000),
    fit: value.fit === 'contain' ? 'contain' : 'cover',
    sound: value.sound === true,
  };
}

export function heroFilmSnapshot(value) {
  const candidate = value && typeof value === 'object' && !value.id ? { ...value, id: DEFAULT_HERO_FILM.id } : value;
  return clipSnapshot(candidate) || { ...DEFAULT_HERO_FILM };
}

export function heroFilmPlaylistSnapshot(value) {
  const legacySingle = !Array.isArray(value) && value && typeof value === 'object' && !value.id ? { ...value, id: DEFAULT_HERO_FILM.id } : value;
  const source = Array.isArray(legacySingle) ? legacySingle : legacySingle ? [legacySingle] : [];
  const clips = source.map(clipSnapshot).filter(Boolean).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return clips.length ? clips : [{ ...DEFAULT_HERO_FILM }];
}

export function readHeroFilms(document) {
  try {
    return heroFilmPlaylistSnapshot(JSON.parse(document?.querySelector(`meta[name="${HERO_FILM_META}"]`)?.content || 'null'));
  } catch {
    return [{ ...DEFAULT_HERO_FILM }];
  }
}

export function readHeroFilm(document) {
  return readHeroFilms(document)[0];
}
