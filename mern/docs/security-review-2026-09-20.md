# Session and recovery hardening — 20 September 2026

Targeted follow-up to the September 19 review. Existing upload permissions,
media scope checks, signed payment callbacks and customer ownership controls
remain in place.

## Changes

- Successful sign-ins retain the five newest active account sessions. Older
  sessions are revoked. Creation order is used even when session lifetimes differ.
- Administrator account and service edits have dedicated database-backed rate
  limits, in addition to the existing authentication and permission checks.

- Staff and owner/administrator sessions have an eight-hour absolute lifetime
  and a 30-minute authenticated-request inactivity limit, enforced server-side.
  Background authenticated requests count as activity; this is not a keyboard
  inactivity detector. Member sessions retain their seven-day lifetime.
- Legacy privileged sessions use ObjectId creation time for migration rather
  than receiving a new lifetime. Older staff/admin sessions may require login
  immediately after release. Activity updates cannot recreate revoked sessions.
- Recovery links bind to the target's credential version. Password, permission,
  and block/unblock changes invalidate older links. Removed accounts are excluded.
  Pre-release recovery links lacking a version must be reissued; links already
  expire after 30 minutes. Reset completion remains transactional and single-use.
- Session cookies are validated before hashing or database lookup across login,
  identification and logout, including cookie-parser JSON values.

## Verification

142 local unit tests and the production build passed. npm audit reported zero
known vulnerabilities. New database regressions exercise expiry, active sessions,
logout, recovery after permission/block cycles, single-use reset and malformed
cookies through the production application stack. The local MongoDB test process
could not start (exit 100), so database regressions must pass in hosted CI before
merging. CI also covers client workflows, authorization, uploads and browser login.

## Limits and follow-up

This is a scoped application hardening release, not a complete penetration test.
Provider MFA, backup/restore readiness, database network rules and infrastructure
permissions are not verified by these application tests. Application MFA is not
introduced in this release. Those remain separate work with a tested recovery path.

Reference: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
