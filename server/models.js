import mongoose from 'mongoose';
const { Schema } = mongoose;
// Models are registered before connectDb() runs on a cold start. Keep Mongoose's
// default buffering so collection/index initialization waits for the connection.
// API handlers still await connectDb() before accessing these models.
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const id = Schema.Types.ObjectId;
export const User = model('BravoUser', new Schema({
  email: { type: String, required: true, unique: true }, name: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ['member', 'staff', 'owner'], default: 'member' },
  phone: { type: String, default: '' }, dogName: { type: String, default: '' }, address: { type: String, default: '' },
  title: { type: String, default: '' }, bio: { type: String, default: '' }, showPhone: { type: Boolean, default: false },
  mutedUntil: Date, blocked: { type: Boolean, default: false },
  stripeCustomerId: String,
}, { timestamps: true }));
export const Session = model('BravoSession', new Schema({ tokenHash: { type: String, unique: true }, userId: { type: id, required: true }, expiresAt: { type: Date, expires: 0 } }));
export const RateBucket = model('BravoRateBucket', new Schema({ _id: String, count: Number, expiresAt: { type: Date, expires: 0 } }));
const visitSchema = new Schema({ date: String, time: String, service: String }, { _id: false });
const bookingSchema = new Schema({
  userId: { type: id, required: true, index: true }, requestKey: String,
  serviceIds: [String], visits: [visitSchema], dogName: String, phone: String, address: String, notes: String,
  status: { type: String, enum: ['requested', 'confirmed', 'cancelled'], default: 'requested' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'covered', 'review', 'refunded'], default: 'unpaid' },
  quote: Schema.Types.Mixed, stripeSessionId: String, checkoutUrl: String, checkoutExpiresAt: Date,
  checkoutParams: { type: Schema.Types.Mixed, select: false }, checkoutStarting: { type: Boolean, default: false },
}, { timestamps: true });
bookingSchema.index({ userId: 1, requestKey: 1 }, { unique: true });
export const Booking = model('BravoBooking', bookingSchema);
export const Slot = model('BravoSlot', new Schema({ _id: String, bookingId: id, date: String, time: String, reason: String }));
export const Settings = model('BravoSettings', new Schema({ _id: String, weekdays: [Number], hours: [String], enabled: Boolean, revision: { type: Number, default: 0 } }));
export const Message = model('BravoMessage', new Schema({ userId: id, authorName: String, role: String, kind: { type: String, enum: ['message', 'announcement', 'alert'] }, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
export const DirectMessage = model('BravoDirectMessage', new Schema({ memberId: { type: id, required: true, index: true }, senderId: { type: id, required: true }, senderName: String, senderRole: String, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
export const CommunityGroup = model('BravoCommunityGroup', new Schema({ name: { type: String, required: true }, ownerId: { type: id, required: true }, members: [{ type: id }], archived: { type: Boolean, default: false } }, { timestamps: true }));
export const GroupMessage = model('BravoGroupMessage', new Schema({ groupId: { type: id, required: true, index: true }, userId: { type: id, required: true }, authorName: String, role: String, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
const subscriptionSchema = new Schema({ userId: { type: id, index: true }, stripeId: { type: String, unique: true }, serviceIds: [String], status: String, validUntil: Date, lastEventAt: Number }, { timestamps: true });
export const Subscription = model('BravoSubscription', subscriptionSchema);
export const StripeEvent = model('BravoStripeEvent', new Schema({ _id: String, type: String, processedAt: Date }));
export const BillingLock = model('BravoBillingLock', new Schema({ _id: String, bookingId: String, expiresAt: { type: Date, expires: 0 } }));
export const Lesson = model('BravoLesson', new Schema({
  _id: String, title: String, category: String, instructor: String, image: String,
  // Private filenames only; never public playback URLs.
  videoFile: { type: String, select: false }, captionFile: { type: String, select: false }, transcript: { type: String, select: false },
  videoUpload: String, captionUpload: String, imageUpload: String,
  published: { type: Boolean, default: false },
}));
export const MediaUpload = model('BravoMediaUpload', new Schema({ _id: String, lessonId: String, kind: { type: String, enum: ['video', 'captions', 'image'] }, filename: String, contentType: String, size: Number, chunks: Number, uploadedBy: id, completed: { type: Boolean, default: false }, expiresAt: { type: Date, expires: 0 } }, { timestamps: true }));
export const MediaChunk = model('BravoMediaChunk', new Schema({ uploadId: { type: String, index: true }, index: Number, data: Buffer }, { timestamps: true }));
MediaChunk.schema.index({ uploadId: 1, index: 1 }, { unique: true });
export const ALL_MODELS = [User, Session, RateBucket, Booking, Slot, Settings, Message, DirectMessage, CommunityGroup, GroupMessage, Subscription, StripeEvent, Lesson, BillingLock, MediaUpload, MediaChunk];
