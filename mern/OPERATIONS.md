# Bravo website operations

Current runbook, reviewed October 17, 2026. Dated audit reports are historical evidence, not the current deployment state. Release evidence and unresolved operational items are tracked in GitHub Issue #119.

## Production and releases

The canonical origin is https://bravounleashed.com. The application lives in `mern/`, with Vercel project `bravo-k9-mern` and production branch `bravo-mern`. Verify the custom-domain deployment and exact commit for every release. The repository default branch is not the production branch.

Use protected pull requests, resolve review threads, and pass all required checks on the current head. The active production ruleset requires an up-to-date `verify` and `Bravo release gate`, with no bypass actors. Record the previous READY deployment for rollback. After deployment, inspect runtime errors and repeat the public and account smoke checks without creating real transactions.

## Staff and client access

Clients can sign in with their email or full literal name. Staff, administrators, and owners must use their account email; name-only lookup intentionally applies to members only. Do not relax this boundary to diagnose sign-in failure. MFA-enabled users must complete the authenticator/recovery-code step. The generic rejected-sign-in response does not establish that the database is unavailable or identify a specific credential problem.

Temporary client passwords expire and require the client to choose a new password. Never put credentials, MFA codes, cookies, or customer notes in tickets or logs. Recovery uses the current verified account-recovery flow; inspect current implementation and configuration before promising email recovery.

## Training, scheduling, and content

The live service catalog is authoritative for prices, enabled services, and additional-dog rates. Monthly training renews manually. Selecting a date creates a request only after submission; Bravo confirms visits separately. Specialist goals require separate suitability, scope, and pricing agreement. The standard membership price is not a complete specialist-program quote.

Staff desk and schedules use America/Chicago. Workshop automatic-Saturday rollover must occur after Saturday ends in that timezone, including daylight-saving transitions. Downloaded calendar events are snapshots, not continuously synchronized subscriptions.

Use the authorized content editors for managed portraits, reviews, prices, and media. Preserve revision checks, source attribution, and undo/recovery behavior. A source-code default does not replace an overriding managed record. Keep text-only recommendations without a numeric rating unless the source actually supports one.

Private messages and client media remain permission-controlled. Keep online education in its current published/coming-soon state until real content, captions, transcripts, storage, access, and any payment prerequisites are verified. Do not infer readiness from an old audit document.

## Startup diagnostics

The application reuses a single pending database connection per process and initializes all models before serving database-backed requests. Startup logs report numeric `connectMs`, `initializeMs`, `modelsMs`, and `scheduleMs`. Model initialization and the schedule upsert are measured separately; no index or transaction checks are skipped. Warm requests should reuse the completed initialization.

Compare cold and warm windows with the same routes, region, load, and deployment. These diagnostics do not alone prove database throttling. Never log connection strings, raw driver messages, account identifiers, or customer records. Field vitals and lab measurements must be reported separately.

## Verification and outstanding operational evidence

Run lint, build, unit tests, the isolated database/security suites, and relevant Chromium/WebKit browser regressions. Use the hosted CI matrix as the release gate; emulation is not physical-device verification.

Physical iPhone/Android, real cellular broadcasting and recovery, screen-reader user testing, live owner publishing, backup restoration, Search Console indexing, and field performance require their own evidence. Track missing access or unavailable hardware explicitly. Preserve the existing WebRTC architecture and payment settings; use isolated fixtures rather than production bookings or charges for tests.
