// Server-side access policy. Owner identity must be explicitly configured.
export function requireUser(req, _res, next) { if (!req.user) throw Object.assign(new Error('Sign in to continue.'), { status: 401 }); next(); }
export function requireStaff(req, _res, next) { if (!['staff', 'owner'].includes(req.user?.role)) throw Object.assign(new Error('Bravo staff access required.'), { status: 403 }); next(); }
export function requireOwner(req, _res, next) { if (req.user?.role !== 'owner') throw Object.assign(new Error('Bravo owner access required.'), { status: 403 }); next(); }
export function isPrimaryOwner(user) {
  const ownerId = process.env.OWNER_USER_ID;
  return typeof ownerId === 'string' && /^[a-f0-9]{24}$/i.test(ownerId) &&
    user?._id != null && String(user._id).toLowerCase() === ownerId.toLowerCase();
}
// Access roles are private capabilities, not public job titles. Only the founder
// is presented as Owner; delegated owner access still appears publicly as staff.
export function publicRole(user) { return user.role === 'owner' && !isPrimaryOwner(user) ? 'staff' : user.role; }
