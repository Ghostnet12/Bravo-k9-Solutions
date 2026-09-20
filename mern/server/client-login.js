import { verifyLoginFactor } from './mfa-service.js';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { User, Session, PasswordReset, AuditEvent } from './models.js';
import { transaction } from './db.js';
import { hashPassword, verifyPassword, issueSession, publicUser, rateLimit } from './auth.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const unavailable = 'Sign-in is unavailable. Check your details or contact Bravo.';
// Hash-backed shared buckets also bound attacks spread across source addresses.
// Normalize exactly as the literal email/name lookup does. Never store plaintext identifiers.
const limitIdentifier = rateLimit('login-identifier', 30, 900000, req => req.loginIdentifier);
export async function temporaryCredential() {
  const temporaryPassword = `Bravo-${randomBytes(16).toString('hex')}!`;
  const temporaryPasswordExpiresAt = new Date(Date.now() + 7 * 86400000);
  return { temporaryPassword, temporaryPasswordExpiresAt, passwordHash: await hashPassword(temporaryPassword) };
}

export async function login(req, res) {
  // Keep the old email contract for existing clients; the new form uses identifier.
  const input = z.object({ identifier: z.string().trim().min(1).max(254).optional(), email: z.string().trim().email().max(254).optional(), password: z.string().min(1).max(128), code: z.string().trim().max(40).optional() }).parse(req.body);
  const identifier = input.identifier || input.email;
  if (!identifier) throw fail(unavailable);
  req.loginIdentifier = identifier.toLowerCase();
  await limitIdentifier(req, res, () => {});
  let candidates;
  if (identifier.includes('@')) {
    const user = await User.findOne({ email: identifier.toLowerCase() }).select('+passwordHash +credentialVersion +mfa');
    candidates = user ? [user] : [];
  } else {
    // Names are deliberately not unique. Match the full literal name and verify
    // the password, never select the first person with a matching name.
    const pattern = new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    candidates = await User.find({ name: pattern, role: 'member', blocked: { $ne: true }, removedAt: null }).select('+passwordHash +credentialVersion +mfa').limit(11);
  }
  if (!candidates.length || candidates.length > 10) {
    await verifyPassword(input.password);
    return res.status(401).json({ error: unavailable });
  }
  const matches = [];
  for (const candidate of candidates) {
    if (await verifyPassword(input.password, candidate.passwordHash) && !candidate.blocked && !candidate.removedAt &&
      (!candidate.mustChangePassword || candidate.temporaryPasswordExpiresAt > new Date())) matches.push(candidate);
  }
  if (matches.length !== 1) return res.status(401).json({ error: unavailable });
  const user = matches[0];
  if (user.mfaEnabled && !input.code) return res.status(401).json({ error: 'Enter your authenticator code or a recovery code.', code: 'MFA_REQUIRED' });
  await verifyLoginFactor(user, input.code);
  await issueSession(req, res, user);
  res.json({ user: publicUser(user) });
}

// Staff can replace only an unclaimed temporary credential, never a client's
// chosen password or a staff/admin password. No recoverable plaintext is stored.
export async function replaceTemporaryPassword(req, res) {
  const id = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.id);
  z.object({ confirmReplacement: z.literal(true) }).strict().parse(req.body);
  const credential = await temporaryCredential();
  let user;
  await transaction(async session => {
    const actor = await User.findById(req.user._id).select('role blocked').session(session);
    if (!actor || actor.blocked || !['staff', 'owner'].includes(actor.role)) throw fail('Bravo staff access required.', 403);
    user = await User.findOneAndUpdate({ _id: id, role: 'member', blocked: false, removedAt: null, mustChangePassword: true }, {
      $set: { passwordHash: credential.passwordHash, temporaryPasswordExpiresAt: credential.temporaryPasswordExpiresAt }, $inc: { credentialVersion: 1 },
    }, { returnDocument: 'after', session });
    if (!user) throw fail('This client no longer needs a temporary password. Refresh People & access or ask an administrator for account recovery.', 409);
    await Session.deleteMany({ userId: user._id }, { session });
    await PasswordReset.deleteMany({ userId: user._id }, { session });
    await AuditEvent.create([{ actorId: actor._id, action: 'password.temporary-replaced', targetType: 'user', targetId: String(user._id) }], { session });
  });
  res.json({ user: publicUser(user), temporaryPassword: credential.temporaryPassword, temporaryPasswordExpiresAt: credential.temporaryPasswordExpiresAt });
}

export async function completePasswordSetup(req, res) {
  const { password } = z.object({ password: z.string().min(12).max(128) }).strict().parse(req.body);
  const current = await User.findById(req.user._id).select('+passwordHash +credentialVersion');
  if (!current?.mustChangePassword || current.blocked || current.role !== 'member' || !(current.temporaryPasswordExpiresAt > new Date()) || (current.credentialVersion || 0) !== (req.user.credentialVersion || 0)) throw fail('Sign in again with your latest temporary password.', 409);
  if (await verifyPassword(password, current.passwordHash)) throw fail('Choose a new password different from your temporary password.');
  const passwordHash = await hashPassword(password);
  let user;
  await transaction(async session => {
    user = await User.findOneAndUpdate({ _id: current._id, passwordHash: current.passwordHash, mustChangePassword: true, blocked: false, role: 'member', temporaryPasswordExpiresAt: { $gt: new Date() } }, {
      $set: { passwordHash, mustChangePassword: false }, $unset: { temporaryPasswordExpiresAt: 1 }, $inc: { credentialVersion: 1 },
    }, { returnDocument: 'after', session }).select('+credentialVersion');
    if (!user) throw fail('Your sign-in changed. Sign in again with your latest temporary password.', 409);
    await Session.deleteMany({ userId: user._id }, { session });
    await PasswordReset.deleteMany({ userId: user._id }, { session });
    await AuditEvent.create([{ actorId: user._id, action: 'password.setup-completed', targetType: 'user', targetId: String(user._id) }], { session });
  });
  await issueSession(req, res, user);
  res.json({ user: publicUser(user) });
}
