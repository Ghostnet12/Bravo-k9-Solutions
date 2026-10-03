# Bravo Relay — Phone-assisted trainer notification lab

Status: working staging prototype, not a production notification service and not a new SMS transport protocol.

Open `/relay` on this preview deployment. Existing staging pages link to the lab in the footer. All scheduler events and client identities in the lab are fictional. No live scheduler, account, database, messaging provider, or customer data is connected. The public demo is not an authenticated owner portal; view switches do not enforce roles.

## What works

- Browser-local simulator for canceled sessions, 10 days added in one save, moved sessions, successful renewals, membership-ending warnings, final membership days, final scheduled sessions, and reassignment.
- Account-ID routing to David, Ashley, Janet, or shared assignments. A shared assignment creates separate recipient drafts, never a group text exposing recipients to each other.
- Idempotent event IDs; reusing an ID with changed content raises an error rather than silently processing a conflicting event.
- A reviewed digest can group up to four existing drafts for one trainer. Ten added days from one transaction are one notification event.
- A successful renewal retires still-pending old membership-expiration notices. Final-session and membership-end notices remain separate. Reassignment retires removed trainers' pending notices and records an assignment-change notice for old and new trainers.
- Session-local activity and trainer inbox demonstration, with demo-only acknowledgments. This state is neither authoritative nor synchronized across devices.
- Phone-assisted SMS handoff: the user enters their own test number, acknowledges carrier costs, copies the draft, opens the OS Messages composer with the destination, pastes, verifies, and taps Send. Format validation is not phone verification. The destination is kept only in page memory and removed when the review dialog closes.
- The UI never treats a clipboard operation or `sms:` navigation as message delivery. Optional manual reporting is explicitly unverified. No delivery or read receipt is claimed.

## Cost boundary

No paid messaging SDK, cloud function, message vendor, number rental or AI call is used by the lab. It is static website code with browser-local state. Existing website hosting resources still apply. Actual texts use the user's existing phone service; costs and permitted use depend on that service. The device can select SMS, RCS, or iMessage. The browser cannot force the channel.

This does NOT provide unattended free SMS. An automatic carrier-text transport requires an authorized carrier connection, such as a permitted SIM gateway or messaging provider. Replacing the SMS requirement with Web Push would be a distinct feature and is not activated here.

## Test status

22 Node logic tests pass. Offline Chromium UI checks pass at widths 320, 390, 768 and 1440: routing, digests, replay deduplication, local inbox acknowledgment, phone validation, clipboard workflow, manual-status distinction, persistence reload, old-expiry suppression, reset and horizontal-overflow checks.

The test environment blocks browser URL navigation. The UI checks therefore render local HTML/CSS/JS in memory. Session storage and clipboard are mocked, and the native SMS URL is intercepted. No test text was sent. They are not end-to-end SMS or hosted-device tests. Actual iPhone Safari, Messages handoff, carrier delivery, and fully hosted interaction testing remain outstanding.

The inherited Vercel build runs the original safety tests plus the 22 new logic tests, then copies the lab and renders the existing staging pages. Deployment evidence must be checked separately.

## Production integration contract — not implemented or activated

1. Require a server-authenticated owner session for outbox, contacts, and notification rules. Enforce role and assignment checks on every read/write. Client payloads may not choose recipients. Trainer inbox access is restricted to that trainer's account.
2. Record canonical events from successful scheduler transactions, with a unique operation ID, assignment version, and membership version. Use a MongoDB transactional outbox with a unique event/recipient constraint. Never generate alerts from untrusted button clicks or client-provided event descriptions.
3. Resolve current trainer assignment and verified, opted-in contacts server-side. Recheck consent, routing, membership state, credits, cancellation state and message expiry before each handoff. Treat last booked session and last membership day independently in America/Chicago.
4. Protect phone-number changes and number verification. A checkbox and format validation are not proof of ownership. Restrict recipient routes, log consent and opt-out, and redact phone numbers and client data from telemetry, public URLs, and lock-screen text.
5. Add delivery adapters only after explicit approval: manual phone composer (unverified), Web Push (not SMS), or an authorized SIM/provider gateway. Never auto-convert “no push acknowledgment” into SMS when carrier cost is disallowed. Preserve ambiguous outcomes for review rather than retrying and causing duplicates.
6. Server-side queue state requires atomic leases, expiration, idempotency, controlled retries, rate limits, alert visibility, retention and a kill switch. Browser session storage is not a substitute. Run expiry jobs independently of whether the owner dashboard is open.
7. The live launch requires explicit approval, separate credentials/scopes, controlled test recipients, security review and device tests. Do not merge this staging site into the production app as a replacement.

## Primary references

- Apple SMS URL scheme: https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html
- SMS URI standard: https://www.rfc-editor.org/rfc/rfc5724
- Android native SmsManager: https://developer.android.com/reference/android/telephony/SmsManager
- Web Push (a separate, non-SMS transport): https://developer.mozilla.org/en-US/docs/Web/API/Push_API

These references support the transport boundaries, not a claim of a newly invented carrier service.
