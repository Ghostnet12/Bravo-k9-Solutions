import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MUSIC, playableTracks, validAudioHeader } from '../shared/music-playlist.js';
import { playlistInput } from '../server/site-music.js';
test('playlist rotates from selected start, excludes disabled songs, and handles empty lineups', () => {
  const tracks = [{ id: 'a', enabled: true }, { id: 'b', enabled: false }, { id: 'c', enabled: true }];
  assert.deepEqual(playableTracks({ enabled: true, startId: 'c', tracks }).map(t => t.id), ['c', 'a']);
  assert.deepEqual(playableTracks({ enabled: false, tracks }), []);
  assert.deepEqual(playableTracks({ enabled: true, tracks: [] }), []);
  assert.equal(playableTracks(DEFAULT_MUSIC).length, 1);
});
test('playlist rejects duplicate tracks, disabled starts and external media URLs', () => {
  const value = { expectedRevision: 0, enabled: true, startId: 'bravo-original', tracks: [{ id: 'bravo-original', title: 'Bravo', enabled: true }] };
  assert.equal(playlistInput.safeParse(value).success, true);
  assert.equal(playlistInput.safeParse({ ...value, tracks: [...value.tracks, ...value.tracks] }).success, false);
  assert.equal(playlistInput.safeParse({ ...value, tracks: [{ ...value.tracks[0], enabled: false }] }).success, false);
  assert.equal(playlistInput.safeParse({ ...value, tracks: [{ ...value.tracks[0], src: 'https://evil.example' }] }).success, false);
});
test('audio upload header validation rejects executable and mismatched content', () => {
  assert.equal(validAudioHeader('audio/mpeg', Buffer.from('ID3audio')), true);
  assert.equal(validAudioHeader('audio/mp4', Buffer.from('0000ftypM4A ')), true);
  for (const type of ['audio/mpeg', 'audio/mp4', 'text/html']) assert.equal(validAudioHeader(type, Buffer.from('<script>alert(1)</script>')), false);
});
