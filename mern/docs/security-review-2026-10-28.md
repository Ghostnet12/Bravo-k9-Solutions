# Bravo security review — October 28, 2026 (America/Chicago)

## Scope and baseline

Owner-authorized, non-destructive review of https://bravounleashed.com and
`Ghostnet12/Bravo-k9-Solutions`, production branch `bravo-mern`.
Verified baseline: `8563569ed665467d419c2e1b674bea8b5060bb46`, Vercel deployment
`dpl_CJ3prwZ3fvrgugr5tRCttgzzBjPW`.

Production probes were low-volume and unauthenticated. No real accounts,
appointments, messages, payments, uploads, or customer records were created or
changed. Authenticated attack scenarios used synthetic fixtures in isolated tests.

## Confirmed finding and repair

**Medium: account data retained after a shared-browser account switch.**

The account page retained its component state through logout and a subsequent
sign-in. If loading the next customer's account failed, the preceding customer's
booking records and review draft could remain in the newly signed-in page.
This is a browser-state privacy defect; the test did not demonstrate an API
authorization bypass or remote access to another customer's records.

Reproduced against the baseline with two synthetic accounts: load the first
account's booking and review, sign out through the normal menu, sign in as the
second account, and make the second account's booking request return 503. The
test failed because the first customer's booking remained in the document.

The account workspace now remounts when account identity, role, or password-setup
state changes. Private records, form state, and old component callbacks cannot
carry into the new workspace. Ordinary refreshes of the same account retain their
existing behavior. Booking handoff remains in the separate, account-scoped
context. A browser regression repeats the shared-browser failure at 390px and
1440px; both cases pass locally in Chromium. The release workflow also runs it in
Chromium and WebKit.

## Checks and evidence

- All 22 existing read-only production penetration checks passed: private API
  authentication, unauthenticated cron rejection, sensitive-file denial, response
  headers, and private response cache controls.
- Ten additional bounded production probes passed: invalid/missing origins,
  cross-site fetch metadata, non-JSON writes, malformed JSON redaction, forged
  sessions, protected HEAD requests, FCI cron authorization, and public-page
  traversal/duplicate parameters. No valid sign-in attempt or real-data write
  was performed.
- Lint, production build, and all 260 unit tests passed locally. The deployed
  protected preview passed the account-switch regression at both widths using
  intercepted synthetic APIs; no preview account data was read or changed.
- Locked application dependency audit: zero reported vulnerabilities at any
  severity. This does not assess unsupported code paths or guarantee absence of
  unknown vulnerabilities.
- Reviewed session cookies and expiry, role checks, account recovery, request
  validation, cross-origin write protection, media boundaries, and client state.
- Production ruleset is active, requires a pull request, up-to-date `verify` and
  `Bravo release gate` checks, and has no bypass actors. Secret scanning and
  CodeQL are included in the release gate.
- A fresh hosted run of baseline workflow `40243894182` passed both targeted
  penetration and isolated authentication/authorization/media integration steps.
  Its secret scan and CodeQL analysis also passed. The patch must independently
  pass its own required checks before release.
- Patch workflow `40814699553` passed its application, database, browser,
  dependency, secret-scan, CodeQL, and release-gate checks, including the new
  account-isolation regression in Chromium and WebKit at both widths.
- A separate booking browser test supplied an incomplete membership fixture.
  Keeping its signed-in account view open reproduced a rendering error because
  the mock omitted `terms`. The fixture now matches the real API's empty-array
  contract, and the test explicitly checks the account after the handoff.
  Browser error assertions remain enabled. The resulting commit must pass the
  release checks again.
- The live mobile homepage, booking entry, and account entry rendered without
  horizontal overflow, JavaScript page errors, or HTTP 4xx/5xx responses during
  the recorded navigation. Browser traffic used the environment's HTTPS proxy;
  this browser check is not an independent TLS certificate-chain audit.

## Limits

This is a targeted application assessment, not an exhaustive independent
penetration-test certification. No load/DoS testing, credential guessing against
real users, real payment exercise, or database backup restoration was performed.
Atlas review was limited to read-only project access-list and database-user
metadata. The production database secret was redacted, so active credential
usage and backup configuration were not independently verified. Infrastructure
hardening requiring a network migration is tracked separately with the owner.
Vercel returned no custom firewall configuration; that
does not establish whether platform-level protections are absent.

Local MongoDB integration tests could not start because this execution environment
denied a MongoDB startup operation. They were not counted as passes; hosted CI
provides the database-test evidence. WebKit execution is also verified in hosted
CI because required native libraries were unavailable locally.

References used for review criteria:
- https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html
- https://expressjs.com/advanced/best-practice-security.html
