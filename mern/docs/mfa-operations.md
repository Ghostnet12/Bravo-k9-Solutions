# Authenticator MFA operations

Owners, administrators and staff enroll from Account → Two-step verification. Enrollment is opt-in to avoid locking out accounts before they have an authenticator. Once enrolled, every password sign-in requires a fresh TOTP or unused recovery code. This release does not enforce enrollment for all staff.

Use a time-based SHA-1 authenticator with six digits and a 30-second interval. Setup keys expire after ten minutes, and starting again invalidates the previous pending setup. Setup requires the current password and a valid first code. A one-step clock allowance accommodates small clock differences. Used steps cannot be replayed. Recovery codes contain 128 random bits and are stored as normalized SHA-256 hashes; consumption uses an atomic database update.

MFA secrets use AES-256-GCM with account-bound authenticated data. Set MFA_ENCRYPTION_KEY to a cryptographically random 32-byte key encoded as 64 hex characters, in production server configuration only. Never put it in client variables, source, CI artifacts or logs. Production and test keys must differ. Missing configuration disables enrollment and fails TOTP checks closed; unused recovery codes still work with the password.

Preserve the encryption key across deployments and database restores. The v1 ciphertext format currently supports one key: rotation requires an explicit decrypt/re-encrypt migration while both keys are securely available. Do not replace the environment key as routine maintenance. A database backup alone cannot recover encrypted authenticator secrets. Arrange separate restricted secret escrow through the owner's approved secrets manager; this release does not create that escrow.

Enabling or disabling MFA increments the credential version, removes old sessions and password-recovery tokens, and issues a replacement session to the confirmed account. Disabling requires both the current password and a fresh TOTP or unused recovery code. Password recovery does not clear MFA. No administrative bypass or email-only reset for a lost second factor is introduced. Users must save recovery codes outside their phone before dismissing them. If both the authenticator and all recovery codes are lost, an audited operator recovery procedure with identity verification is required; no self-service bypass is offered.

Tests cover RFC 6238 vectors, encryption binding, malformed requests, authorization, setup expiry and replacement, password-only rejection, replay, concurrent recovery consumption, missing configuration and session revocation. Browser fixtures cover setup and sign-in on mobile/desktop Chromium and WebKit. These tests use isolated data, never production identities.

# Remaining infrastructure changes

## Current-tier decision — 2026-09-20

The owner has deferred tier upgrades and new recurring costs. Keep the existing Atlas Free and Vercel plans; the paid options below are reference only, not approved changes.

Atlas Free supports manual logical backups with `mongodump` and restores with `mongorestore`, even though managed Atlas snapshots are unavailable. A paid upgrade is not the only backup route. Before exporting production data, configure an owner-controlled encrypted backup destination and a restricted backup account for `bravo_k9`. Neither that destination nor an independent MFA-key escrow is configured by this release. Do not place customer exports in source control, CI artifacts, or general application logs.

Use MongoDB Database Tools with credentials supplied through a restricted configuration file, export only `bravo_k9`, encrypt the output, and retain dated copies with checksums. Logical dumps during concurrent writes are not guaranteed to be a transaction-consistent snapshot; coordinate a write-free maintenance window for a consistent recovery point. Validate a restore in an isolated local MongoDB instance compatible with production. Disable email, Stripe, webhooks and scheduled jobs there; invalidate restored sessions and recovery tokens before any recovered service is exposed. Record counts/indexes and exercise memberships, schedules and MFA recovery using isolated fixtures. Preserve the original encrypted copy and separately escrow the MFA encryption key. No production backup or restore drill has been completed yet.

Reference: https://www.mongodb.com/docs/atlas/backup-restore-cluster/

The production smoke check now verifies database readiness, no-store API responses, and unauthenticated rejection of MFA settings in addition to headers. Its success is a live-domain observation, not proof that a particular deployment commit has finished rolling out. Existing CI checks remain required; application dependency installation no longer retains checkout credentials.

## Infrastructure inventory and deferred paid options

Read-only Atlas inspection on 2026-09-20 found a Free cluster, a Bravo database-scoped read/write account and a project network rule allowing all IPv4 addresses. Other application and administrative accounts exist in the same project. Do not change their permissions or remove shared network rules without inventorying the dependent applications.

A concrete low-cost backup option is upgrading the existing cluster to Flex, keeping its existing provider and region. Published pricing is usage-based, approximately $8–$30/month. Atlas automatically takes daily Flex snapshots; retention is limited and this is not point-in-time recovery. Obtain spending approval and verify current compatibility and the exact provider quote before upgrading. Wait for a successful snapshot, then restore to a separate restricted target and follow the isolated recovery exercise in owner-reauthentication.md. Neither the upgrade nor a production restore has been performed by this code release.

Vercel Static IPs are available on Pro at $100/project/month plus private transfer. Before narrowing Atlas: inventory every application using the project; enable static egress for each required deployment and builds where applicable; add the documented egress addresses; deploy and verify database readiness; then remove the all-IP rule with a recovery plan. Keep approved operator access. Bravo-only egress does not establish safe connectivity for other applications sharing Atlas.

Sources checked 2026-09-20:
- https://www.mongodb.com/pricing
- https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/
- https://vercel.com/docs/networking/static-ips
