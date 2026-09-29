import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { parse } from 'parse5';
import { readFile, access } from 'node:fs/promises';
import { homeHeroSnapshot, readHomeHero } from '../shared/home-hero.js';
import { createHomepageHandler, renderHomepage } from '../server/homepage.js';
import { DEFAULT_HERO_FILM, heroFilmSnapshot, readHeroFilm } from '../shared/hero-film.js';

const hero = { revision: 13, src: '/api/site-images/home-training-hero/image?v=13', alt: 'Bravo team', fit: 'contain', x: 13, y: 19.5, zoom: 1.36, framed: true, canUndo: true };
const template = '<html><head><link rel="preload" as="image" href="/images/hero-bravo-launch.webp" fetchpriority="high"/><link rel="preload" as="font" href="/fonts/bebas-neue.ttf"/><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';

test('published opening film is the first source and poster in the real homepage HTML', async () => {
  const film = { ...DEFAULT_HERO_FILM, revision: 7, src: '/api/hero-film/opening/video?v=7', poster: '/api/hero-film/opening/poster?v=7', description: 'Published <film> & dog', fit: 'contain' };
  const realTemplate = await readFile(new URL('../client/dist/bravo-shell.html', import.meta.url), 'utf8');
  const app = express().get('/', createHomepageHandler({ loadHero: async () => null, loadFilm: async () => film, loadTemplate: async () => realTemplate }));
  const response = await request(app).get('/').expect(200);
  const nodes = [];
  function walk(node) { nodes.push(node); for (const child of node.childNodes || []) walk(child); }
  walk(parse(response.text));
  const player = nodes.find(node => node.tagName === 'video' && node.attrs.some(attr => attr.name === 'data-hero-film'));
  const attr = (node, name) => node.attrs.find(item => item.name === name)?.value;
  assert.equal(attr(player, 'poster'), film.poster);
  assert.equal(attr(player, 'aria-label'), film.description);
  assert.equal(attr(player, 'style'), 'object-fit:contain');
  assert.equal(attr(player.childNodes.find(node => node.tagName === 'source'), 'src'), film.src);
  assert.doesNotMatch(response.text, /bravo-real-world\.(mp4|webm)|bravo-film-poster\.webp/);
  assert.match(response.text, /bravo-hero-film/);
  assert.deepEqual(readHeroFilm({ querySelector: () => ({ content: JSON.stringify(film) }) }), film);
  const noPoster = renderHomepage(realTemplate, null, { ...film, poster: null });
  assert.doesNotMatch(noPoster, /<link[^>]*as="image"/);
  assert.doesNotMatch(noPoster.match(/<video[^>]*data-hero-film=""[^>]*>/)[0], /poster=/);
});

test('opening film bootstrap excludes private records and untrusted URLs', () => {
  const film = { ...DEFAULT_HERO_FILM, revision: 5, src: '/api/hero-film/opening/video?v=5', poster: 'https://evil.example/poster', uploadId: 'PRIVATE_UPLOAD', updatedBy: 'PRIVATE_OWNER' };
  const snapshot = heroFilmSnapshot(film);
  assert.equal(snapshot.poster, null);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|evil/);
  assert.deepEqual(heroFilmSnapshot({ ...film, src: '/api/lessons/private/video' }), DEFAULT_HERO_FILM);
  assert.deepEqual(heroFilmSnapshot({ ...film, src: '/api/hero-film/opening/video?v=4' }), DEFAULT_HERO_FILM);
  assert.deepEqual(readHeroFilm({ querySelector: () => ({ content: 'bad JSON' }) }), DEFAULT_HERO_FILM);
});

test('film poster has the only image preload while the saved gallery snapshot remains available', () => {
  const html = renderHomepage(template, hero);
  assert.equal((html.match(/as="image"/g) || []).length, 1);
  assert.match(html, /href="\/images\/bravo-film-poster.webp"/);
  assert.doesNotMatch(html, /<link[^>]*href="\/api\/site-images/);
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
  assert.equal(homeHeroSnapshot({ ...hero, src: '/api/site-images/home-training-hero/image?v=12' }).src, null);
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
  current = { ...hero, revision: 14, src: '/api/site-images/home-training-hero/image?v=14' };
  const next = await request(app).get('/').expect(200);
  assert.match(next.text, /image\?v=14/);
  assert.doesNotMatch(next.text, /image\?v=13/);
});

test('missing media and unavailable database still return usable HTML', async () => {
  for (const loadHero of [async () => null, async () => { throw new Error('private database detail'); }]) {
    const app = express().get('/', createHomepageHandler({ loadTemplate: async () => template, loadHero }));
    const response = await request(app).get('/').expect(200);
    assert.ok(response.text.includes('/images/bravo-film-poster.webp'));
    assert.doesNotMatch(response.text, /private database detail/);
  }
});

test('Vercel homepage uses the dynamic snapshot and includes its production HTML', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(config.rewrites[0], { source: '/', destination: '/api/homepage' });
  assert.equal(config.functions['api/homepage.js'].includeFiles, 'client/dist/bravo-shell.html');
  await access(new URL('../client/dist/bravo-shell.html', import.meta.url));
  await assert.rejects(access(new URL('../client/dist/index.html', import.meta.url)), { code: 'ENOENT' });
  const source = await readFile(new URL('../client/src/Home.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/className="home-hero-image"/g) || []).length, 1);
  assert.ok(source.indexOf('data-site-media-tools') > source.indexOf('home-service-strip'));
  assert.match(source, /className="home-hero-image"[^>]*loading="lazy" fetchPriority="low"/);
  assert.match(source, /data-site-image-original=\{HOME_HERO_SOURCE\}/);
});


test('homepage uses a persistent site soundtrack and no public hero playback controls', async () => {
  const [main, film, soundtrack, audio] = await Promise.all([
    readFile(new URL('../client/src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/CinematicFilm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/src/SiteSoundtrack.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../client/public/audio/built-for-the-real-world.m4a', import.meta.url)),
  ]);
  assert.match(main, /<SiteSoundtrack\/>/);
  assert.match(soundtrack, /autoPlay loop/);
  assert.match(soundtrack, /pathname === '\/'/);
  assert.doesNotMatch(film, /cinema-film-controls|Pause training film|Turn hero video sound on|Next hero video/);
  assert.equal(audio.subarray(4, 8).toString(), 'ftyp');
  assert.ok(audio.length > 100000 && audio.length < 3 * 1024 * 1024, 'web soundtrack is optimized instead of shipping the source WAV');
});
