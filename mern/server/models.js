import mongoose from 'mongoose';
const { Schema } = mongoose;
mongoose.set('bufferCommands', false);
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const id = Schema.Types.ObjectId;
export const User = model('BravoUser', new Schema({
  email: { type: String, required: true, unique: true }, name: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ['member', 'staff'], default: 'member' },
  phone: { type: String, default: '' }, dogName: { type: String, default: '' }, address: { type: String, default: '' },
  stripeCustomerId: String,
}, { timestamps: true }));
export const Session = model('BravoSession', new Schema({ tokenHash: { type: String, unique: true }, userId: { type: id, required: true }, expiresAt: { type: Date, expires: 0 } }));
export const RateBucket = model('BravoRateBucket', new Schema({ _id: String, count: Number, expiresAt: { type: Date, expires: 0 } }));
const visitSchema = new Schema({ date: String, time: String, service: String }, { _id: false });
const bookingSchema = new Schema({
  userId: { type: id, required: true, index: true }, requestKey: String,
  serviceIds: [String], visits: [visitSchema], dogName: String, phone: String, address: String, notes: String,
  status: { type: String, enum: ['requested', 'confirmed', 'cancelled'], default: 'requested' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'covered', 'review'], default: 'unpaid' },
  quote: Schema.Types.Mixed, stripeSessionId: String, checkoutUrl: String, checkoutExpiresAt: Date,
  checkoutParams: { type: Schema.Types.Mixed, select: false }, checkoutStarting: { type: Boolean, default: false },
}, { timestamps: true });
bookingSchema.index({ userId: 1, requestKey: 1 }, { unique: true });
export const Booking = model('BravoBooking', bookingSchema);
export const Slot = model('BravoSlot', new Schema({ _id: String, bookingId: id, date: String, time: String, reason: String }));
export const Settings = model('BravoSettings', new Schema({ _id: String, weekdays: [Number], hours: [String], enabled: Boolean, revision: { type: Number, default: 0 } }));
export const Message = model('BravoMessage', new Schema({ userId: id, authorName: String, role: String, kind: { type: String, enum: ['message', 'announcement', 'alert'] }, body: String, deleted: { type: Boolean, default: false } }, { timestamps: true }));
const subscriptionSchema = new Schema({ userId: { type: id, index: true }, stripeId: { type: String, unique: true }, serviceIds: [String], status: String, validUntil: Date, lastEventAt: Number }, { timestamps: true });
export const Subscription = model('BravoSubscription', subscriptionSchema);
export const StripeEvent = model('BravoStripeEvent', new Schema({ _id: String, type: String, processedAt: Date }));
export const BillingLock = model('BravoBillingLock', new Schema({ _id: String, bookingId: String, expiresAt: { type: Date, expires: 0 } }));
export const Lesson = model('BravoLesson', new Schema({
  _id: String, title: String, category: String, instructor: String, image: String,
  // Private filenames only; never public playback URLs.
  videoFile: { type: String, select: false }, captionFile: { type: String, select: false }, transcript: { type: String, select: false },
  published: { type: Boolean, default: false },
}));
export const ALL_MODELS = [User, Session, RateBucket, Booking, Slot, Settings, Message, Subscription, StripeEvent, Lesson, BillingLock];
