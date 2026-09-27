# Bravo security review — September 27, 2026

Scope: the existing Bravo MERN website, application API, client interfaces, dependencies, release pipeline and public production configuration. Baseline: `f6d72fc1d17f3602989556cc8917b750a1ba0693` on `bravo-mern`.

Four confirmed application findings are patched in this change: three medium severity and one low severity. Three operational risks remain open below. Severity reflects the required account access, exposed information and practical impact; these are not claims of a previous compromise. Exploit and permission tests use isolated fixtures. Production checks use unauthenticated GET requests, provider metadata and a counts-only MFA query; no client records, passwords, payment operations or provider settings were changed during testing.

## Findings and fixes

| ID | Severity | Finding | Patch | Regression evidence |
| --- | --- | --- | --- | --- |
| BRAVO-20260927-01 | Medium | `/api/groups` returned up to 300 active client names and account IDs to any registered account, even clients with no shared groups. Group creation/update also accepted unrelated client IDs. | Clients can select only themselves, active Bravo team members and existing contacts from active shared groups. The same restriction applies to API writes. Staff retain their operational directory; administrators can introduce clients. Removed/blocked accounts are excluded. Existing conversations remain accessible. | `security-audit.integration.js`: directory isolation, guessed IDs, archived groups, blocked/removed contacts, private group denial, existing groups and administrator introductions. |
| BRAVO-20260927-02 | Medium | Recovery issuance checked the administrator password before its transaction, without binding it to the authenticated credential version or rechecking the administrator at commit time. An in-flight recovery request could finish after access was revoked. | Use the existing password confirmation helper and transactional actor write lock. Credential changes, demotion, blocking and removal invalidate the action before creating a token. Recovery remains available to authorized administrators and the owner. | `security-audit.integration.js`: stale credentials, four revocation cases between password verification and transaction, zero reset tokens/audits on denial, successful authorized issuance. Existing one-time and target-revocation tests remain. |
| BRAVO-20260927-03 | Medium | New booking coverage combined the largest dog allowance across terms with the date coverage of another term. A current two-dog plan could incorrectly cover two dogs in a later one-dog term. The single-visit rescheduling endpoint also omitted the dog-count condition. | A qualifying term must cover both the visit date and its dog count. Extra dogs produce an unpaid, correctly priced booking; a covered request cannot move into an insufficient term. | `security-audit.integration.js`: two dogs require payment in the smaller future term, one dog stays covered, invalid rescheduling is rejected with the original visit retained. |
| BRAVO-20260927-04 | Low | Early-mounted ad and readiness routes did not consistently pass through Express security middleware, including error responses. Vercel supplied production headers, but direct Express hosting depended on route ordering. The live anonymous cron rejection also lacked no-store. | Install the common security headers and private API cache policy at the outer application boundary. | `http-security.test.js`: readiness failure, ad read failure, cross-origin rejection and cron denial retain the common policy without Vercel. Live checks now cover anonymous groups, bookings and cron requests. |

## Coverage

| Area | Review and existing controls checked |
| --- | --- |
| Authentication and recovery | Password hashing, bounded login attempts, literal identifier matching, temporary-password restrictions, opaque hashed sessions, cookie attributes, session limits and lifetime, credential-version revocation, logout, recovery expiry and single use. |
| MFA and sensitive actions | Encrypted authenticator secrets, atomic TOTP/recovery-code consumption, credential-bound setup/removal, primary-owner protection and password reconfirmation for administrator deletion. A counts-only production query confirmed privileged accounts have not enrolled; see the open risk below. |
| Authorization and client privacy | Anonymous/member/staff/administrator/owner boundaries; private schedules, bookings, support messages, group messages, notifications, membership grants, monitoring and media editing. Frontend visibility is not used as authorization. |
| Payments and memberships | Server-generated quotes, customer/booking ownership, signed raw Stripe webhooks, amount/currency/customer matching, replay handling, idempotent checkout/refunds, manual terms, dog-count limits and renewal rules. No real charge/refund was used for testing. |
| Content, uploads and lessons | Owner-only editing; constrained text/style/link fields; escaped rendered copy/workshops; upload size/chunk/type/signature checks; upload ownership and scope; private lesson entitlement checks; safe filenames and range streaming. Public images are intentionally public. |
| Scheduling and administration | Object ownership, privileged trainer controls, bounded dates, capacity/reservation transactions, removal safeguards, retained payment history and audit records. |
| Requests and errors | Same-origin JSON writes, parser size limits, sanitized parser/database/provider errors, no-store private responses, CSP, frame denial, MIME protection and HTTPS headers. |
| Dependencies and delivery | Locked npm dependencies, audit, Gitleaks, extended CodeQL, required release gate, branch protection, Dependabot and protected preview deployments. |

