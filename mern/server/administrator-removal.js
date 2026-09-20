import { confirmOwnerPassword, lockOwnerReauthentication } from './reauthentication.js';
import { z } from 'zod';
import { User, Booking, Session, PasswordReset, Settings, Subscription, AuditEvent, TrainerSchedule } from './models.js';
import { transaction } from './db.js';
import { isPrimaryOwner } from './auth.js';
import { assignedTrainerIds, requestedTrainerIds, acceptedTrainerIds } from '../shared/trainers.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export function requirePrimaryOwner(req, _res, next) {
  if (req.user?.role !== 'owner' || !isPrimaryOwner(req.user)) throw fail('Only the Owner can delete administrator profiles.', 403);
  next();
}

export async function removeAdministrator(req, res) {
  const administratorId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.id).toLowerCase();
  const { currentPassword } = z.object({ confirmRemoval: z.literal(true), currentPassword: z.string().min(1).max(128) }).strict().parse(req.body);
  const proof = await confirmOwnerPassword(req.user, currentPassword);
  let unassignedRequests = 0;
  await transaction(async session => {
    unassignedRequests = 0;
    await lockOwnerReauthentication(proof, session);
    // Serialize removal with assignment, acceptance and reservation changes.
    await Settings.updateOne({ _id: 'schedule' }, { $inc: { revision: 1 } }, { session });
    const actor = await User.findById(req.user._id).session(session);
    if (!actor || actor.blocked || actor.removedAt || actor.role !== 'owner' || !isPrimaryOwner(actor)) throw fail('Only the Owner can delete administrator profiles.', 403);
    const person = await User.findById(administratorId).session(session);
    if (!person) throw fail('Administrator not found.', 404);
    if (isPrimaryOwner(person) || String(actor._id) === administratorId) throw fail('The Owner profile cannot be deleted.', 403);
    if (person.role !== 'owner') throw fail('Choose an administrator profile.', 403);
    if (person.removedAt) return;
    if (await Subscription.exists({ userId: administratorId, stripeId: /^sub_/, status: { $in: ['active', 'trialing', 'past_due', 'unpaid'] }, autoPayDisabled: { $ne: true } }).session(session)) throw fail('Turn off this account’s automatic renewal before deleting its profile.');
    if (await Booking.exists({ userId: administratorId, paymentStatus: 'unpaid', $or: [{ checkoutStarting: true }, { checkoutExpiresAt: { $gt: new Date() } }] }).session(session)) throw fail('Finish or expire this account’s checkout before deleting its profile.');

    person.blocked = true; person.removedAt = new Date(); person.removedBy = actor._id;
    await person.save({ session });
    const bookings = await Booking.find({ status: { $in: ['requested', 'confirmed', 'waitlisted'] }, $or: [{ staffId: administratorId }, { staffIds: administratorId }, { requestedStaffId: administratorId }, { requestedStaffIds: administratorId }] }).session(session);
    for (const booking of bookings) {
      const previous = assignedTrainerIds(booking), assigned = previous.filter(id => id !== administratorId), requested = requestedTrainerIds(booking).filter(id => id !== administratorId);
      const accepted = acceptedTrainerIds(booking).filter(id => assigned.includes(id));
      const complete = assigned.length > 0 && assigned.every(id => accepted.includes(id));
      if (previous.includes(administratorId)) {
        booking.staffId = assigned[0] || null; booking.staffIds = assigned;
        booking.trainerAcceptedIds = accepted;
        booking.trainerAcceptanceRequired = assigned.length > 0 && !complete;
        booking.trainerAcceptedAt = complete ? booking.trainerAcceptedAt || new Date() : null;
        if (!complete) booking.trainerAcceptedBy = null;
      }
      booking.requestedStaffId = requested[0] || null; booking.requestedStaffIds = requested;
      if (!assigned.length && !requested.length) unassignedRequests++;
      // Keep dates, payments and reservation rows. Sole-trainer visits await
      // reassignment; a joint appointment keeps its remaining real trainer.
      await booking.save({ session });
    }
    await TrainerSchedule.updateOne({ _id: administratorId }, { $set: { enabled: false }, $inc: { revision: 1 } }, { session });
    await Session.deleteMany({ userId: administratorId }, { session });
    await PasswordReset.deleteMany({ userId: administratorId }, { session });
    await AuditEvent.create([{ actorId: actor._id, action: 'administrator.removed', targetType: 'user', targetId: administratorId, details: { affectedRequests: bookings.length, unassignedRequests } }], { session });
  });
  res.json({ ok: true, unassignedRequests, message: `Administrator profile deleted and access revoked. Client appointments and history are preserved.${unassignedRequests ? ` ${unassignedRequests} training request(s) need a new trainer. Open the client schedules to reassign them.` : ''}` });
}
