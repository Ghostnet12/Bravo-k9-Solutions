import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { User, Session, PasswordReset, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { digest, hashPassword, verifyPassword } from './auth.js';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export async function issueRecovery(req, res) {
  const targetId = id.parse(req.params.id);
  const { currentPassword } = z.object({ currentPassword: z.string().min(1).max(128) }).strict().parse(req.body);
  const actor = await User.findById(req.user._id).select('+passwordHash');
  if (!actor || actor.blocked || actor.role !== 'owner' || !await verifyPassword(currentPassword, actor.passwordHash)) throw fail('Confirm your administrator password.', 403);
  const target = await User.findOne({ _id: targetId, role: 'member', blocked: false, removedAt: null }).select('name +credentialVersion');
  if (!target) throw fail('Choose an unblocked client account.', 404);
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60000);
  await transaction(async dbSession => {
    // A credential/permission change between verification and issuance must not
    // produce a recovery token for the newer account state.
    const eligible = await User.exists({ _id: targetId, role: 'member', blocked: false, removedAt: null, credentialVersion: target.credentialVersion || { $in: [0, null] } }).session(dbSession);
    if (!eligible) throw fail('This account changed. Refresh before issuing a recovery link.', 409);
    await PasswordReset.deleteMany({ userId: targetId }, { session: dbSession });
    await PasswordReset.create([{ _id: digest(token), userId: targetId, credentialVersion: target.credentialVersion || 0, expiresAt }], { session: dbSession });
    await AuditEvent.create([{ actorId: actor._id, action: 'password.recovery-issued', targetType: 'user', targetId }], { session: dbSession });
  });
  res.json({ url: `${process.env.APP_ORIGIN}/reset-password#${token}`, expiresAt });
}

export async function completeRecovery(req, res) {
  const input = z.object({ token: z.string().regex(/^[a-f\d]{64}$/), password: z.string().min(12).max(128) }).strict().parse(req.body);
  const passwordHash = await hashPassword(input.password);
  await transaction(async dbSession => {
    const reset = await PasswordReset.findOneAndDelete({ _id: digest(input.token), expiresAt: { $gt: new Date() } }, { session: dbSession });
    if (!reset || !Number.isInteger(reset.credentialVersion)) throw fail('This recovery link is invalid or expired. Ask Bravo for a new link.', 400);
    const result = await User.updateOne({ _id: reset.userId, role: 'member', blocked: false, removedAt: null, credentialVersion: reset.credentialVersion || { $in: [0, null] } }, { $set: { passwordHash, mustChangePassword: false }, $unset: { temporaryPasswordExpiresAt: 1 }, $inc: { credentialVersion: 1 } }, { session: dbSession });
    if (!result.matchedCount) throw fail('Contact Bravo for account assistance.', 403);
    await Session.deleteMany({ userId: reset.userId }, { session: dbSession });
    await AuditEvent.create([{ actorId: reset.userId, action: 'password.recovered', targetType: 'user', targetId: String(reset.userId) }], { session: dbSession });
  });
  res.json({ ok: true });
}
