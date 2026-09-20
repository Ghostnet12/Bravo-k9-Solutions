# Owner confirmation and remaining security work

Administrator deletion requires the primary owner's current password on every request. The strict request schema rejects missing or non-string passwords. The existing database-backed deletion limiter also limits password guesses. Failed confirmations create an audit event without recording credentials. Password confirmation is not MFA.

The service verifies the current account and password, then conditionally writes the actor inside the deletion transaction. A changed password, credential version, role, blocked state or removal state prevents the action. Existing primary-owner policy, billing protections and scheduling locks still apply. A timestamp records confirmation but never grants reusable authority. Ordinary client removal retains its existing workflow.

The browser clears the password field immediately after submission and when closing the dialog. Integration tests exercise denied confirmation, rate limiting, stale credentials and successful deletion; browser tests cover cancellation, keyboard access, retry and mobile layout in Chromium and WebKit.

## MFA rollout prerequisites

MFA remains unimplemented. Before requiring it for owners and staff, build enrollment with current-password verification, first-code confirmation, encrypted TOTP secrets with a separately managed versioned encryption key, replay protection, rate limits, hashed single-use recovery codes, and an audited recovery flow. Verify enrollment and recovery in isolation before enforcing MFA for existing accounts. Never treat password reauthentication as a second factor.

## Isolated backup recovery exercise

A successful live database health check does not prove backups are recoverable. Backup settings and a restore have not been verified in this work. The exercise requires database-provider administrative access and a separate restore target with restricted credentials.

1. Record the backup policy, retention, latest successful snapshot, recovery-point objective and recovery-time objective in a private operational record.
2. Restore a chosen snapshot into a separate isolated cluster. Do not overwrite production or download customer data into a development workspace.
3. Restrict network access and disable outgoing email, Stripe writes, webhooks and scheduled jobs in the isolated application environment.
4. Check indexes, document counts and referential consistency for users, memberships, appointments and payment records. Use controlled test identities for application checks; invalidate restored sessions and recovery tokens in the isolated copy.
5. Record snapshot age, elapsed recovery time and verification results. Compare with the recovery objectives and investigate failures.
6. Remove the isolated environment and its credentials under the agreed retention policy. Repeat after material database changes and on an established operational schedule.

## Release checks

Pull requests into bravo-mern run lint, build, unit and database security tests, browser regressions, dependency audit, secret scanning and CodeQL. Both verify and Bravo release gate remain required. Feature pushes no longer duplicate the PR workflow; production pushes still run it. Public post-deployment checks verify availability and headers; they neither exercise destructive live actions nor prove database recovery.
