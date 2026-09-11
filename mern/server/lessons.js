import path from 'node:path';
import { access } from 'node:fs/promises';
import { Lesson } from './models.js';
import { sendUploadedMedia } from './media.js';
import { getEntitlements } from './bookings.js';
export const LESSON_PREVIEWS = [
  { _id: 'leash-pressure', title: 'Leash pressure: timing over force', category: 'Foundations', instructor: 'David Northrop', image: '/images/training-education.webp', published: false },
  { _id: 'safe-tools', title: 'Fit, placement, and safe handling', category: 'Tools', instructor: 'David Northrop', image: '/images/hero-bravo-k9.webp', published: false },
  { _id: 'before-the-bark', title: 'What your dog says before the bark', category: 'Behavior', instructor: 'Ashley Leverock', image: '/images/obedience-real-world.webp', published: false },
  { _id: 'doorway', title: 'The doorway is the first conversation', category: 'Structure', instructor: 'Ashley Leverock', image: '/images/obedience-real-world.webp', published: false },
  { _id: 'heel', title: 'Building a heel that travels', category: 'Obedience', instructor: 'David Northrop', image: '/images/tracking-training.webp', published: false },
  { _id: 'neutrality', title: 'Neutrality in busy environments', category: 'Service', instructor: 'Bravo team', image: '/images/service-dog-training.webp', published: false },
];
export function privatePath(filename) {
  if (!filename || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|webm|vtt)$/.test(filename)) throw new Error('Invalid private media filename.');
  return path.join(path.resolve(process.env.PRIVATE_MEDIA_DIR || './private/media'), filename);
}
// manualMember is supplied only by the server after a database lookup; request
// bodies, query strings and public job titles never grant access.
export async function protectedLesson(req, res, type, { manualMember = false } = {}) {
  const { services } = await getEntitlements(req.user._id);
  if (!['staff', 'owner'].includes(req.user.role) && !services.includes('online') && manualMember !== true) return res.status(403).json({ error: 'Active Member access or an online membership is required.' });
  const lesson = await Lesson.findOne({ _id: req.params.id, ...(['staff', 'owner'].includes(req.user.role) ? {} : { published: true }) }).select('+videoFile +captionFile +transcript');
  if (!lesson) return res.status(404).json({ error: 'This lesson is not available yet.' });
  if (type === 'transcript') return res.json({ transcript: lesson.transcript });
  const uploadId = type === 'video' ? lesson.videoUpload : lesson.captionUpload;
  if (uploadId) return sendUploadedMedia(uploadId, req, res, type === 'video' ? 'video' : 'captions');
  const file = privatePath(type === 'video' ? lesson.videoFile : lesson.captionFile);
  try { await access(file); } catch { return res.status(503).json({ error: 'This lesson’s media is temporarily unavailable.' }); }
  return res.sendFile(file, { cacheControl: false, acceptRanges: true });
}
