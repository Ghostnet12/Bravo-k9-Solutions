import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { HOME_HERO_SOURCE, homeHeroSnapshot, readHomeHero } from '../shared/home-hero.js';
import { createHomepageHandler, renderHomepage } from '../server/homepage.js';

const hero = { revision: 13, src: '/api/site-images/home-hero/image?v=13', alt: 'Bravo team', fit: 'contain', x: 13, y: 19.5, zoom: 1.36, framed: true, canUndo: true };
const template = '<html><head><link rel="preload" as="image" href="/images/hero-bravo-launch.webp" fetchpriority="high"/><link rel="preload" as="font" href="/fonts/bebas-neue.ttf"/><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';

test('published hero is available in initial HTML and has the only image preload', () => {
  const html = renderHomepage(template, hero);
  assert.equal((html.match(/as="image"/g) || []).length, 1);
  assert.match(html, /href="\/api\/site-images\/home-hero\/image\?v=13"/);
  assert.doesNotMatch(html, /hero-bravo-launch/);
  assert.match(html, /bravo-home-hero/);
  assert.match(html, /&quot;fit&quot;:&quot;contain&quot;/);
  assert.match(html, /&quot;zoom&quot;:1.36/);
  assert.match(html, /as="font"/);
  assert.ok(html.indexOf('bravo-home-hero') < html.indexOf('<body>'));
});

test('snapshot strips private data, rejects arbitrary sources and bounds framing', () => {
  const value = homeHeroSnapshot({ ...hero, uploadId: 'PRIVATE_UPLOAD', updatedBy: 'PRIVATE_OWNER', src: 'https://evil.example/photo', x: -10, y: 900, zoom: 100 });
  assert.equal(value.src, null);
  assert.equal(value.x, 0); assert.equal(value.y, 100); assert.equal(value.zoom, 3);
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE|evil/);
  assert.equal(homeHeroSnapshot({ ...hero, src: '/api/site-images/home-hero/image?v=12' }).src, null);
});

test('alt text cannot escape the inert metadata attribute or inject scripts', () => {
  const html = renderHomepage(template, { ...hero, alt: '\"><script>alert(1)</script>&' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal((html.match(/<script/g) || []).length, 1);
});

test('client reads the same initial framing without fetching or using storage', () => {
  assert.deepEqual(readHomeHero({ querySelector: () => ({ content: JSON.stringify(hero) }) }), hero);
  assert.equal(readHomeHero(null), null);
  assert.equal(readHomeHero({ querySelector: () => ({ content: 'broken JSON' }) }), null);
});

test('homepage serves complete public snapshot without authentication and does not cache stale revisions', async () => {
  let current = hero;
  const app = express().get('/', createHomepageHandler({ loadTemplate: async () => template, loadHero: async () => current }));
  const first = await request(app).get('/').expect(200).expect('Content-Type', /text\/html/);
  assert.match(first.text, /image\?v=13/);
  assert.match(first.headers['cache-control'], /no-store/);
  assert.equal(first.headers['set-cookie'], undefined);
  current = { ...hero, revision: 14, src: '/api/site-images/home-hero/image?v=14' };
  const next = await request(app).get('/').expect(200);
  assert.match(next.text, /image\?v=14/);
  assert.doesNotMatch(next.text, /image\?v=13/);
});

test('missing media and unavailable database still return usable HTML', async () => {
  for (const loadHero of [async () => null, async () => { throw new Error('private database detail'); }]) {
    const app = express().get('/', createHomepageHandler({ loadTemplate: async () => template, loadHero }));
    const response = await request(app).get('/').expect(200);
    assert.ok(response.text.includes(HOME_HERO_SOURCE));
    assert.doesNotMatch(response.text, /private database detail/);
  }
});

test('Vercel homepage uses the dynamic snapshot and includes its production HTML', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(config.rewrites[0], { source: '/', destination: '/api/homepage' });
  assert.equal(config.functions['api/homepage.js'].includeFiles, 'client/dist/index.html');
  const source = await readFile(new URL('../client/src/Home.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/className="home-hero-image"/g) || []).length, 1);
  assert.ok(source.indexOf('data-site-media-tools') > source.indexOf('home-service-strip'));
  assert.match(source, /loading="eager"/);
  assert.match(source, /data-site-image-original=\{HOME_HERO_SOURCE\}/);
});
