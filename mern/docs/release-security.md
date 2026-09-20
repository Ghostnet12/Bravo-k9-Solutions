# Bravo release security

## Implemented in this change

- Access policy is centralized in `server/authorization.js`; existing auth exports remain compatible.
- Founder identity requires a valid explicit `OWNER_USER_ID`. Missing/invalid values grant no founder identity. Delegated owner-role permissions are unchanged.
- Server/shared/API lint rejects unused variables/imports, duplicate imports, unreachable code and constant conditions. Validation calls are preserved when unused bindings are removed.
- Every PR to `bravo-mern` runs application checks, secret scanning and CodeQL. There are no path filters on the required workflow.
- `Bravo release gate` fails unless all three jobs succeed, including when a dependency fails or is cancelled.
- Existing build, unit, database, browser and moderate-or-higher dependency audit checks are retained.
- CodeQL SARIF is evaluated locally in CI: high/critical findings and error results fail the job, rather than treating successful scanner execution as a clean scan.
- Dependabot configuration targets `bravo-mern` for application and Actions updates.

## Activation prerequisites — not proven by workflow files

1. Verify `OWNER_USER_ID` in both Vercel preview and production against the existing founder account. Do not create a replacement account or infer identity from an email. Set this before deploying the fallback removal.
2. Obtain passing hosted CI, including MongoDB/browser tests, on this PR. Local MongoDB currently exits with code 100 before tests start.
3. Configure `bravo-mern` branch protection to require `Bravo release gate`, up-to-date checks, PR review and conversation resolution; prohibit force pushes/deletion and administrator bypass. Preserve existing stricter rules. Choose an available reviewer before enforcing review requirements.
4. Confirm Vercel's production branch is `bravo-mern`; restrict manual production deployment credentials and require the approved release path. Branch protection alone cannot prevent direct CLI production deployments.
5. Validate a preview (including actual response headers, sign-in, memberships and checkout test mode), then release and verify the production health endpoint and critical flows.
6. Dependabot configuration must also exist on the repository default branch for automatic discovery; the current default is `main`. Do not replace default-branch configuration without reviewing it.

Reference: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Architecture for subsequent extractions

Use route → validated input → authorization → service → database. Preserve middleware ordering and transaction boundaries. External adapters own provider-specific transport details. Keep membership, pricing and trainer rules in the existing shared/domain modules rather than copying them into new routes. Extract one bounded responsibility with behavior tests per change; do not introduce a repository abstraction merely to rename Mongoose calls.

## Remaining work

This change does not implement MFA/passkey enrollment and recovery, destructive-operation reauthentication, alert delivery, database credential/network changes, backup restoration drills, full frontend unused-export/dependency analysis, complete service-layer extraction, or general production environment validation. Those require further implementation and provider verification. Existing audit logs and session controls are preserved. No assertion of production security or deployment enforcement is made until the activation checks are complete.
