import { SITE_SOUNDTRACK_SRC, SITE_SOUNDTRACK_TITLE } from './site-soundtrack.js';
export const MUSIC_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MUSIC = { revision: 0, enabled: true, startId: 'bravo-original', tracks: [{ id: 'bravo-original', title: SITE_SOUNDTRACK_TITLE, enabled: true, src: SITE_SOUNDTRACK_SRC }] };
export function playableTracks(playlist) {
  const tracks = playlist.enabled ? playlist.tracks.filter(track => track.enabled) : [];
  const start = tracks.findIndex(track => track.id === playlist.startId);
  return start > 0 ? [...tracks.slice(start), ...tracks.slice(0, start)] : tracks;
}
export function validAudioHeader(type, bytes) {
  if (type === 'audio/mpeg') return bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (type === 'audio/mp4') return bytes.subarray(4, 8).toString() === 'ftyp';
  return false;
}
