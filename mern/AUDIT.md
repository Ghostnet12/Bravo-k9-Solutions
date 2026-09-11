# Bravo site audit — September 11, 2026

## Scope

Reviewed the MERN application, production deployment configuration, dependency advisories, authentication and role boundaries, customer/staff booking flows, Stripe checkout/webhooks/refunds, community moderation, private messaging, lesson publishing/media, pricing displays, navigation and search metadata. Existing Vercel/GitHub hosting, customer records and role assignments were preserved.

## Corrections

- Patched Vite 8.0.13 to 8.0.16. The dependency scan previously reported a high-severity development-server advisory; the updated lockfile reports zero known vulnerabilities. [Vite advisory](https://github.com/advisories/GHSA-fx2h-pf6j-xcff).
- Applied Content Security Policy, anti-framing and browser-permission headers to Vercel's static pages as well as the Express API.
- Prevented edited reviews from clearing owner moderation; kept useful validation messages while redacting database and Stripe errors.
- Protected checkout retries and ambiguous timeouts with persisted parameters and a stable idempotency key; prevented fresh customer checkout locks being stolen; aligned client/Stripe/function timeout budgets.
- Verified payment-event customer, booking reference and session identity; prevented late completion events undoing refunds.
- Updated subscription refund lookup to use Invoice Payments, supported review-state payments, retained retryable refund reservations and distinguished pending refunds from successful refunds. [Stripe Invoice Payments reference](https://docs.stripe.com/api/invoice-payment).
- Preserved saved unit prices during rescheduling; added concurrent-update checks to cancellation, rescheduling and confirmation.
- Added a service selector for multi-service schedules; stopped covered membership requests showing another payment due; locked saved/busy booking forms against accidental duplicate edits.
- Kept public walking/online and staff price labels aligned with the current catalog; retained the fixed training pricing rule.
- Made billing access available to customers with a Stripe billing account even without an active membership; stopped payment verification notices remaining stuck after confirmation.
- Cleared private booking drafts on account changes/sign-out; handled invalid URL fragments and non-JSON outage responses safely.
- Corrected canonical URLs, Open Graph URLs and the sitemap to bravounleashed.com.
- Made lesson validation/publication transactional and protected the lesson form while uploads/saves run.

## Verification and limits

- Production build and isolated automated tests pass; tests use Stripe/model doubles and do not move money or contact the production database.
- The disposable MongoDB integration suite was attempted but the workspace rejected MongoDB startup with `Operation not permitted`. This suite remains available as `npm run test:database` for a permitted environment. It has **not** passed in this audit.
- No live charge, refund, role promotion, moderation change, customer booking or media deletion was performed for testing.
- This is a source/application audit, not a guarantee that every possible defect is eliminated or an independent penetration test.
- Administrative MFA, automated verified account recovery, backup restoration and a complete sandbox purchase-to-refund test remain separate operational validation work. Do not treat these as completed.

Run `npm run build`, `npm test`, `npm audit`, and (in a permitted disposable environment) `npm run test:database` before subsequent releases.
