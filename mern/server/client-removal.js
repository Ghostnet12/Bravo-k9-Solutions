import { z } from 'zod';
import { User, Booking, Slot, Session, PasswordReset, Settings, Subscription, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { isPrimaryOwner } from './auth.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function removeClient(req, res) {
  const clientId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.id);
  z.object({ confirmRemoval: z.literal(true) }).strict().parse(req.body);
  await transaction(async session => {
    // Use the same transaction lock as reservations and trainer assignments.
    await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
    const client = await User.findById(clientId).session(session);
    if (!client) throw fail('Client not found.', 404);
    if (client.role !== 'member' || isPrimaryOwner(client) || String(req.user._id) === clientId) throw fail('Only client accounts can be removed here. Staff, administrator and owner accounts are protected.', 403);
    if (client.removedAt) return;
    if (await Subscription.exists({ userId: clientId, stripeId: /^sub_/, status: { $in: ['active', 'trialing', 'past_due', 'unpaid'] }, autoPayDisabled: { $ne: true } }).session(session)) throw fail('This client has automatic billing. An administrator must turn off automatic renewal before removing the client.');
    if (await Booking.exists({ userId: clientId, paymentStatus: 'unpaid', $or: [{ checkoutStarting: true }, { checkoutExpiresAt: { $gt: new Date() } }] }).session(session)) throw fail('This client has a checkout in progress. Finish or expire that checkout before removing the client.');
    client.blocked = true; client.removedAt = new Date(); client.removedBy = req.user._id;
    await client.save({ session });
    const bookings = await Booking.find({ userId: clientId }).select('_id').session(session).lean();
    await Slot.deleteMany({ bookingId: { $in: bookings.map(b => b._id) } }, { session });
    const cancelled = await Booking.updateMany({ userId: clientId, status: { $in: ['requested', 'confirmed', 'waitlisted'] } }, { $set: { status: 'cancelled' } }, { session });
    await Session.deleteMany({ userId: clientId }, { session });
    await PasswordReset.deleteMany({ userId: clientId }, { session });
    await AuditEvent.create([{ actorId: req.user._id, action: 'client.removed', targetType: 'user', targetId: clientId, details: { cancelledRequests: cancelled.modifiedCount } }], { session });
  });
  res.json({ ok: true, message: 'Client removed. Account access is disabled and remaining visits are cancelled. Payment history is retained; no refund was issued.' });
}
