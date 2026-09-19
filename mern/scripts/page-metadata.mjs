import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { PAGE_METADATA, NOT_FOUND_METADATA, SITE_ORIGIN, publicRoutes, canonicalUrl, robotsContent, socialImage, socialImageAlt, structuredData } from '../shared/page-metadata.js';

const directory = new URL('../client/dist/', import.meta.url);
const source = await readFile(new URL('index.html', directory), 'utf8');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { renderPublicPage } = await server.ssrLoadModule('/src/entry-public.jsx');
  for (const [route, data] of [...Object.entries(PAGE_METADATA), ['/404', NOT_FOUND_METADATA]]) {
    const url = canonicalUrl(route), schema = structuredData(route);
    // Render the same public React components users see, without calling APIs
    // or embedding member data. Interactive pages keep their private app shell.
    const body = !data.private || route === '/404' ? renderPublicPage(route).replace(/<link\b[^>]*rel="preload"[^>]*\/?>/g, '') : '';
    const head = [
      `<link rel="canonical" href="${url}"/>`,
      `<meta name="robots" content="${robotsContent(data)}"/>`,
      '<meta property="og:type" content="website"/>',
      '<meta property="og:site_name" content="Bravo K9 Solutions"/>',
      '<meta property="og:locale" content="en_US"/>',
      `<meta property="og:title" content="${escape(data.title)}"/>`,
      `<meta property="og:description" content="${escape(data.description)}"/>`,
      `<meta property="og:url" content="${url}"/>`,
      `<meta property="og:image" content="${socialImage(data)}"/>`,
      `<meta property="og:image:alt" content="${escape(socialImageAlt(data))}"/>`,
      '<meta name="twitter:card" content="summary_large_image"/>',
      `<meta name="twitter:title" content="${escape(data.title)}"/>`,
      `<meta name="twitter:description" content="${escape(data.description)}"/>`,
      `<meta name="twitter:image" content="${socialImage(data)}"/>`,
      `<meta name="twitter:image:alt" content="${escape(socialImageAlt(data))}"/>`,
      schema ? `<script id="bravo-structured-data" type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>` : '',
    ].filter(Boolean).join('\n');
    let html = source.replace(/<title>.*?<\/title>/, `<title>${escape(data.title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(data.description)}"/>`)
      .replace(/<meta property="og:[^"]+"[^>]*>/g, '')
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
      .replace('</head>', `${head}\n</head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    // Only the home page uses this image above the fold.
    if (route !== '/') html = html.replace(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/g, '');
    if (route === '/404') html = html.replace(/<link rel="canonical"[^>]*>/, '');
    const filename = new URL(route === '/' ? 'index.html' : route.slice(1) + '.html', directory);
    await mkdir(path.dirname(filename.pathname), { recursive: true });
    await writeFile(filename, html);
  }
} finally { await server.close(); }
const routes = publicRoutes().map(([route]) => canonicalUrl(route));
// Omit lastmod: a build date is not a reliable content-change date, especially
// for live catalog/team content. No fabricated priorities or freshness dates.
await writeFile(new URL('sitemap.xml', directory), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`);
// Allow crawling of noindex pages so crawlers can actually read the directive.
await writeFile(new URL('robots.txt', directory), `User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/site-images/\nAllow: /api/config$\nAllow: /api/team$\nAllow: /api/team/schedules$\nAllow: /api/reviews$\nAllow: /api/lessons$\nAllow: /api/proof-videos$\nAllow: /api/proof-videos?\nAllow: /api/proof-videos/*/video\nAllow: /api/proof-videos/*/poster\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
// Keep the homepage handler responsible for the owner's current hero framing.
await rename(new URL('index.html', directory), new URL('bravo-shell.html', directory));
console.log(`Rendered ${routes.length} public pages, private route metadata, 404, sitemap.xml and robots.txt.`);
