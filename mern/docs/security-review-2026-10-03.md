# Bravo security hardening — October 3, 2026

Baseline: production branch `bravo-mern`, commit `2e7adc419ac3de3c8e16ed007f8bcb7a9124e02d`. The production alias was verified against this commit through Vercel metadata. This is a targeted review and hardening release, not a claim of invulnerability or an exhaustive penetration test.

## Changes

- Role changes, blocking and restoration now require the acting administrator's current password. An authenticated session alone is insufficient. Ordinary profile edits keep their existing flow.
- The access-change transaction locks the credential-verified actor and checks the target credential version. Concurrent actor demotion, blocking, removal or password rotation aborts the change. Target credential changes also abort stale edits.
- Access changes invalidate existing sessions and password-recovery links atomically. Block and restore operations now have explicit audit events. Submitted passwords are excluded from stored profile fields, public responses and audit records.
- The required browser suite also exposed a pre-existing review-editor focus race: a delayed animation callback could redirect review text into the author field. Editor focus now runs synchronously when the editor opens; the unchanged Chromium mobile/desktop regression passes.
- Release testing also exposed a trainer-selection state race during assignment refresh. The form now follows the saved assignment when that assignment changes. Browser fixtures wait for refreshed records before interacting, and ordinary scheduling fixtures select weekdays; separate weekend opt-in coverage remains.
- An accessible password dialog supports cancellation, keyboard submission and error recovery. Its password input is cleared on submission and closure; passwords are not stored in React state or browser storage.
- Every reusable action in Bravo's workflow files is pinned to a full commit SHA. Remaining checkout steps disable credential persistence. Pins for checkout, setup-node and upload-artifact were verified against official upstream repository tags.
- Vercel installs from the lockfile using `npm ci --include=dev --ignore-scripts`. Build tools such as Vite must be included even when npm uses production defaults; dependency install scripts stay disabled. Test workflows also disable dependency install scripts; intentional build, browser setup and test commands remain explicit.
- The application declares Node 24.x, matching Vercel's project setting and every existing CI workflow. Vercel manages minor/security patch rollout; the exact runtime patch must be verified from provider deployment evidence when needed. This release does not claim to pin a patch version.

## Research and applicability

Primary sources checked during this review:

1. [Node.js security release feed](https://nodejs.org/en/blog/vulnerability) and [July 29, 2026 advisory](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases): runtime and bundled-library fixes remain relevant to dependency/runtime maintenance. This is not a finding that every listed issue is reachable in Bravo.
2. [React Server Components advisory](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components): Bravo uses client React with Vite and Express, with no RSC server packages in its lockfile. The RSC-specific attack surface was not found; no unnecessary framework migration was made.
3. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [ASVS](https://owasp.org/projects/asvs): fresh credentials for sensitive operations and server-side authorization informed this patch.
4. [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use): immutable action references, least privilege and reduced checkout credential exposure.
5. [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/): input validation, secure cookies, security headers, brute-force controls and dependency audit. Bravo's existing implementations were retained.
6. [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): package engines override project settings; Vercel rolls out minor/patch updates.
7. [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/) and [Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/): scoped access and backup constraints remain operational work.
8. [CISA's official KEV mirror](https://github.com/cisagov/kev-data): reference for exploitation-informed prioritization. The main CISA catalog page returned HTTP 403 during research. No exhaustive KEV-to-dependency match is claimed.

## Verification

- Local lint and production build passed.
- The first production deployment of PR #77 failed with build exit 127 and did not replace the healthy live deployment. A clean local `NODE_ENV=production` install reproduced the missing Vite build command. Explicit `--include=dev` corrected the production-mode install/build; the security workflow now exercises this install condition. Provider build logs were unavailable through the connector, so the diagnosis uses deployment metadata and the local reproduction.
- Local unit/HTTP suite: 171 passed, zero failures/skips.
- Local isolated MongoDB suites (`access-reauth`, `security-hardening`, `security-audit`): 29 tests passed, including both actor and target revocation races. No Atlas client data was used.
- npm audit of the locked application dependencies returned zero known vulnerabilities at review time (341 dependency records). This is a point-in-time advisory result, not a guarantee of absence of unknown vulnerabilities.
- Production baseline: homepage, health, database readiness and unauthenticated denial of MFA/groups/bookings/cron passed the existing read-only security-header checks.
- Local Chromium browser regression passed at 390px and 1440px. WebKit depends on the hosted runner because local system libraries are missing. The new browser regression covers mobile/desktop Chromium and WebKit. The pull request's hosted checks are authoritative for release; pending checks are not predeclared passed in this document.
- Vercel preview build and public health check passed. Preview reports `missing_configuration` for the database, so authenticated preview verification is unavailable; isolated database suites cover these flows. Production readiness must be checked after release.
- Active production ruleset still requires a PR, current `verify` and `Bravo release gate`, resolved review threads, and prohibits force pushes/deletion without bypass actors. Preview SSO protection is enabled.

## Remaining operational work

| Item | Observed state and completion requirement |
| --- | --- |
| Authenticator enrollment | Existing MFA implementation is present. The September 27 review reported no enrolled privileged users; this review has not re-read account records, so current enrollment is unverified. Each account holder must enroll their own factor and save recovery codes. Do not enforce enrollment blindly or create another person's factor. |
| Database network restriction | Read-only Atlas metadata still shows a project-wide all-IPv4 access rule. Authentication is required. Inventory all dependent apps and establish approved outbound addresses before narrowing the shared rule; premature removal can take Bravo and other apps offline. |
| Backups and recovery | Atlas remains on the Free tier. An owner-controlled encrypted backup destination and isolated restore have not been verified. Follow `mfa-operations.md`; separately escrow the MFA key. Do not put client exports in Git or CI artifacts. |
| Database credential scope | A Bravo-only read/write principal exists, but the production environment's credential binding is unverified. Other shared-project principals have broader roles. Do not modify unrelated apps' users. |
| Provider access | GitHub/Vercel/Atlas/Stripe account MFA, recovery controls, deployment credential scope, secrets rotation history and live firewall policy remain unverified. The Vercel build-log connector was unavailable during inspection. |

No paid tier upgrade, database export, real charge/refund, live account impersonation, destructive probing or load test was performed. No new production secret is required by this patch. Preserve the protected release path, verify the deployed commit/alias after merge, and then rerun public health/security checks.
