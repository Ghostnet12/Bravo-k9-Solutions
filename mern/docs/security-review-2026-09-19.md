# Bravo security and indexing review — 19 September 2026

Scope: production branch `bravo-mern`, public HTTPS responses, application source,
dependency advisories and isolated regression tests. No customer records, live
payments, credentials or production uploads were modified to perform the review.
This is a targeted application review, not a certification or a guarantee that
every vulnerability has been found.

## Indexing findings

All eight canonical public pages returned HTTP 200, substantive pre-rendered HTML,
unique metadata, matching HTTPS canonical links and `index, follow` at review time:
`/`, `/dog-training`, `/behavior-assessment`, `/dog-walking`, `/learn`, `/contact`,
`/accessibility`, `/media-rights`. The sitemap contains exactly these routes.
HTTP redirects to HTTPS; `.html` aliases redirect to clean URLs and preserve queries.
An unknown URL returns an actual 404, not a homepage soft-404.

The crawler allowlist had not been updated for public proof videos or the public
trainer schedule. Added narrowly scoped read URLs, including video pagination and
posters. Private lesson playback, administration and editing routes remain excluded.
Robots rules are discovery controls; server authorization protects private data.

Account, booking portal, schedule, password reset, community and staff pages
intentionally remain `noindex` and outside the sitemap. They must not be made
indexable to make an exclusion count disappear. No Google notice or list of the
reported ten URLs was available during the review, so their exact reasons are
not yet diagnosed. Google decides whether and when eligible pages are indexed.

The production project lists `bravounleashed.com`, but not `www.bravounleashed.com`.
A request to the www variant returned 502 from the checking environment. Confirm
its DNS and add a canonical redirect if www is intended to work; do not describe
this as a confirmed origin outage without DNS/provider evidence.

## Security changes

- Authentication throttles for login, registration and recovery now use the
  source IP regardless of the current session. Switching signed-in accounts
  no longer resets the allowance. A second normalized, hashed login-identifier
  bucket bounds attempts spread across source addresses (30 per 15 minutes).
  There is no permanent account lock. Existing request limits remain in place.
- Permission changes and blocking increment the credential version and revoke
  sessions transactionally. A delayed session issued from an old user snapshot
  cannot regain access after promotion, demotion or a block/unblock cycle.
  Affected users must sign in again after a permission change.
- Removed accounts are rejected by session identification as well as login.
- Every application wrapper sanitizes parser errors, so malformed JSON cannot
  echo password or client-text excerpts. The legacy API checks write origin
  before allocating its JSON body.
- A dedicated release check runs dependency auditing, indexing checks and
  isolated security/client/media regressions for changes targeting production.

## Controls reviewed

- Random session tokens are stored as hashes, with expiry, credential version,
  HttpOnly, production Secure and SameSite=Strict cookies. Passwords use salted
  scrypt; recovery tokens are random, hashed, expiring and single use.
- Origin and JSON checks protect browser writes. Staff/administrator and object
  ownership checks protect client schedules, bookings, messages and media.
- Stripe callbacks verify signatures on raw bytes. Fulfillment verifies customer,
  booking and amount, and records events transactionally for replay protection.
  Checkout and refunds use idempotency keys. No real transaction was initiated.
- Uploads have type/header, size, chunk and role checks. Public proof videos are
  scoped separately from paid lessons; private lesson access is server enforced.
  Uploaded media is not executable source code. Header checks are not antivirus.
- Production supplies HTTPS/HSTS, CSP, frame blocking and nosniff. Responses
  carrying account data use private/no-store. Preview domains retain Vercel SSO
  protection. The runtime is Node 24. The installed dependency audit reported
  zero known vulnerabilities on the review date; this is a point-in-time result.
- Runtime-log aggregate lookup returned no 5xx rows for the selected 24-hour
  window. This is limited by provider retention and is not an uptime guarantee.

## Remaining account-level work

1. Obtain the Search Console Pages report with the ten URLs and reason groups.
   Inspect intended public URLs, submit `sitemap.xml` if not already submitted,
   request indexing where appropriate, then use Validate fix for resolved groups.
   Expected private exclusions and redirects do not need removal.
2. Verify MFA/recovery access on GitHub, Vercel, MongoDB, Stripe, Google and the
   domain registrar. These account settings were not accessible in this review.
3. Confirm MongoDB automated backups and retention, and perform a restore drill
   into an isolated database. Confirm database least-privilege credentials and
   network access rules. Never test restores against the production database.
4. Confirm production branch protection, required release checks, vulnerability
   alerts and notification recipients. This repository's default branch is
   `main`; scheduled GitHub workflows only run from the default branch. The
   security workflow in this change runs on production pushes and pull requests;
   periodic scanning needs a default-branch workflow/configuration as well.
5. Reassess privileged application MFA, idle session limits and reauthentication
   for sensitive administrator actions with a tested owner recovery flow. They
   are not claimed as implemented by this patch.

## Sources consulted

- [Google Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Express production security](https://expressjs.com/en/advanced/best-practice-security/)
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Node.js security](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
