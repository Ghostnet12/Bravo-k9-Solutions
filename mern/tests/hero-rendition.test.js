import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heroRendition, heroPosterRendition } from '../server/hero-rendition.js';
import { heroFilmSnapshot, OPTIMIZED_HERO_FILM_SRC, OPTIMIZED_HERO_POSTER } from '../shared/hero-film.js';

test('optimized delivery follows the original upload, never another video at the same revision', () => {
  const published = { uploadId:'55e5c651-45c7-4034-941f-170a352882f2', revision:1, hasPoster:true };
  assert.equal(heroRendition(published), OPTIMIZED_HERO_FILM_SRC);
  assert.equal(heroPosterRendition(published), OPTIMIZED_HERO_POSTER);
  assert.equal(heroRendition({...published,revision:2}), OPTIMIZED_HERO_FILM_SRC);
  assert.equal(heroPosterRendition({...published,revision:2}), null, 'A new poster must take effect');
  assert.equal(heroRendition({...published,uploadId:'another-upload'}), null);
  assert.equal(heroRendition(null), null);
  const film = heroFilmSnapshot({revision:1,src:OPTIMIZED_HERO_FILM_SRC,poster:OPTIMIZED_HERO_POSTER});
  assert.equal(film.src, OPTIMIZED_HERO_FILM_SRC);
  assert.equal(film.poster, OPTIMIZED_HERO_POSTER);
  assert.notEqual(heroFilmSnapshot({...film,src:'https://untrusted.example/video.mp4'}).src,'https://untrusted.example/video.mp4');
});

test('the delivery film is small and puts playback metadata before video bytes', async () => {
  const bytes = await readFile(new URL(`../client/public${OPTIMIZED_HERO_FILM_SRC}`,import.meta.url));
  assert.ok(bytes.length < 4 * 1024 * 1024);
  const boxes=[];
  for(let offset=0;offset<bytes.length;){const size=bytes.readUInt32BE(offset);assert.ok(size>=8);boxes.push(bytes.toString('ascii',offset+4,offset+8));offset+=size;}
  assert.ok(boxes.indexOf('moov')>=0 && boxes.indexOf('moov')<boxes.indexOf('mdat'));
  assert.ok((await readFile(new URL(`../client/public${OPTIMIZED_HERO_POSTER}`,import.meta.url))).length<100*1024);
});
