import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readFile, access } from 'node:fs/promises';
import app from '../server/app.js';
import { PAGE_METADATA, publicRoutes, canonicalUrl } from '../shared/page-metadata.js';
import { renderHomepage } from '../server/homepage.js';

const dist = new URL('../client/dist/', import.meta.url);
const schemaFrom = html => JSON.parse(html.match(/<script id="bravo-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test('every indexable page ships real content, unique metadata and matching structured data before JavaScript', async () => {
  const titles = new Set(), descriptions = new Set();
  for (const [route, data] of publicRoutes()) {
    const { text: html } = await request(app).get(route).expect(200);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, route);
    assert.ok(html.includes('id="main-content"'), route);
    assert.ok(html.includes('tel:+16058242767'), route);
    assert.ok(html.includes(`rel="canonical" href="${canonicalUrl(route)}"`), route);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, route);
    assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.doesNotMatch(html, /<div id="root"><\/div>|noindex/);
    const graph = schemaFrom(html)['@graph'];
    assert.equal(graph.find(item => ['WebPage', 'ContactPage'].includes(item['@type'])).url, canonicalUrl(route));
    assert.equal(graph.find(item => item['@type'] === 'LocalBusiness').telephone, '+1-605-824-2767');
    assert.equal(graph.filter(item => item['@type'] === 'BreadcrumbList').length, route === '/' ? 0 : 1);
    assert.equal(graph.filter(item => item['@type'] === 'Service').length, data.service ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(graph), /aggregateRating|openingHours|reviewRating|streetAddress/);
    assert.ok(!titles.has(data.title)); titles.add(data.title);
    assert.ok(!descriptions.has(data.description)); descriptions.add(data.description);
    // All pre-rendered internal links resolve to a known app route or public file.
    for (const match of html.matchAll(/href="(\/(?!\/)[^"]*)"/g)) {
      const pathname = new URL(match[1].replaceAll('&amp;', '&'), 'https://bravounleashed.com').pathname;
      if (!PAGE_METADATA[pathname]) await access(new URL(pathname.slice(1), dist));
    }
  }
});

test('sitemap contains exactly canonical public routes and robots advertises it', async () => {
  const { text } = await request(app).get('/sitemap.xml').expect(200);
  assert.match(text, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  const urls = [...text.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, publicRoutes().map(([route]) => canonicalUrl(route)));
  assert.equal(new Set(urls).size, urls.length);
  assert.doesNotMatch(text, /<lastmod>|<priority>/);
  for (const url of urls) assert.doesNotMatch(url, /\.html|\?/);
  const robots = await request(app).get('/robots.txt').expect(200);
  assert.match(robots.text, /Sitemap: https:\/\/bravounleashed.com\/sitemap.xml/);
  assert.match(robots.text, /Allow: \/api\/site-images\//);
  assert.doesNotMatch(robots.text, /Disallow: \/(account|schedule|admin)/);
  // Match Google's longest-path rule so new public media is crawlable without
  // accidentally allowing authenticated lesson files or video editing APIs.
  const rules = [...robots.text.matchAll(/^(Allow|Disallow): (.+)$/gm)].map(([, action, pattern]) => ({
    action, length: pattern.replaceAll('*', '').replaceAll('$', '').length,
    regex: new RegExp('^' + pattern.split('*').map(part => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&')).join('.*')),
  }));
  const allowed = path => rules.filter(rule => rule.regex.test(path)).sort((a, b) => b.length - a.length || (a.action === 'Allow' ? -1 : 1))[0]?.action !== 'Disallow';
  for (const path of ['/api/proof-videos', '/api/proof-videos?after=cursor', '/api/proof-videos/client/video?v=1', '/api/proof-videos/client/poster?v=1', '/api/team/schedules']) assert.equal(allowed(path), true, path);
  for (const path of ['/api/admin/users', '/api/bookings', '/api/lessons/private/video', '/api/proof-videos/client/uploads']) assert.equal(allowed(path), false, path);
});

test('all transactional routes load with noindex in the first response, including schedule and password reset', async () => {
  for (const [route, data] of Object.entries(PAGE_METADATA).filter(([, data]) => data.private)) {
    const response = await request(app).get(`${route}?fixture=1`).expect(200);
    assert.match(response.headers['x-robots-tag'], /noindex/);
    assert.match(response.text, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(response.text, /id="bravo-structured-data"/);
    assert.ok(response.text.includes(data.title.replaceAll('&', '&amp;')));
  }
});

test('missing pages return a real 404 and document aliases preserve the query when redirecting', async () => {
  const missing = await request(app).get('/not-a-real-bravo-page').expect(404);
  assert.match(missing.text, /That page wandered off/);
  assert.match(missing.text, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(missing.text, /rel="canonical"|class="home-hero"/);
  for (const route of Object.keys(PAGE_METADATA).filter(route => route !== '/')) {
    for (const suffix of ['.html', '/']) {
      const response = await request(app).get(`${route}${suffix}?keep=1`).expect(308);
      assert.equal(response.headers.location, `${route}?keep=1`);
    }
  }
  assert.equal((await request(app).get('/bravo-shell.html').expect(308)).headers.location, '/');
});

test('Vercel routes each real page explicitly and lets missing URLs use its 404 document', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  for (const route of Object.keys(PAGE_METADATA).filter(route => route !== '/')) {
    assert.ok(config.rewrites.some(rule => rule.source === route && rule.destination === `${route}.html`), route);
    assert.ok(config.redirects.some(rule => rule.source === `${route}.html` && rule.destination === route && rule.permanent), route);
  }
  assert.equal(config.trailingSlash, false);
  assert.ok(!config.rewrites.some(rule => rule.destination === '/bravo-shell.html'));
  await access(new URL('404.html', dist));
});

test('pre-rendered home image uses the saved framing before the browser runs', async () => {
  const html = await readFile(new URL('bravo-shell.html', dist), 'utf8');
  const output = renderHomepage(html, { src: '/api/site-images/home-hero/image?v=13', revision: 13, framed: true, fit: 'contain', x: 13, y: 19.5, zoom: 1.36, alt: '"><script>private</script>' });
  const image = output.match(/<img\b[^>]*class="home-hero-image"[^>]*>/)[0];
  assert.match(image, / src="\/api\/site-images\/home-hero\/image\?v=13"/);
  assert.match(image, /object-fit:contain;object-position:13% 19.5%;/);
  assert.match(image, /data-site-image-original="\/images\/hero-bravo-launch.webp"/);
  assert.doesNotMatch(output, /<script>private<\/script>/);
  assert.equal((output.match(/as="image"/g) || []).length, 1);
});
