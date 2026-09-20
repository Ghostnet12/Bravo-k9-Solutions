import { z } from 'zod';
import { requireUser, rateLimit } from './auth.js';
import { mfaConfigured } from './mfa-crypto.js';
import { beginEnrollment, finishEnrollment, disableMfa } from './mfa-service.js';
const password = z.string().min(1).max(128), code = z.string().trim().min(6).max(40);
export function mfaRoutes(app) {
  const guard = [requireUser, rateLimit('mfa-manage', 10, 900000)];
  app.get('/api/auth/mfa', requireUser, (req, res) => res.json({ enabled: !!req.user.mfaEnabled, available: mfaConfigured() }));
  app.post('/api/auth/mfa/enroll', ...guard, async (req, res) => {
    const input = z.object({ currentPassword: password }).strict().parse(req.body);
    res.json(await beginEnrollment(req.user, input.currentPassword));
  });
  app.post('/api/auth/mfa/confirm', ...guard, async (req, res) => {
    const input = z.object({ currentPassword: password, token: z.string().regex(/^[a-f0-9]{32}$/), code }).strict().parse(req.body);
    res.json(await finishEnrollment(req, res, input));
  });
  app.post('/api/auth/mfa/disable', ...guard, async (req, res) => {
    const input = z.object({ currentPassword: password, code }).strict().parse(req.body);
    res.json(await disableMfa(req, res, input));
  });
}
