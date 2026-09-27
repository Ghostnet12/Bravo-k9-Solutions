import { SiteImage } from './site-image-store.js';
import { SiteContent } from './site-content-store.js';
import { MediaUpload, MediaChunk } from './models.js';

export const backgroundDraftExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
export async function retainBackgroundImages(urls, session) {
  for (const url of new Set(urls.filter(Boolean))) {
    const key = /^\/api\/site-images\/(background-[a-f0-9-]{36})\/image\?v=\d+$/.exec(url)?.[1];
    if (!key) continue;
    const imagePath = new RegExp(`^/api/site-images/${key}/image\\?v=\\d+$`);
    const referenced = await SiteContent.exists({ $or: [{ 'value.backgroundImage': imagePath }, { 'previous.backgroundImage': imagePath }] }).session(session);
    const image = await SiteImage.findById(key).session(session);
    if (!image && !referenced) continue;
    const upload = image?.current?.uploadId ? await MediaUpload.findById(image.current.uploadId).session(session) : null;
    if (referenced && (!image || image.expiresAt <= new Date() || !upload?.completed || upload.expiresAt <= new Date())) {
      throw Object.assign(new Error('This background draft expired. Choose the photo again before publishing.'), { status: 409 });
    }
    const expiry = referenced ? undefined : backgroundDraftExpiry();
    // Always write the image row: concurrent references/retirement must conflict
    // and retry as one transaction rather than expiring another section's image.
    image.retentionRevision += 1; image.expiresAt = expiry;
    await image.save({ session });
    const update = referenced ? { $unset: { expiresAt: 1 } } : { $set: { expiresAt: expiry } };
    await MediaUpload.updateOne({ _id: image.current.uploadId }, update, { session });
    await MediaChunk.updateMany({ uploadId: image.current.uploadId }, update, { session });
  }
}
