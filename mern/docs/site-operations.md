# Website health and booking conversion

The actual Owner can open `/admin?tab=health`. Staff, administrators and clients cannot read the reporting API. The report is explicitly refreshed and uses a 7- or 30-day window.

## What is measured

- A visit is a random per-tab session lasting up to 30 minutes. It is not a count of unique people. Reloading within the session and React Strict Mode do not add visits. Session storage denial, Do Not Track and Global Privacy Control disable conversion tracking. Staff/administrator/owner sessions are not tracked after authentication resolves.
- Public pages and the booking form start a visit; opening the new booking form marks the next stage. Schedule editing is excluded.
- Only successful authenticated `POST /api/bookings` calls can attach an existing visit to a booking. The attribution field is hidden from normal booking responses. Assisted client creation and staff activity are excluded. Retries keep the original attribution.
- Saved requests include waiting-list requests. Each visit counts once even with multiple requests. It does not mean the trainer has confirmed an appointment.
- The payment stage reads actual booking `paidAt` and paid/refunded status, populated by verified Stripe processing. A return URL, checkout click, unpaid request or covered membership cannot claim a payment.
- Traffic is limited to direct, search, social, referral. No raw referrer, query string, advertising ID, IP address, name, dog name, email, phone, message, password, or card detail is stored in analytics. A hashed random session key connects the visit to a booking, not to a person profile.
- Visit and grouped error records have 30-day TTL indexes. Reporting filters the expiry immediately, independently of MongoDB's background TTL cleanup. No historical visits are invented.

## Errors and availability

The outer API middleware records every completed 5xx response, including errors handled inside the nested schedule, membership, media and Stripe apps. A generated `X-Bravo-Request-Id` connects an incident to structured Vercel logs. Only fixed area/kind/status labels are recorded. Arbitrary error messages, stacks, request bodies, headers and URL parameters are excluded.

The browser reports same-origin script failures, rejected background actions, React render failures, network failures and request timeouts. Reports are deduplicated per kind/area within a page load and capped at ten. Ordinary validation/authentication errors are excluded. Browser monitoring activates after configuration loads. Browser reports are untrusted operational signals and are displayed separately from server errors.

Error records live in the app database. If that database is unavailable, structured Vercel logs still receive server failure details. `waitUntil` keeps persistence work alive after responses on Vercel; storage failures cannot fail the customer's completed action. Telemetry ingestion requires same origin, fixed schemas and database-backed rate limits.

`.github/workflows/bravo-health.yml` runs public, read-only checks for the homepage, database readiness and sitemap every 30 minutes (GitHub may delay scheduled runs). The workflow must also exist on the repository default branch `main` for schedules to run. Failures appear in GitHub Actions; email/push delivery depends on the owner's GitHub notification settings. It sends no client messages and uses no production credentials. See the workflow run history to verify ongoing execution.

## Release verification

Tests cover owner-only access, rejected arbitrary telemetry fields, deduplication, staff/opt-out exclusions, server-authoritative booking/payment counts, API error capture and credential redaction. Browser checks cover mobile owner reporting, visit persistence, no false conversions, visible retry, tracking opt-out and absence of staff acquisition tracking.

## Database backup activation — pending

On September 14, 2026, the connected Atlas Project 0 / Cluster0 contains `bravo_k9` and uses the Free tier. Atlas automatic backups are not available for Free clusters. The database being connected and health checks passing are **not** evidence of a backup.

The proposed change is to upgrade this existing cluster to Flex. MongoDB currently documents $8–$30 for 30 days, usage-based, with automatic daily snapshots and retention of the last eight snapshots. This affects every database on the shared cluster, not only Bravo. Billing approval is still required before changing the tier. No plan upgrade, backup snapshot or restore was performed as part of this code change.

After approval:

1. Confirm the current cluster, plan, database and connection remain the same; upgrade the existing cluster to Flex through Atlas.
2. Wait for the cluster to return to IDLE. Confirm `/api/health/ready`, client sign-in and existing schedules still load. Avoid concurrent production schema or billing work.
3. After the first daily snapshot (Atlas starts snapshots after 24 hours), record its timestamp and confirm retention in Atlas Backups. Do not mark backup setup complete until a snapshot is visible.
4. Restore a snapshot into a separate test cluster/database, never over production for a test. Use an isolated environment with Stripe, email, reminders and external side effects disabled.
5. Check collection/document counts, required indexes, owner/client records, bookings, slots, subscriptions, member grants, credit history, trainer availability, lessons and stored media. Verify a credited membership end date and schedule match the source snapshot. Revoke restored sessions/password-reset tokens before any restored environment is exposed.
6. Record restore duration and results. Production recovery requires an explicit target and a reviewed plan for records/payments created since the snapshot. Reconcile Stripe independently; restoring MongoDB does not reverse or restore payments.

Sources:
- https://www.mongodb.com/docs/atlas/backup-restore-cluster/
- https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/
- https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/

For an interim manual Free-tier backup, MongoDB documents `mongodump`/`mongorestore`. Use MongoDB Database Tools with a restricted credential config file, encrypted storage outside the database host and a tested isolated restore. Do not commit credentials or plaintext customer exports to this public repository. A live Free-tier dump must not be presented as a point-in-time snapshot; choose a maintenance window that stops writes if application-wide consistency is required.
