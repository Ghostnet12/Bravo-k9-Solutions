// The opening film is independent of the breed carousel and private lessons.
export const DEFAULT_HERO_FILM = {
  id: 'opening', title: 'Bravo training film',
  description: 'Bravo dog training outdoors with its handler',
  src: '/videos/bravo-real-world.mp4', poster: '/images/bravo-film-poster.webp',
  fit: 'cover', order: 0, revision: 0,
};

export const HERO_FILM_META = 'bravo-hero-film';
export function heroFilmSnapshot(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_HERO_FILM };
  const revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  const source = `/api/hero-film/opening/video?v=${revision}`;
  if (value.src !== source && value.src !== DEFAULT_HERO_FILM.src) return { ...DEFAULT_HERO_FILM };
  const poster = value.src === DEFAULT_HERO_FILM.src ? DEFAULT_HERO_FILM.poster : value.poster === `/api/hero-film/opening/poster?v=${revision}` ? value.poster : null;
  return { id: 'opening', order: 0, revision, src: value.src, poster,
    title: String(value.title || DEFAULT_HERO_FILM.title).slice(0, 120),
    description: String(value.description ?? '').slice(0, 5000), fit: value.fit === 'contain' ? 'contain' : 'cover' };
}
export function readHeroFilm(document) {
  try { return heroFilmSnapshot(JSON.parse(document?.querySelector(`meta[name="${HERO_FILM_META}"]`)?.content || 'null')); }
  catch { return { ...DEFAULT_HERO_FILM }; }
}
