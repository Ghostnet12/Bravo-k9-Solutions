import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { Session, User, RateBucket } from './models.js';
import { sessionLifetime, privilegedSessionExpired } from './session-policy.js';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored = '00000000000000000000000000000000:' + '0'.repeat(128)) {
  const [salt, encoded] = stored.split(':');
  const actual = await scrypt(password, salt, 64), expected = Buffer.from(encoded || '', 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-bravo_session' : 'bravo_session';
function sessionToken(req) {
  const token = req.cookies?.[cookieName()];
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
export async function issueSession(req, res, user) {
  const previous = sessionToken(req);
  if (previous) await Session.deleteOne({ tokenHash: digest(previous) });
  const token = randomBytes(32).toString('hex');
  const maxAge = sessionLifetime(user);
  const now = new Date();
  await Session.create({ tokenHash: digest(token), userId: user._id, credentialVersion: user.credentialVersion || 0, issuedAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + maxAge) });
  // ObjectId creation order also covers legacy sessions without issuedAt.
  // Expiry order is unsuitable because privileged and member lifetimes differ.
  const staleSessions = await Session.find({ userId: user._id, expiresAt: { $gt: new Date() } })
    .sort({ _id: -1 }).skip(5).select('_id').lean();
  if (staleSessions.length) await Session.deleteMany({ _id: { $in: staleSessions.map(session => session._id) } });
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge });
}
export async function signOut(req, res) {
  const previous = sessionToken(req);
  if (previous) await Session.deleteOne({ tokenHash: digest(previous) });
  res.clearCookie(cookieName(), cookieOptions());
}
export async function identify(req, res, next) {
  const token = sessionToken(req);
  if (token) {
    const session = await Session.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
    if (session) {
      req.user = await User.findById(session.userId).select('+credentialVersion');
      if (req.user && (privilegedSessionExpired(session, req.user) || (session.credentialVersion || 0) !== (req.user.credentialVersion || 0) ||
        (req.user.mustChangePassword && !(req.user.temporaryPasswordExpiresAt > new Date())))) {
        await Session.deleteOne({ tokenHash: session.tokenHash }); req.user = null;
      }
      if (req.user && ['staff', 'owner'].includes(req.user.role)) {
        // Conditional updates cannot recreate a session revoked by another request.
        // $max prevents concurrent requests from moving activity backwards.
        const active = await Session.updateOne({ _id: session._id }, { $max: { lastSeenAt: new Date() } });
        if (!active.matchedCount) req.user = null;
      }
      // Bootstrap only the existing owner record, never a freely entered email.
      if (req.user && isPrimaryOwner(req.user) && req.user.role !== 'owner' && !req.user.blocked) {
        req.user.role = 'owner'; await req.user.save();
      }
      if (req.user?.blocked || req.user?.removedAt) { await Session.deleteMany({ userId: req.user._id }); req.user = null; }
    }
  }
  // A temporary sign-in can only finish password setup or sign out. Enforce this
  // here so every app wrapper (schedules, lessons, messages, billing) agrees.
  const setupRoutes = ['GET /api/auth/me', 'POST /api/auth/password-setup', 'POST /api/auth/logout', 'POST /api/auth/login', 'POST /api/auth/recover'];
  if (req.user?.mustChangePassword && !setupRoutes.includes(`${req.method} ${req.originalUrl.split('?')[0]}`)) {
    return res.status(403).json({ error: 'Create your own password before continuing.', code: 'PASSWORD_SETUP_REQUIRED' });
  }
  next();
}
export function requireUser(req, _res, next) { if (!req.user) throw Object.assign(new Error('Sign in to continue.'), { status: 401 }); next(); }
export function requireStaff(req, _res, next) { if (!['staff', 'owner'].includes(req.user?.role)) throw Object.assign(new Error('Bravo staff access required.'), { status: 403 }); next(); }
export function requireOwner(req, _res, next) { if (req.user?.role !== 'owner') throw Object.assign(new Error('Bravo owner access required.'), { status: 403 }); next(); }
export function isPrimaryOwner(user) { return String(user?._id) === (process.env.OWNER_USER_ID || '6aa290cbd066f8feb3c1964f'); }
// Access roles are private capabilities, not public job titles. Only the founder
// is presented as Owner; delegated owner access still appears publicly as staff.
export function publicRole(user) { return user.role === 'owner' && !isPrimaryOwner(user) ? 'staff' : user.role; }
export function publicUser(user) { return { id: String(user._id), email: user.email, name: user.name, role: user.role, mustChangePassword: !!user.mustChangePassword, isPrimaryOwner: isPrimaryOwner(user), publicRole: publicRole(user), hasBillingAccount: !!user.stripeCustomerId, dogName: user.dogName, phone: user.phone, address: user.address, title: user.title, bio: user.bio, showPhone: user.showPhone }; }
export function sameOrigin(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const allowed = process.env.APP_ORIGIN || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '');
  if (!allowed || req.headers.origin !== allowed) throw Object.assign(new Error('This request must start from the Bravo website.'), { status: 403 });
  if (!req.is('application/json')) throw Object.assign(new Error('JSON request required.'), { status: 415 });
  next();
}
// Database-backed buckets apply across Node instances, not only one process.
export function rateLimit(scope, limit, milliseconds, identityFor = req => req.user ? String(req.user._id) : req.ip) {
  return async (req, res, next) => {
    const bucket = Math.floor(Date.now() / milliseconds);
    const identity = identityFor(req);
    const key = digest(`${scope}:${identity}:${bucket}`);
    let doc;
    try {
      doc = await RateBucket.findOneAndUpdate({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * milliseconds) } }, { upsert: true, returnDocument: 'after' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      doc = await RateBucket.findOneAndUpdate({ _id: key }, { $inc: { count: 1 } }, { returnDocument: 'after' });
    }
    const allowed = typeof limit === 'function' ? limit(req) : limit;
    if (doc.count > allowed) {
      const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * milliseconds - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      const minutes = Math.max(1, Math.ceil(retryAfter / 60));
      throw Object.assign(new Error(`Too many attempts. Please wait about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`), { status: 429 });
    }
    next();
  };
}
