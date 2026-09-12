import { readFile } from 'node:fs/promises';
import { HOME_HERO_META, HOME_HERO_SOURCE, homeHeroSnapshot } from '../shared/home-hero.js';

const escapeAttribute = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let template;
function readTemplate() {
  template ||= readFile(new URL('../client/dist/index.html', import.meta.url), 'utf8').catch(error => { template = null; throw error; });
  return template;
}

export function renderHomepage(html, value) {
  const hero = homeHeroSnapshot(value);
  const preload = `<link rel="preload" as="image" href="${escapeAttribute(hero?.src || HOME_HERO_SOURCE)}" fetchpriority="high"/>`;
  // Replace the original preload, rather than downloading two hero photos.
  return html.replace(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/g, '')
    .replace('</head>', `${preload}<meta name="${HOME_HERO_META}" content="${escapeAttribute(JSON.stringify(hero))}"/></head>`);
}

export function createHomepageHandler({ loadHero, loadTemplate = readTemplate }) {
  return async (_req, res) => {
    // Resolve framing before sending HTML, not after the visitor sees a
    // differently framed placeholder. An outage still serves the static page.
    const [html, hero] = await Promise.all([
      loadTemplate(),
      Promise.resolve().then(loadHero).catch(() => null),
    ]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.statusCode = 200;
    res.end(renderHomepage(html, hero));
  };
}
