# Architecture and security follow-up

## Design decisions

Use composition for shared HTTP concerns: `http-security.js` owns Helmet configuration and private response caching; `session-middleware.js` composes headers, cookies, database readiness, identity and rate limiting. Authorization and payload-size limits remain explicit at the routes. This preserves upload limits, raw Stripe webhook handling, transaction boundaries and role semantics.

The current application uses layered Express wrappers (`client-services-app` → `member-app` → `site-image-app` → `app`). Repeated security setup can drift as requests cross those layers. This change consolidates it without replacing routes or copying business rules. Existing domain modules continue to own membership, reservations, payments and trainer rules. Future extraction should move bounded services with their authorization/transaction regressions, not introduce a generic data-access abstraction over every Mongoose call.

## Cleanup and security

Removed duplicate session assembly and now-unused cookie/database/identity imports. All eight Helmet consumers use one header policy. API framing changes from SAMEORIGIN to DENY with CSP frame-ancestors 'none'; script/font sources are constrained to self. Existing permitted Facebook frames, blob media, data images and inline styles are retained. Local development does not force HTTPS upgrades. Lint detects unused bindings/imports and unreachable code; this is not a claim that every legacy route or unused export has been removed.

Helmet reference: https://helmet.js.org/

## CI/CD

PR → locked install → lint/build/unit tests → isolated MongoDB authorization and workflow regressions → browser regressions → dependency audit. Secret scan and CodeQL run alongside application verification; high/critical CodeQL findings block the release gate. The active production ruleset requires `verify` and `Bravo release gate` from GitHub Actions, up-to-date code and a PR, with no bypass actors and no force pushes/deletion. Merge to bravo-mern triggers Vercel production deployment.

`release-smoke.yml` checks the fixed public production origin after production-branch pushes, retrying while Vercel deploys. It verifies homepage/API availability and actual response headers. This is public-site health monitoring, not proof of a particular deployed commit, a pre-merge gate, or automatic rollback. Deployment identity still must be verified through Vercel. Existing recurring health monitoring checks database readiness and sitemap. Dependabot is already configured on default branch main and targets bravo-mern.

## Verification and remaining work

Local lint, production build and 149 unit tests pass, including the production wrapper and error-response headers. Hosted database/browser/security gates must pass before merge. No changes are made to client data, pricing, permissions, scheduling or checkout logic.

Application MFA/recovery, destructive-action reauthentication, full service extraction, database least-privilege verification, restore drills and restrictions on direct Vercel deployment credentials remain further work. This release does not claim these are implemented.
