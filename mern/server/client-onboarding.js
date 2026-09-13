import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { User, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { hashPassword, publicUser } from './auth.js';
import { MemberAccess, manualGrantInput, manualGrantTerm, writeMemberGrant } from './member-grants.js';
const inputSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), name: z.string().trim().min(2).max(80),
  dogName: z.string().trim().max(80).default(''), phone: z.string().trim().max(30).default(''), address: z.string().trim().max(300).default(''),
  membership: manualGrantInput.extend({ startDate: z.string() }).optional(),
});
export async function createClientAccount(req, res) {
  const { membership, ...input } = inputSchema.parse(req.body);
  if (membership) manualGrantTerm(membership.startDate); // Validate before any writes.
  await MemberAccess.init();
  const temporaryPassword = `Bravo-${randomUUID().replaceAll('-', '').slice(0, 18)}!`;
  const passwordHash = await hashPassword(temporaryPassword);
  let user, access;
  await transaction(async session => {
    const actor = await User.findById(req.user._id).select('role blocked').session(session);
    if (!actor || actor.blocked || actor.role !== 'owner') throw Object.assign(new Error('Administrator or owner access is required.'), { status: 403 });
    [user] = await User.create([{ ...input, role: 'member', passwordHash }], { session });
    if (membership) access = await writeMemberGrant({ userId: user._id, actorId: req.user._id, enabled: true, ...membership }, session);
    await AuditEvent.create([{ actorId: req.user._id, action: 'client.created', targetType: 'user', targetId: String(user._id), details: { assistedOnboarding: true, membership: !!membership } }], { session });
  });
  res.status(201).json({ user: publicUser(user), temporaryPassword, membership: access });
}
