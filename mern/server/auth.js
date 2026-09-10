import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { Session, User, RateBucket } from './models.js';
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
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
export async function issueSession(req, res, user) {
  if (req.cookies[cookieName()]) await Session.deleteOne({ tokenHash: digest(req.cookies[cookieName()]) });
  const token = randomBytes(32).toString('hex');
  const maxAge = 1000 * 60 * 60 * 24 * 7;
  await Session.create({ tokenHash: digest(token), userId: user._id, expiresAt: new Date(Date.now() + maxAge) });
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge });
}
export async function signOut(req, res) {
  if (req.cookies[cookieName()]) await Session.deleteOne({ tokenHash: digest(req.cookies[cookieName()]) });
  res.clearCookie(cookieName(), cookieOptions());
}
export async function identify(req, _res, next) {
  const token = req.cookies[cookieName()];
  if (token) {
    const session = await Session.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
    if (session) {
      req.user = await User.findById(session.userId);
      // Bootstrap only the existing owner record, never a freely entered email.
      const ownerId = process.env.OWNER_USER_ID || '6aa290cbd066f8feb3c1964f';
      if (req.user && String(req.user._id) === ownerId && req.user.role !== 'owner' && !req.user.blocked) {
        req.user.role = 'owner'; await req.user.save();
      }
      if (req.user?.blocked) { await Session.deleteMany({ userId: req.user._id }); req.user = null; }
    }
  }
  next();
}
export function requireUser(req, _res, next) { if (!req.user) throw Object.assign(new Error('Sign in to continue.'), { status: 401 }); next(); }
export function requireStaff(req, _res, next) { if (!['staff', 'owner'].includes(req.user?.role)) throw Object.assign(new Error('Bravo staff access required.'), { status: 403 }); next(); }
export function requireOwner(req, _res, next) { if (req.user?.role !== 'owner') throw Object.assign(new Error('Bravo owner access required.'), { status: 403 }); next(); }
export function publicUser(user) { return { id: String(user._id), email: user.email, name: user.name, role: user.role, dogName: user.dogName, phone: user.phone, address: user.address, title: user.title, bio: user.bio, showPhone: user.showPhone }; }
export function sameOrigin(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const allowed = process.env.APP_ORIGIN || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '');
  if (!allowed || req.headers.origin !== allowed) throw Object.assign(new Error('This request must start from the Bravo website.'), { status: 403 });
  if (!req.is('application/json')) throw Object.assign(new Error('JSON request required.'), { status: 415 });
  next();
}
// Database-backed buckets apply across Node instances, not only one process.
export function rateLimit(scope, limit, milliseconds) {
  return async (req, _res, next) => {
    const bucket = Math.floor(Date.now() / milliseconds);
    const identity = req.user ? String(req.user._id) : req.ip;
    const key = digest(`${scope}:${identity}:${bucket}`);
    let doc;
    try {
      doc = await RateBucket.findOneAndUpdate({ _id: key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * milliseconds) } }, { upsert: true, new: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      doc = await RateBucket.findOneAndUpdate({ _id: key }, { $inc: { count: 1 } }, { new: true });
    }
    if (doc.count > limit) throw Object.assign(new Error('Too many attempts. Please wait and try again.'), { status: 429 });
    next();
  };
}
