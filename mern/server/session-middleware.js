import cookieParser from 'cookie-parser';
import { securityHeaders, privateResponse } from './http-security.js';
import { connectDb } from './db.js';
import { identify, rateLimit } from './auth.js';

// Preserve ordering: cookies → connected database → identity → shared limiter.
// Authorization and body-size limits remain explicit at each route.
export function sessionMiddleware() {
  return [securityHeaders(), privateResponse, cookieParser(),
    async (_req, _res, next) => { await connectDb(); next(); },
    identify, rateLimit('api', 240, 60000)];
}