## Verification record and release gate

- Local `npm run lint`: passed.
- Local `npm run build`: passed.
- Local `npm test`: 163 tests passed, zero failed or skipped.
- `npm audit --json`: zero known vulnerabilities across 341 dependency records on the review date. This is a point-in-time registry result, not proof that every dependency is vulnerability-free.
- Public production baseline: homepage, health/readiness and anonymous MFA denial passed the existing header checks. Sixteen unauthenticated private/cron GET endpoints returned 401; environment, Git metadata and private-media probes returned 404. Public ads and private-page HTML shells returned 200 with CSP, frame denial, MIME protection and HSTS. HTML shells contained no authenticated API data. The cron denial's missing no-store is addressed in finding 04.
- Local database integration execution was blocked before tests began: the sandbox rejected MongoDB's `open` operation and the process exited 100. No production database was substituted. The new real-database suite is included in the required hosted `verify` job.
- Release requires the current commit's hosted database/browser tests, dependency audit, Gitleaks, extended CodeQL and `Bravo release gate` to pass. The pull request's checks provide the final execution record; this source document does not predeclare pending CI results.
- Verified active GitHub rule `Bravo production protection` targets `bravo-mern`, requires a pull request, resolved review threads and up-to-date `verify` plus `Bravo release gate`, prohibits branch deletion/force pushes and has no bypass actors. Reviewer approval count remains zero.
- Verified Dependabot configuration on the default `main` branch as well as the application branch. Verified Vercel preview SSO protection (`all_except_custom_domains`) remains enabled.

## Open operational risks and concrete next steps

| ID | Severity / status | Observed evidence | Safe completion steps |
| --- | --- | --- | --- |
| BRAVO-OPS-01 | Medium — open | Read-only Atlas inspection confirms a project-wide all-IPv4 network rule. Authentication is still required; this does not mean the database is anonymously readable. The cluster also serves other applications. | Inventory every dependent application's outbound addresses; establish stable approved egress; add those addresses while preserving operator access; verify every app; then remove the broad rule with a rollback plan. Removing it before that work could disconnect Bravo and other apps. Existing instructions in `mfa-operations.md` defer new recurring costs, so no paid networking change was made. |
| BRAVO-OPS-02 | Medium — open | Atlas reports a Free cluster, which has no managed Atlas snapshots. An encrypted manual backup destination and successful isolated restore have not been verified. | Keep the current tier: choose an owner-controlled encrypted backup destination and a restricted Bravo-only backup credential, schedule a write-free maintenance window, make and verify a scoped logical backup, and restore to an isolated target with external effects disabled. Follow `mfa-operations.md` and `owner-reauthentication.md`; separately escrow the MFA key. Do not export customer data to source control or general CI artifacts. A paid backup tier remains an optional spending decision, not a prerequisite to manual backups. |
| BRAVO-OPS-03 | Medium — owner action required | A read-only aggregate of active privileged Bravo accounts found no enrolled MFA accounts. Only counts were retrieved; no passwords, secrets, recovery codes or session tokens were read. | Each owner/administrator/staff user opens Account → Two-step verification, confirms their password, adds the setup key to their own authenticator, verifies a code and saves recovery codes securely. The account holder must complete this step. Enrollment remains opt-in to avoid locking out accounts without an enrolled factor; do not fabricate or retain their factor. |

Atlas metadata also confirms a Bravo-only read/write database principal scoped to this cluster. Other application/admin principals have broader access; they were not changed. The production environment's actual credential binding remains unverified. No open Atlas alerts were returned at inspection time; this is not evidence of backup readiness or complete security monitoring.

## Limits

This is a code/configuration review with automated regression and public production checks, not a certification or exhaustive penetration test. It does not establish that no breach has occurred.

Provider account MFA, backup restoration success, secret rotation history, Stripe Dashboard access policy and direct Vercel deployment credential scope remain **unverified**, not marked secure. Stripe's connector returned a reauthentication requirement, so its live Dashboard configuration was not inspected. Stripe integration code and isolated tests were reviewed. No production credentials or account settings were guessed or changed.

No destructive production probing, load testing, credential guessing, client account impersonation or live payment testing was performed. Keep the current protected release path and run these regression suites on subsequent changes.

References: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [OWASP ASVS cheat-sheet index](https://cheatsheetseries.owasp.org/IndexASVS.html), [Stripe webhook verification](https://docs.stripe.com/webhooks/signature), [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [Atlas backup options](https://www.mongodb.com/docs/atlas/backup-restore-cluster/).
