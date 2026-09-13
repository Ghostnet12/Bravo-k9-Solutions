import mongoose from 'mongoose';
import { TRAINING_FOCUSES } from '../shared/catalog.js';
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
  stripeCustomerId: String, firstPaidAt: Date,
}, { timestamps: true }));
export const Session = model('BravoSession', new Schema({ tokenHash: { type: String, unique: true }, userId: { type: id, required: true }, expiresAt: { type: Date, expires: 0 } }));
export const RateBucket = model('BravoRateBucket', new Schema({ _id: String, count: Number, expiresAt: { type: Date, expires: 0 } }));
const visitSchema = new Schema({ date: String, time: String, service: String }, { _id: false });
const bookingSchema = new Schema({
  userId: { type: id, required: true, index: true }, requestKey: String,
  staffId: { type: id, default: null, index: true }, requestedStaffId: { type: id, default: null, index: true }, createdBy: id,
  trainerAcceptanceRequired: { type: Boolean, default: false }, trainerAcceptedAt: Date, trainerAcceptedBy: id,
  serviceIds: [String], visits: [visitSchema], trainingFocus: { type: String, enum: TRAINING_FOCUSES.map(focus => focus.id) }, dogCount: { type: Number, min: 1, max: 10, default: 1 }, dogName: String, phone: String, address: String, notes: String,
  status: { type: String, enum: ['requested', 'confirmed', 'waitlisted', 'cancelled'], default: 'requested' }, waitlistedAt: Date,
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'covered', 'review', 'refunded'], default: 'unpaid' },
  quote: Schema.Types.Mixed, stripeSessionId: String, stripePaymentIntentId: String, checkoutUrl: String, checkoutExpiresAt: Date,
  refundId: String, refundStatus: String, refundAmountCents: Number, refundedAt: Date, refundedBy: id,
  renewalOf: String, termStartsAt: Date, termEndsAt: Date, paidAt: Date, cancelledVisits: [visitSchema],
  checkoutParams: { type: Schema.Types.Mixed, select: false }, checkoutStarting: { type: Boolean, default: false },
}, { timestamps: true });
bookingSchema.index({ userId: 1, requestKey: 1 }, { unique: true });
export const Booking = model('BravoBooking', bookingSchema);
export const Slot = model('BravoSlot', new Schema({ _id: String, bookingId: id, date: String, time: String, reason: String }));
export const TrainerSchedule = model('BravoTrainerSchedule', new Schema({ _id: String, enabled: Boolean, weekdays: [Number], hours: [String], overrides: [new Schema({ date: String, hours: [String] }, { _id: false })], revision: { type: Number, default: 0 } }, { timestamps: true }));
export const Settings = model('BravoSettings', new Schema({ _id: String, weekdays: [Number], hours: [String], overrides: [new Schema({date:String,hours:[String]}, {_id:false})], enabled: Boolean, revision: { type: Number, default: 0 } }));
export const ServiceSetting = model('BravoServiceSetting', new Schema({ _id: String, cents: { type: Number, min: 0, max: 1000000 }, enabled: { type: Boolean, default: true }, updatedBy: id }, { timestamps: true }));
export const ChatReset = model('BravoChatReset', new Schema({ _id: String, clearedAt: { type: Date, required: true } }, { timestamps: true }));
export const Message = model('BravoMessage', new Schema({ userId: id, authorName: String, role: String, kind: { type: String, enum: ['message', 'announcement', 'alert'] }, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
export const Review = model('BravoReview', new Schema({ userId: { type: id, required: true, unique: true, index: true }, authorName: String, rating: { type: Number, min: 1, max: 5 }, body: String, hidden: { type: Boolean, default: false }, moderatedAt: Date, moderatedBy: id }, { timestamps: true }));
export const AuditEvent = model('BravoAuditEvent', new Schema({ actorId: id, action: String, targetType: String, targetId: String, details: Schema.Types.Mixed }, { timestamps: true }));
export const DirectMessage = model('BravoDirectMessage', new Schema({ memberId: { type: id, required: true, index: true }, senderId: { type: id, required: true }, senderName: String, senderRole: String, recipientId: id, recipientName: String, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
export const CommunityGroup = model('BravoCommunityGroup', new Schema({ name: { type: String, required: true }, ownerId: { type: id, required: true }, members: [{ type: id }], archived: { type: Boolean, default: false } }, { timestamps: true }));
export const GroupMessage = model('BravoGroupMessage', new Schema({ groupId: { type: id, required: true, index: true }, userId: { type: id, required: true }, authorName: String, role: String, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
const subscriptionSchema = new Schema({ userId: { type: id, index: true }, stripeId: { type: String, unique: true }, serviceIds: [String], dogCount: { type: Number, min: 1, max: 10, default: 1 }, status: String, validFrom: Date, validUntil: Date, source: String, bookingId: id, renewalOf: String, renewalDeclined: Boolean, autoPayDisabled: Boolean, lastEventAt: Number }, { timestamps: true });
export const Subscription = model('BravoSubscription', subscriptionSchema);
export const Notification = model('BravoNotification', new Schema({ _id: String, userId: id, staff: Boolean, body: String, href: String, createdAt: { type: Date, default: Date.now } }));
export const NotificationRead = model('BravoNotificationRead', new Schema({ _id: String, userId: id, notificationId: String, messageId: id }));
export const PasswordReset = model('BravoPasswordReset', new Schema({ _id: String, userId: { type: id, unique: true }, expiresAt: { type: Date, expires: 0 } }));
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
const mediaChunkSchema = new Schema({ uploadId: { type: String, index: true }, index: Number, size: Number, data: Buffer, expiresAt: { type: Date, expires: 0 } }, { timestamps: true });
mediaChunkSchema.index({ uploadId: 1, index: 1 }, { unique: true });
export const MediaChunk = model('BravoMediaChunk', mediaChunkSchema);
export const ALL_MODELS = [Notification, NotificationRead, PasswordReset, TrainerSchedule, ChatReset, User, Session, RateBucket, Booking, Slot, Settings, ServiceSetting, Message, Review, AuditEvent, DirectMessage, CommunityGroup, GroupMessage, Subscription, StripeEvent, Lesson, BillingLock, MediaUpload, MediaChunk];
