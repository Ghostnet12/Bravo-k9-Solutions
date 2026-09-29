import mongoose from 'mongoose';

// Preserve the existing collection and portrait URLs. Background drafts expire
// unless a content publication retains them, including its one-step undo value.
const snapshot = new mongoose.Schema({ uploadId: { type: String, default: null }, alt: { type: String, default: '' }, x: { type: Number, default: 50 }, y: { type: Number, default: 50 }, zoom: { type: Number, default: 1 }, fit: { type: String, default: 'cover' }, framed: Boolean }, { _id: false });
export const SiteImage = mongoose.models.BravoSiteImage || mongoose.model('BravoSiteImage', new mongoose.Schema({ _id: String, current: snapshot, previous: snapshot, revision: { type: Number, default: 0 }, retentionRevision: { type: Number, default: 0 }, lastMutation: String, expiresAt: { type: Date, expires: 0 }, updatedBy: mongoose.Schema.Types.ObjectId }, { timestamps: true }));
