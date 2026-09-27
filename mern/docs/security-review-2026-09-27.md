# Bravo security review — September 27, 2026

Scope: the existing Bravo MERN website, application API, client interfaces, dependencies, release pipeline and public production configuration. Baseline: `f6d72fc1d17f3602989556cc8917b750a1ba0693` on `bravo-mern`.

Four confirmed findings are patched in this change: three medium severity and one low severity. Severity reflects the required account access, exposed information and practical impact; these are not claims of a previous compromise. Exploit and permission tests use isolated fixtures. Production checks use unauthenticated GET requests only; no client records, passwords, payment operations or provider settings were changed during testing.

## Findings and fixes

| ID | Severity | Finding | Patch | Regression evidence |
| --- | --- | --- | --- | --- |
| BRAVO-20260927-01 | Medium | `/api/groups` returned up to 300 active client names and account IDs to any registered account, even clients with no shared groups. Group creation/update also accepted unrelated client IDs. | Clients can select only themselves, active Bravo team members and existing contacts from active shared groups. The same restriction applies to API writes. Staff retain their operational directory; administrators can introduce clients. Removed/blocked accounts are excluded. Existing conversations remain accessible. | `security-audit.integration.js`: directory isolation, guessed IDs, archived groups, blocked/removed contacts, private group denial, existing groups and administrator introductions. |
| BRAVO-20260927-02 | Medium | Recovery issuance checked the administrator password before its transaction, without binding it to the authenticated credential version or rechecking the administrator at commit time. An in-flight recovery request could finish after access was revoked. | Use the existing password confirmation helper and transactional actor write lock. Credential changes, demotion, blocking and removal invalidate the action before creating a token. Recovery remains available to authorized administrators and the owner. | `security-audit.integration.js`: stale credentials, four revocation cases between password verification and transaction, zero reset tokens/audits on denial, successful authorized issuance. Existing one-time and target-revocation tests remain. |
| BRAVO-20260927-03 | Medium | New booking coverage combined the largest dog allowance across terms with the date coverage of another term. A current two-dog plan could incorrectly cover two dogs in a later one-dog term. The single-visit rescheduling endpoint also omitted the dog-count condition. | A qualifying term must cover both the visit date and its dog count. Extra dogs produce an unpaid, correctly priced booking; a covered request cannot move into an insufficient term. | `security-audit.integration.js`: two dogs require payment in the smaller future term, one dog stays covered, invalid rescheduling is rejected with the original visit retained. |
| BRAVO-20260927-04 | Low | Early-mounted ad and readiness routes did not consistently pass through Express security middleware, including error responses. Vercel supplied production headers, but direct Express hosting depended on route ordering. | Install the common security headers and private API cache policy at the outer application boundary. | `http-security.test.js`: readiness failure, ad read failure and cross-origin rejection retain CSP, frame denial, MIME protection and no-store without Vercel. |

## Coverage

| Area | Review and existing controls checked |
| --- | --- |
| Authentication and recovery | Password hashing, bounded login attempts, literal identifier matching, temporary-password restrictions, opaque hashed sessions, cookie attributes, session limits and lifetime, credential-version revocation, logout, recovery expiry and single use. |
| MFA and sensitive actions | Encrypted authenticator secrets, atomic TOTP/recovery-code consumption, credential-bound setup/removal, primary-owner protection and password reconfirmation for administrator deletion. Enrollment is available; production enrollment status was not accessed. |
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
- Public production baseline: homepage, health/readiness and anonymous MFA denial passed the existing header checks. Additional private endpoint and exposed-file GET checks are recorded during the release verification.
- Local database integration execution was blocked before tests began: the sandbox rejected MongoDB's `open` operation and the process exited 100. No production database was substituted. The new real-database suite is included in the required hosted `verify` job.
- Release requires the current commit's hosted database/browser tests, dependency audit, Gitleaks, extended CodeQL and `Bravo release gate` to pass. The pull request's checks provide the final execution record; this source document does not predeclare pending CI results.
- Verified active GitHub rule `Bravo production protection` targets `bravo-mern`, requires a pull request, resolved review threads and up-to-date `verify` plus `Bravo release gate`, prohibits branch deletion/force pushes and has no bypass actors. Reviewer approval count remains zero.
- Verified Dependabot configuration on the default `main` branch as well as the application branch. Verified Vercel preview SSO protection (`all_except_custom_domains`) remains enabled.

## Limits and operational follow-up

This is a code/configuration review with automated regression and public production checks, not a certification or exhaustive penetration test. It does not establish that no breach has occurred.

The available integrations do not establish Atlas network restrictions, database-role least privilege, backup restoration success, provider account MFA, production staff MFA enrollment, secret rotation history, Stripe Dashboard access policy or direct Vercel deployment credential scope. These are explicitly **unverified**, not marked secure. Provider-level changes and restore drills require access to those controls and a planned recovery test; no production credentials or account settings were guessed or changed.

No destructive production probing, load testing, credential guessing, client account impersonation or live payment testing was performed. Keep the current protected release path and run these regression suites on subsequent changes.

References: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [OWASP ASVS cheat-sheet index](https://cheatsheetseries.owasp.org/IndexASVS.html), [Stripe webhook verification](https://docs.stripe.com/webhooks/signature).
