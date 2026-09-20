import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MediaUpload, MediaChunk } from './models.js';

export const CHUNK_SIZE = 400 * 1024;
export const MEDIA_LIMITS = { video: 80 * 1024 * 1024, image: 3 * 1024 * 1024, photo: 3 * 1024 * 1024, captions: 1024 * 1024 };
export function mediaBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value?._bsontype === 'Binary') return Buffer.from(value.value());
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Invalid stored media.');
}
export function validMediaHeader(type, bytes) {
  if (type === 'video/mp4' || type === 'video/quicktime') return bytes.subarray(4, 8).toString() === 'ftyp';
  if (type === 'video/webm') return bytes.subarray(0, 4).toString('hex') === '1a45dfa3';
  if (type === 'image/jpeg') return bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
  if (type === 'image/png') return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (type === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (['text/vtt', 'text/plain'].includes(type)) return /^\uFEFF?WEBVTT(?:[ \t\r\n]|$)/.test(bytes.toString('utf8'));
  return false;
}
export function byteRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size ? { start, end, partial: true } : null;
}
export async function sendUploadedMedia(uploadId, req, res, expectedKind) {
  const upload = await MediaUpload.findOne({ _id: uploadId, completed: true, kind: expectedKind }).lean();
  if (!upload) return res.status(404).json({ error: 'Media not found.' });
  const range = byteRange(req.headers.range, upload.size);
  if (!range) return res.status(416).set('Content-Range', `bytes */${upload.size}`).end();
  const { start, end, partial } = range;
  res.status(partial ? 206 : 200).set({
    'Content-Type': expectedKind === 'captions' ? 'text/vtt; charset=utf-8' : upload.contentType,
    'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${upload.size}` } : {}),
  });
  if (req.method === 'HEAD') return res.end();
  // Fetch only the requested chunks and stream with backpressure; never buffer a video.
  const cursor = MediaChunk.find({ uploadId, index: { $gte: Math.floor(start / CHUNK_SIZE), $lte: Math.floor(end / CHUNK_SIZE) } }).sort({ index: 1 }).select('index data').lean().cursor();
  async function* content() {
    try {
      let sent = 0;
      for await (const chunk of cursor) {
        const offset = chunk.index * CHUNK_SIZE;
        const bytes = mediaBytes(chunk.data).subarray(Math.max(0, start - offset), Math.min(CHUNK_SIZE, end - offset + 1));
        sent += bytes.length; yield bytes;
      }
      if (sent !== end - start + 1) throw new Error('Incomplete media.');
    } finally { await cursor.close(); }
  }
  try { await pipeline(Readable.from(content()), res); }
  catch (error) { if (!res.headersSent && !res.destroyed) throw error; if (!res.destroyed) res.destroy(); }
}
