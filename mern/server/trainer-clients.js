import { z } from 'zod';
import { Booking, User } from './models.js';
import { assignTrainer } from './bookings.js';
import { trainerSelectionInput, resolveTrainerIds } from './trainer-selection.js';
import { assignedTrainerIds, bookingTrainerIds, acceptedTrainerIds } from '../shared/trainers.js';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function allowedTrainer(req, staffId) {
  if (req.user.role !== 'owner' && String(req.user._id) !== staffId) throw fail('Only this trainer, an administrator, or the owner can accept this client.', 403);
  if (!await User.exists({ _id: staffId, role: { $in: ['staff', 'owner'] }, blocked: { $ne: true } })) throw fail('Choose an active trainer.', 404);
}
export async function trainerClients(req, res) {
  const staffId = id.parse(req.params.id); await allowedTrainer(req, staffId);
  const bookings = await Booking.find({ serviceIds: 'training', status: { $in: ['requested', 'confirmed', 'waitlisted'] }, $or: [{ staffId }, { staffIds: staffId }, { staffId: null, requestedStaffId: staffId }, { staffId: null, requestedStaffIds: staffId }] }).select('userId dogName dogCount status staffId staffIds requestedStaffId requestedStaffIds trainerAcceptedIds trainerAcceptanceRequired trainerAcceptedAt updatedAt').populate({ path: 'userId', model: User, select: 'name role' }).sort({ trainerAcceptanceRequired: -1, updatedAt: -1 }).limit(100).lean();
  res.json({ bookings: bookings.map(b => ({ ...b, acceptedByThisTrainer: acceptedTrainerIds(b).includes(staffId), clientRole: b.userId?.role, clientName: b.userId?.name || 'Former client', clientId: b.userId?._id || null, userId: undefined })) });
}
export async function acceptClient(req, res) {
  const bookingId = id.parse(req.params.id), { staffId, revision } = z.object({ staffId: trainerSelectionInput, revision: z.string().datetime() }).strict().parse(req.body);
  // A staff member can accept only for their own real identity, never for the pair.
  if (req.user.role !== 'owner' && staffId !== String(req.user._id)) throw fail('You can only accept clients for yourself.', 403);
  const acceptingIds = await resolveTrainerIds(staffId);
  for (const trainerId of acceptingIds) await allowedTrainer(req, trainerId);
  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.serviceIds.includes('training') || !['requested', 'confirmed', 'waitlisted'].includes(booking.status)) throw fail('Choose an active training request.', 404);
  if (booking.updatedAt.toISOString() !== revision) throw fail('This request changed. Refresh before accepting.', 409);
  const chosen = bookingTrainerIds(booking);
  if (chosen.length && acceptingIds.some(id => !chosen.includes(id))) throw fail('This client is assigned to another trainer. Reassign them first.', 409);
  if (acceptingIds.every(id => acceptedTrainerIds(booking).includes(id)) && assignedTrainerIds(booking).length) return res.json({ ok: true, message: 'This trainer has already accepted the client.', booking });
  const updated = await assignTrainer(booking, chosen.length ? chosen : acceptingIds, { acceptedBy: req.user._id, acceptingStaffIds: acceptingIds, expectedUpdatedAt: booking.updatedAt });
  res.json({ ok: true, message: updated.trainerAcceptanceRequired ? 'Client accepted by this trainer. Waiting for the other assigned trainer to accept.' : 'Client accepted. Their saved schedule now shows the assigned trainer names.', booking: updated });
}
