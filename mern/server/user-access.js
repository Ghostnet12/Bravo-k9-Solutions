import { z } from 'zod';
import { User, Session, PasswordReset, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { isPrimaryOwner, publicUser } from './auth.js';
import { confirmOwnerPassword, lockOwnerReauthentication } from './reauthentication.js';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export async function updateUserAccess(req, res) {
  const target = await User.findById(objectId.parse(req.params.id)).select('+credentialVersion');
  if (!target || target.removedAt) return res.status(404).json({ error: 'Account not found.' });
  const { currentPassword, confirmOwnerAccess, ...fields } = z.object({ currentPassword: z.string().min(1).max(128).optional(), role: z.enum(['member', 'staff', 'owner']).optional(), confirmOwnerAccess: z.boolean().optional(), email: z.string().trim().email().max(254).transform(value => value.toLowerCase()).optional(), dogName: z.string().trim().max(80).optional(), address: z.string().trim().max(300).optional(), name: z.string().trim().min(2).max(80).optional(), phone: z.string().trim().max(30).optional(), title: z.string().trim().max(80).optional(), bio: z.string().trim().max(8000).optional(), showPhone: z.boolean().optional(), blocked: z.boolean().optional(), mutedUntil: z.union([z.string().datetime(), z.null()]).optional() }).parse(req.body);
  if (fields.email && (target.role !== 'member' || target.email)) throw new Error('An email can only be added to a client who does not have one yet.');
  const changesRole = fields.role !== undefined && fields.role !== target.role;
  if (changesRole && fields.role !== 'member' && target.mustChangePassword) throw new Error('This client must choose their own password before receiving staff permissions.');
  const removesAccess = (fields.role !== undefined && fields.role !== 'owner') || fields.blocked === true || !!fields.mutedUntil;
  if (isPrimaryOwner(target) && removesAccess) throw new Error('The primary owner’s access is protected.');
  if (String(target._id) === String(req.user._id) && removesAccess) throw new Error('You cannot remove your own administrator access.');
  if (changesRole && fields.role === 'owner') {
    if (target.role !== 'staff') throw new Error('Promote this customer to staff before granting administrator access.');
    if (target.blocked || fields.blocked || (target.mutedUntil && target.mutedUntil > new Date()) || fields.mutedUntil) throw new Error('Restore this staff account before granting administrator access.');
    if (confirmOwnerAccess !== true) throw new Error('Confirm that this staff member should receive full owner-level privileges.');
  }
  const changesBlocked = fields.blocked !== undefined && fields.blocked !== target.blocked;
  const changesAccess = changesRole || changesBlocked;
  // A stolen/unattended session alone cannot grant privileges or restore access.
  if (changesAccess && !currentPassword) throw Object.assign(new Error('Confirm your current owner password.'), { status: 403 });
  const proof = changesAccess ? await confirmOwnerPassword(req.user, currentPassword) : null;
  let updated;
  await transaction(async session => {
    if (proof) await lockOwnerReauthentication(proof, session);
    // Compare the role so concurrent saves cannot silently overwrite a promotion.
    updated = await User.findOneAndUpdate({ _id: target._id, removedAt: null, role: target.role, blocked: target.blocked, credentialVersion: target.credentialVersion || { $in: [0, null] }, ...(changesRole && fields.role !== 'member' ? { mustChangePassword: { $ne: true } } : {}), ...(fields.email ? { email: null } : {}) }, { $set: fields, ...((changesAccess || fields.title !== undefined || fields.bio !== undefined || fields.name !== undefined) ? { $inc: { ...(changesAccess ? { credentialVersion: 1 } : {}), publicProfileRevision: 1 } } : {}) }, { returnDocument: 'after', runValidators: true, session });
    if (!updated) throw Object.assign(new Error('This account changed. Refresh it before saving again.'), { status: 409 });
    if (changesRole) await AuditEvent.create([{ actorId: req.user._id, action: 'user.access.changed', targetType: 'user', targetId: String(target._id), details: { from: target.role, to: fields.role } }], { session });
    if (changesBlocked) await AuditEvent.create([{ actorId: req.user._id, action: 'user.block.changed', targetType: 'user', targetId: String(target._id), details: { from: target.blocked, to: fields.blocked } }], { session });
    if (changesAccess) {
      await Session.deleteMany({ userId: updated._id }, { session });
      await PasswordReset.deleteMany({ userId: updated._id }, { session });
    }
  });
  res.json({ user: publicUser(updated) });
}
