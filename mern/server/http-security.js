import helmet from 'helmet';

export const PERMISSIONS_POLICY = 'camera=(self), microphone=(self), geolocation=(), accelerometer=(), gyroscope=(), magnetometer=(), usb=(), serial=(), hid=(), midi=()';

// One policy for the Express entry points. Keep Vercel's static-page policy
// aligned; deployment smoke checks verify both boundaries.
export function securityHeaders() {
  const helmetHeaders = helmet({
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
  return (req, res, next) => {
    // Restrict unused device APIs without disabling Bravo Live or media controls.
    res.set('Permissions-Policy', PERMISSIONS_POLICY);
    helmetHeaders(req, res, next);
  };
}

export function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  next();
}
