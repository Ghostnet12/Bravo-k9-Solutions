# Bravo usability release — October 10, 2026

## Changes

Retain the cinematic black/gold identity, original assets, catalog prices, existing authorization, scheduling and payment behavior. Group the public navigation, keep the mobile task visible, move training/pricing ahead of the longer story, expose hunting/working-dog inquiries, and separate first-visit, whole-month and returning-client entry points.

The member account now starts with the next saved visit, the server-provided trainer assignment, request/confirmation status, training membership dates, and schedule/message/lesson shortcuts. Missing details are reported as unavailable, with a retry action. Cancelled visits and waitlisted requests are excluded from the next-visit summary.

Workshop details expose registration/inquiry status and meeting instructions. Specific-date, no-date and Central-time Saturday recurrence remain in the existing data model. Registration is confirmed directly by Bravo; the page does not invent reservations or take payment.

The live player distinguishes connecting, reconnecting, interrupted playback, browser-blocked playback and unavailable server status. A retry is offered for a slow connection, and the player does not present an unverified/stale frame as live. Existing session authorization and media transport are retained.

## Booking-test incident

The previously reported booking-page renderer crash was reproduced in the isolated Amazon Linux browser environment. Chromium's native log reported:

```
FATAL:third_party/skia/src/ports/SkFontMgr_FontConfigInterface.cpp:163] Not implemented.
```

The application reached its booking render normally. Installing system font support (`fontconfig`, DejaVu and Liberation fonts, then rebuilding the font cache) resolved the crash. The first-visit page then rendered successfully without changing its booking/payment logic. This was a test-environment failure, not evidence of a production booking defect.

## Reproduction

Run from `mern` with the repository's Node 24 runtime. The browser checks require Playwright and Chromium, installed separately from production dependencies. A typical disposable setup is:

```sh
npm ci --no-audit --no-fund
npm install --no-save --package-lock=false playwright@1.58.2
npx playwright install --with-deps chromium
npm run lint
npm run build
npm test
node tests/release-booking.browser.mjs
node tests/release-screens.browser.mjs
```

On Amazon Linux, Playwright's Debian dependency installer is not appropriate. Install Chromium's native libraries through the OS package manager and ensure fonts exist. The font remediation used in the isolated environment was:

```sh
sudo dnf install -y fontconfig dejavu-sans-fonts dejavu-serif-fonts liberation-sans-fonts
fc-cache -f
```

Build before running the Node suite: some existing tests inspect the production HTML and assets. Do not interpret a missing-build test failure as a live application failure.

## Coverage and boundaries

The booking regression covers mobile and desktop first visits, required trainer/time selection, sign-in with retained draft data, review, synthetic request submission, and whole-month multi-date/shared-time planning. The screen regression covers guest/member/staff/owner navigation, small viewports, 200% root text size, member summary and retry states, workshop no-date presentation, and live connection failure/reconnecting/unavailable/ended states.

Browser API responses are synthetic and external origins are blocked. No real booking, client record, password, membership, payment or stream publication is created by these tests. Node tests separately exercise existing HTTP authorization and scheduling/payment contracts with isolated mocks.

These checks are not a physical iPhone/Safari test, an actual cellular broadcast test, a real Stripe checkout, a complete accessibility certification, or a measurement of real-visitor Core Web Vitals. The live-network transport remains unchanged; this release must not be described as guaranteeing cellular connectivity on every carrier.
