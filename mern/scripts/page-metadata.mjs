import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PAGE_METADATA, SITE_ORIGIN } from '../shared/page-metadata.js';
const directory = new URL('../client/dist/', import.meta.url);
const source = await readFile(new URL('index.html', directory), 'utf8');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
for (const [route, data] of Object.entries(PAGE_METADATA)) {
  const url = SITE_ORIGIN + (route === '/' ? '/' : route);
  let html = source.replace(/<title>.*?<\/title>/, `<title>${escape(data.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(data.description)}"/>`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escape(data.title)}"/>`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escape(data.description)}"/>`)
    .replace('content="/images/hero-bravo-k9.webp"', `content="${SITE_ORIGIN}/images/hero-bravo-k9.webp"`)
    .replace('</head>', `<link rel="canonical" href="${url}"/><meta property="og:url" content="${url}"/><meta name="robots" content="${data.private ? 'noindex, nofollow' : 'index, follow'}"/></head>`);
  const filename = new URL(route === '/' ? 'index.html' : route.slice(1) + '.html', directory);
  await mkdir(path.dirname(filename.pathname), { recursive: true });
  await writeFile(filename, html);
}
const routes = Object.entries(PAGE_METADATA).filter(([, value]) => !value.private).map(([route]) => `${SITE_ORIGIN}${route}`);
await writeFile(new URL('sitemap.xml', directory), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`);
await writeFile(new URL('robots.txt', directory), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
