# Easier first-visit booking

The four decisions stay in order: dog, trainer, date and time, review. The changes remove extra navigation and late contact fields without changing appointment approval or payment behavior.

- A trainer card says “See dates” and continues directly to that trainer’s availability.
- The date step offers the earliest opening in the selected date range. “Use this time & review” explicitly chooses it; nothing is selected automatically. Manual date/time selection remains available.
- Choosing a trainer and accepting the next opening takes two actions, previously five: trainer, continue, date, time, review. This count excludes dog/contact details, authentication and final submission; it is not a measured conversion improvement.
- New customers enter their phone and visit address on Review before registration. Returning customers can sign in immediately to use saved contact details, retaining any values they already entered. The selected account form opens directly. After authentication, the same details remain ready for a separate final submission.
- Draft notices are condensed into a disclosure, monthly pricing stays visible, optional notes are labeled, and the manual time picker appears after a date is chosen.
- The interactive booking guide describes the updated path. New action copy remains owner-editable.

## Preserved behavior

Authentication and required password setup, account-scoped draft recovery, fresh availability validation, request idempotency, capacity and waiting-list handling, full-month scheduling, final appointment confirmation, existing prices and manual renewals remain in place. No backend, payment or livestream logic changes.

## Verification

`tests/booking-simplicity.browser.mjs` uses a local static production build and synthetic same-origin APIs, blocking off-origin requests. It covers unordered/closed-day availability, explicit next-opening selection, required contact details, direct registration, returning-customer sign-in without retyping saved contact details, draft details taking precedence over old profile values, no implicit booking after registration, stale-time rejection, changing trainers, exactly one fixture request and no checkout.

The booking-continuity workflow runs it in Chromium and WebKit at 390 and 1440 pixels. Existing continuity tests retain their four-width matrix, lost-response recovery and account-isolation cases. Existing customer-clarity and release-booking tests cover the manual path, full trainers and the full-month scheduler. Local WebKit requires unavailable system libraries; the CI workflow installs these dependencies. No real account, booking, payment or outbound message is created by the tests.

Final check results and deployment details belong to the pull request for the tested commit.
