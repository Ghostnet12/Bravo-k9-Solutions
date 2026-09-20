import helmet from 'helmet';

// One policy for the Express entry points. Keep Vercel's static-page policy
// aligned; deployment smoke checks verify both boundaries.
export function securityHeaders() {
  return helmet({
    xFrameOptions: { action: 'deny' },
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'"],
      frameSrc: ['https://www.facebook.com'], frameAncestors: ["'none'"],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    } },
  });
}

export function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  next();
}
