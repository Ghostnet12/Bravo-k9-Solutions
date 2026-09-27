import { renderSiteContent } from './content-html.js';
import { readFile } from 'node:fs/promises';
import { HOME_HERO_META, HOME_HERO_SOURCE, HOME_HERO_ALT, homeHeroSnapshot } from '../shared/home-hero.js';
import { framingStyle } from '../shared/site-images.js';
import { DEFAULT_HERO_FILM, HERO_FILM_META, heroFilmSnapshot } from '../shared/hero-film.js';

const escapeAttribute = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let template;
function readTemplate() {
  template ||= readFile(new URL('../client/dist/bravo-shell.html', import.meta.url), 'utf8').catch(error => { template = null; throw error; });
  return template;
}

export function renderHomepage(html, value, filmValue) {
  const hero = homeHeroSnapshot(value);
  const film = heroFilmSnapshot(filmValue);
  // The saved photo now lives in the below-fold gallery. Prioritize the visible
  // film poster while preserving the gallery's initial source/framing snapshot.
  const preload = film.poster ? `<link rel="preload" as="image" href="${escapeAttribute(film.poster)}" fetchpriority="high"/>` : '';
  // Put the published revision in both the server-rendered player and React's
  // bootstrap data. Never download or flash the retired film during hydration.
  html = html.replace(/<video\b(?=[^>]*\bdata-hero-film="")[^>]*>[\s\S]*?<\/video>/g, markup => {
    const opening = markup.slice(0, markup.indexOf('>'))
      .replace(/ poster="[^"]*"/, '').replace(/ aria-label="[^"]*"/, '').replace(/ style="[^"]*"/, '');
    return `${opening}${film.poster ? ` poster="${escapeAttribute(film.poster)}"` : ''} aria-label="${escapeAttribute(film.description || film.title)}" style="object-fit:${film.fit}"><source src="${escapeAttribute(film.src)}"/>${film.src === DEFAULT_HERO_FILM.src ? '<source src="/videos/bravo-real-world.webm" type="video/webm"/>' : ''}</video>`;
  });
  // The pre-rendered photo must match the published snapshot on the very first
  // frame, including before JavaScript starts. Preserve the editor's original
  // source attributes so existing image edits and undo keep working.
  html = html.replace(/<img\b[^>]*class="home-hero-image"[^>]*>/g, tag => {
    const styles = hero?.framed ? Object.entries(framingStyle(hero)).map(([key, setting]) => `${key.replace(/[A-Z]/g, char => '-' + char.toLowerCase())}:${setting}`).join(';') : '';
    return tag.replace(/ src="[^"]*"/, ` src="${escapeAttribute(hero?.src || HOME_HERO_SOURCE)}"`)
      .replace(/ alt="[^"]*"/, ` alt="${escapeAttribute(hero?.framed ? hero.alt : HOME_HERO_ALT)}"`)
      .replace(/ style="[^"]*"/, '')
      .replace(/\/?>(?=$)/, ` style="${escapeAttribute(styles)}"/>`);
  });
  // Replace React's image preloads so below-fold uploads cannot compete with
  // the first visible poster for high-priority bandwidth.
  return html.replace(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/g, '')
    .replace('</head>', `${preload}<meta name="${HOME_HERO_META}" content="${escapeAttribute(JSON.stringify(hero))}"/><meta name="${HERO_FILM_META}" content="${escapeAttribute(JSON.stringify(film))}"/></head>`);
}

export function createHomepageHandler({ loadHero, loadTemplate = readTemplate, loadContent = async () => ({}), loadFilm = async () => null, loadWorkshop = async () => undefined, loadCatalog = async () => undefined }) {
  return async (_req, res) => {
    // Resolve framing before sending HTML, not after the visitor sees a
    // differently framed placeholder. An outage still serves the static page.
    const [html, hero, content, film, workshop, catalog] = await Promise.all([
      loadTemplate(),
      Promise.resolve().then(loadHero).catch(() => null),
      Promise.resolve().then(loadContent).catch(() => ({})),
      Promise.resolve().then(loadFilm).catch(() => null),
      Promise.resolve().then(loadWorkshop).catch(() => null),
      Promise.resolve().then(loadCatalog).catch(() => undefined),
    ]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.statusCode = 200;
    res.end(renderSiteContent(renderHomepage(html, hero, film), content, workshop, catalog));
  };
}
