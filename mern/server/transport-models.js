import mongoose from 'mongoose';
import { TRANSPORT_STATUSES } from '../shared/transport.js';
const { Schema } = mongoose;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
export const TransportBreeder = model('BravoTransportBreeder', new Schema({
  name: { type: String, required: true, maxlength: 100 },
  accountId: { type: Schema.Types.ObjectId, required: true, index: true },
  enabled: { type: Boolean, default: true }, revision: { type: Number, default: 0 },
  createdBy: Schema.Types.ObjectId,
}, { timestamps: true }));
const eventSchema = new Schema({ status: String, note: String, at: Date }, { _id: false });
const locationSchema = new Schema({ latitude: Number, longitude: Number, accuracy: Number, observedAt: Date, receivedAt: Date }, { _id: false });
export const TransportTrip = model('BravoTransportTrip', new Schema({
  dogName: { type: String, required: true, maxlength: 80 },
  breederId: { type: Schema.Types.ObjectId, default: null, index: true },
  clientId: { type: Schema.Types.ObjectId, default: null, index: true },
  pickup: { type: String, required: true, maxlength: 120 },
  destination: { type: String, required: true, maxlength: 120 },
  pickupAt: Date, etaAt: Date,
  status: { type: String, enum: Object.keys(TRANSPORT_STATUSES), default: 'scheduled' },
  deviceId: { type: String, select: false, maxlength: 120 },
  sharingEnabled: { type: Boolean, default: false }, sharingSince: Date,
  location: { type: locationSchema, default: undefined },
  events: [eventSchema], revision: { type: Number, default: 0 }, createdBy: Schema.Types.ObjectId,
}, { timestamps: true }).index({ deviceId: 1, sharingEnabled: 1, status: 1 }));
