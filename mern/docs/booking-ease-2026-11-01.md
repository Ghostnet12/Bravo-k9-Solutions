# Continuous booking and weekly routines

New clients can sign in or create an account within the request’s Review step. The existing account-scoped draft handoff, MFA challenge and mandatory temporary-password setup remain in force. Credentials are never included in booking drafts. Authentication does not submit a request; submission remains a separate explicit action with fresh availability, capacity, quote and idempotency checks.

The first screen defaults to one dog and reveals extra dogs and optional notes on demand. “I’m not sure” is a supported training focus. Trainer guidance uses published trainer roles/titles, directs aggression to the existing two-trainer assessment, and sends uncertain or specialist goals to Bravo for discussion. It does not imply specialist acceptance or invent qualifications.

Both the full booking form and paid member calendar offer weekday/time routine previews. Previews show available dates and exact-time conflicts; no substitute time is silently chosen. Adding a preview changes only the draft. Existing saved/drafted visits at other times are retained. The calendar can infer a weekday pattern from recent matching dog/trainer visits, preferring the previous month. Copying does not enable weekends, renew membership, change trainers, cancel existing visits, or take payment. Paid coverage and availability constrain previews; the unchanged transactional calendar endpoint revalidates the final save.

The older “Make my schedule” convenience action now offers chronological earliest openings instead of random appointments. Standard manual date picking, bulk times, individual-date edits, credits, staff weekend controls and waiting lists remain available.

Saved requests display separate request, payment and appointment-confirmation states. The live quote, existing prices, one-month membership terms and manual renewal remain authoritative. New owner-editable copy is registered with the existing publishing allowlist. The interactive booking guide describes the new flow.

## Verification

- `booking-routine.test.js`: daylight-saving boundary, bounded/valid dates, exact-time conflicts, retained visits, recent weekday inference and no automatic weekend selection.
- `booking-ease.browser.mjs`: isolated APIs in Chromium and WebKit at mobile and desktop widths; lighter entry, trainer routing, inline MFA and account-read retry, credential exclusion, explicit submission/status, weekly draft preview, paid-term restrictions, matching dog/trainer routine, existing-visit preservation and explicit calendar save.
- Existing booking simplicity/continuity and release tests retain coverage of account isolation, stale availability, interrupted handoffs, password setup, back/forward/reload, waiting lists, and no unintended checkout. Tests open the newly optional controls when they need them.
- Build, lint, unit and full release checks run before production. No production account, appointment, message or payment is created by test fixtures.

CI and the pull request record the exact tested release. Improvements in booking completion must be measured from subsequent real traffic; no conversion uplift is assumed.
