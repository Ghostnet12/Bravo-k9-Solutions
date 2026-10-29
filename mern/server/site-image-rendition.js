import { createHash } from 'node:crypto';

// Delivery copies of already-public photos. MongoDB originals and editing history
// remain authoritative. Both the upload identity and photo key must match: a
// replacement, undo to another upload, or isolated database uses its own bytes.
const renditions = {
  '9e5e140cf378c934c3a9681edddfa9f1dcbcb5eeec07e14632215b3a95c53d99': {
    key: 'team-ashley-northrop', src: '/assets/bravo-photo-d48da6e52eda.webp',
  },
  'beb0a8b870a67eebe11123600c54c6bca8f40c86a07a6bb60358501e36d709e8': {
    key: 'hero-photo-09a4e693-7c6e-4ebb-9bc1-5a7d122ecdc6', src: '/assets/bravo-photo-153338c32326.webp',
  },
  '901eb4cafa2c9e0f4987bf1d3c20d665a04206c55b3f622b6fe3c75f3a37c177': {
    key: 'home-training-hero', src: '/assets/bravo-photo-3d08b616d6f2.webp',
  },
};

export function siteImageRendition(image) {
  const uploadId = image?.current?.uploadId;
  if (typeof uploadId !== 'string' || !uploadId) return null;
  const rendition = renditions[createHash('sha256').update(uploadId).digest('hex')];
  return rendition?.key === image._id ? rendition.src : null;
}
