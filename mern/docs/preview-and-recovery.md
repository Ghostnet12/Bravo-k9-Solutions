# Preview isolation and recovery follow-up — October 29, 2026

## Verified configuration and current limits

- Vercel project `bravo-k9-mern` has ten configured variables, all scoped only to production. Preview has no MongoDB connection configuration. This explains its database-backed 503 responses.
- Atlas `Cluster0` remains Free, on MongoDB 8.0.34. No upgrade, new billing, production data export, network-rule change or production credential change was made.
- The project permits connection attempts from all IPv4 addresses. Bravo application accounts are scoped to `bravo_k9`, but the same project also contains other application and administrative accounts. The active production URI is a non-readable secret, so its exact identity must still be verified privately before a network migration or backup.
- Creating a separate preview database user through the Atlas connector returned `UNAVAILABLE` (`atlas-create-db-user was not returned by tools/list`). No preview credential was created and no Vercel environment was changed.

## Prepared preview setup

Use `bravo_k9_preview` with synthetic data only, on the existing cluster. This gives database/credential isolation without a new cluster charge; it still shares the Free cluster's capacity. It is not a production backup or a restore target for real customer records.

1. Create `bravo_preview_20261029` with only `readWrite` on `bravo_k9_preview`, restricted to `Cluster0`. Generate the password in Atlas; transfer it directly into the Vercel secret field, not source, terminal arguments, logs or the PR.
2. Add **Preview-only** `MONGODB_URI` as Secret, `MONGODB_DB=bravo_k9_preview`, `NODE_ENV=production`, and `STRIPE_LIVE_ENABLED=false`. Keep all production variables unchanged. Do not copy the production owner ID, MFA key, Stripe credentials, webhook or cron secret.
3. The application now derives preview write origins only from the exact `VERCEL_URL` and `VERCEL_BRANCH_URL` values supplied by Vercel. It ignores `APP_ORIGIN` in preview and rejects unrelated preview hosts, production origins, request-supplied host headers, cross-site fetches and non-JSON writes. Production retains its exact configured origin. Enable Vercel system environment variables if absent.
4. Keep Vercel deployment protection enabled. Redeploy the reviewed branch so it receives the new variables. Verify `/api/health/ready`, `/api/config`, `/api/team` and `/api/site-images`; config must report `connected: true` and payments paused. Missing configuration must remain visibly unavailable, not silently pass with fake production data.
5. Seed clearly labeled synthetic trainers and clients in the preview database only. Run the first-visit flow through dog, trainer, dates, sign-in and saved request; confirm the request exists only in the preview database. Attempt a production-database read using the preview credential and require authorization denial. Remove synthetic test bookings after the exercise.
6. MFA tests need an independently generated Preview-only key. Preview payment code rejects live-mode Stripe credentials even if accidentally configured; use separate test-mode keys only when payment QA is requested.

## Backup and restore work still pending

The no-new-recurring-cost decision remains in force. Current vendor documentation adds an optional Free-cluster backup subscription in private preview: $0.10/day, capped at $3/month, retaining four daily snapshots. Availability and existing snapshot status have **not** been verified in this Atlas account. Do not infer backup coverage from tier, uptime or an empty alert list. Do not enable the subscription without spending authorization.

The no-subscription path is a manual logical backup using MongoDB Database Tools. Before exporting production records, establish an owner-controlled encrypted destination, a restricted database backup account, and separate escrow of the existing MFA encryption key. These are not configured by this release. Choose a coordinated write-free window if a consistent application-wide recovery point is required; a live logical dump is not a point-in-time snapshot.

The acceptance record must include: source identity, timestamp and consistency method; encrypted archive checksum and retention location; restore duration; collection counts and indexes; booking/slot, membership/credit and media integrity; and isolated account/MFA recovery checks. Restore into a separate restricted environment with all external side effects disabled. Revoke restored sessions and password-reset tokens before exposing any recovered service. Never overwrite production for a test. Reconcile payment history independently from MongoDB.

## Network migration still pending

Inventory all applications and administrative access sharing the Atlas project before removing the all-IPv4 entry. Establish verified fixed egress for every dependent runtime, add its addresses first, and verify live readiness and authenticated flows before removing the broad rule. Preserve a reviewed rollback and operator access.

Vercel Static IPs currently require Pro/Enterprise and list $100/project/month plus regional private transfer. This is not approved under the existing cost constraint. No safe, verified free fixed-egress route has been established in this review, so the broad rule remains an open item.

## Sources checked October 29, 2026

- https://vercel.com/docs/environment-variables/system-environment-variables
- https://vercel.com/docs/networking/static-ips
- https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/
- https://www.mongodb.com/docs/atlas/backup-restore-cluster/
