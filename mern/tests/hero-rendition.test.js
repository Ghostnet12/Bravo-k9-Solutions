import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heroRendition, heroPosterRendition } from '../server/hero-rendition.js';
import { HERO_FILM_RENDITIONS, heroFilmSnapshot, heroFilmPlaylistSnapshot, OPTIMIZED_HERO_FILM_SRC, OPTIMIZED_HERO_POSTER } from '../shared/hero-film.js';

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
  for (const {src} of Object.values(HERO_FILM_RENDITIONS)) {
    const bytes = await readFile(new URL(`../client/public${src}`,import.meta.url));
    assert.ok(bytes.length < 4 * 1024 * 1024, `${src} stays below 4 MB`);
    const boxes=[];
    for(let offset=0;offset<bytes.length;){const size=bytes.readUInt32BE(offset);assert.ok(size>=8);boxes.push(bytes.toString('ascii',offset+4,offset+8));offset+=size;}
    assert.ok(boxes.indexOf('moov')>=0 && boxes.indexOf('moov')<boxes.indexOf('mdat'));
    assert.ok(bytes.includes(Buffer.from('avcC')), `${src} uses H.264`);
  }
  assert.ok((await readFile(new URL(`../client/public${OPTIMIZED_HERO_POSTER}`,import.meta.url))).length<100*1024);
});

test('both published playlist copies preserve their entries and replacement uploads remain independent', () => {
  const rows = [
    { _id:'opening', uploadId:'278be604-9070-43dd-b7f1-49bbe1c83a46', revision:5 },
    { _id:'10c92a42-82a7-40cc-a1f1-91d29e490598', uploadId:'3ccb5386-1020-4836-b95b-2828e334803b', revision:2 },
  ];
  const clips = rows.map((row, order) => ({ id:row._id, revision:row.revision, order, src:heroRendition(row), poster:`/api/hero-film/${row._id}/poster?v=${row.revision}` }));
  assert.deepEqual(heroFilmPlaylistSnapshot(clips).map(clip => clip.src), clips.map(clip => clip.src));
  for (const row of rows) {
    assert.match(heroRendition(row), /^\/assets\/bravo-film-/);
    assert.equal(heroRendition({...row,revision:row.revision+1}),heroRendition(row));
    assert.equal(heroRendition({...row,uploadId:'replacement-upload'}),null);
    assert.equal(heroRendition({...row,_id:'another-playlist-entry'}),null);
    assert.equal(heroPosterRendition({...row,revision:1,hasPoster:true}),null);
  }
  assert.notEqual(heroFilmSnapshot({...clips[0],src:clips[1].src}).src,clips[1].src);
});
