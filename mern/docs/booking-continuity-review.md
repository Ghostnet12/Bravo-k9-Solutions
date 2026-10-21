# Booking continuity and website refinement

Base: `bravo-mern` at `459c62f41258e650842a5d8bedfe9e8f0dbe63b6`.
Feature branch: `fix/booking-continuity-20261021`. PR: https://github.com/Ghostnet12/Bravo-k9-Solutions/pull/130.

## Reproduction and root causes

| Issue | Evidence / cause | Focused change |
| --- | --- | --- |
| Back from sign-in loses the request | Baseline regression commit `12dceae` failed at the restored-review assertion: Actions run 39574738181. Restoration required `?resume=1`, but browser Back returns to the original URL. The resulting blank mount then saved over the in-memory draft. Refresh also lost all in-memory state. | Resolve identity before mounting the form; restore by canonical booking intent; persist a validated, versioned tab-local draft; scope setters to account and revision. |
| New requests or account switches can replace drafts | The original draft had no durable owner/intent envelope. | Explicit resume/discard decision for a new request or different program. Deliberate guest claim only during booking authentication; clear on sign-out, account mismatch, discard and successful submit. |
| A lost booking response makes retry look unavailable | Automated review found that a successful POST can reserve its own slot before its response is lost. The new availability preflight then blocked the server's existing same-key idempotency handling. The follow-up regression commit `c3c87dd` reproduces this with a committed synthetic booking and a failed response. | Reconcile the original request key within the signed-in account before availability validation, and again if a concurrent commit makes the fresh slot unavailable. Recover the original booking without another POST; otherwise retain fresh availability validation and server reservation checks. |
| Booking progress is inconsistent | Intro counted the dog step, later screens restarted their own numbers; trainer cards and a select controlled the same choice. A tall date grid separated the chosen date from times. | Shared four-stage definitions for training. One guided trainer picker; full-month mode retains its native picker. Compact scrollable date strip only in first-visit mode; full month retains its grid. |
| Account handoff lacks context | Generic account content did not read the pending request; password-creation advice was shown on login. | Pending dog/trainer/date/time summary, return link, new/existing-customer explanation, registration-only creation guidance and guide chapter links. |
| Required password setup loses the return destination | The existing password gate always redirected to `/schedule`, even when login had a pending booking. | Keep the password gate enforced; show the pending summary and return to the request only after successful setup. Ordinary membership setup still opens the schedule. |
| Homepage decision facts are remote from the CTA | Pricing and manual renewal were in later sections; eight nearby offer bullets repeated terms from other sections. | Live catalog price, renewal and service location beside the primary CTA. Four core offer facts, with remaining owner-editable terms in the existing disclosure. Quieter secondary link; original media, typography and menus retained. |
| Live-status timeout cause is not observable per request | Existing browser telemetry records only kind/area. Server request monitoring records 5xx, not successful slow or aborted status reads. | Add correlation and bounded client elapsed/queue/deadline timing; server total/database/snapshot timing for slow or aborted `GET /api/live` only. No deadline, retry, polling, authorization or media-transport change. |

## Draft behavior and boundaries

- `sessionStorage` key `bravo-booking-draft-v1`; one unsent request per tab, with a 12-hour inactivity lifetime. This is refresh/history continuity, not cross-device or browser-restart backup.
- Only bounded input fields are persisted. No credentials, server booking records, prices, membership state or payment data.
- Current authentication must resolve before a stored account draft is exposed. A stale component cannot write into a different account or discarded revision.
- Storage failure leaves in-memory navigation continuity available; refresh retention cannot be guaranteed when browser storage is blocked.
- A new-program link cannot silently overwrite the existing request. After discard, entering a new draft does not reopen the decision prompt.
- Fresh availability is checked before a new non-waitlisted request is submitted. Server validation/reservations remain authoritative for races after that check. Existing request idempotency is retained across remounts.
- Lost-response retries first read the exact original key, scoped to the current authenticated account. The optional UUID filter on the existing booking-list route uses the existing `(userId, requestKey)` index; ordinary account listing is unchanged. A second lookup covers a commit between reconciliation and availability reads. No customer records or payment state are changed by reconciliation.
- Full-month scheduling, waiting lists, specialist scope, Stripe checkout, historical pricing, memberships/credits and saved-booking editing keep their existing server behavior.

## Live investigation: evidence, not a proven cause

The reviewed production deployment is `dpl_DuPaksZM9Lq4dRqp4WDgp23akCoW` at the base commit above.

Production logs reviewed on October 21 showed live-area browser timeout events on October 20 at approximately 15:50:22 UTC (two events) and 20:01:07 UTC. Nearby database startup records showed roughly 3–5.5 seconds of model initialization, plus roughly 0.3–0.45 seconds connecting. Those records belonged to other public requests; temporal proximity does not establish the cause of a live-status timeout.

`/live` bypasses the public-content read queue. Its existing client policy permits 12 seconds for first/recovery reads and 4 seconds after a successful status response. Neither policy nor stream logic is changed. The new request UUID is unrelated to user identity. Diagnostic payloads exclude URLs, identifiers, field values, credentials and driver messages; server parsing rejects extra fields. Slow status timing logs start at 2 seconds and exclude stream/signalling endpoints.

After a separately authorized release, correlate browser `timing.diagnosticId` with `bravo.live_status_timing.diagnosticId`. Compare client elapsed time with server total, database wait and snapshot query durations. A slow database span supports a startup explanation; low server time with high client elapsed requires network/platform investigation. Function startup before middleware and browser/network transit are outside server span coverage. Do not increase deadlines or alter stream recovery on the present evidence.

## Safe verification

```sh
cd mern
npm ci --ignore-scripts
npm run lint
npm run build
npm test
npm install --ignore-scripts --no-save --package-lock=false playwright@1.55.1
npx playwright install --with-deps chromium webkit
node tests/booking-continuity.browser.mjs
```

The new browser workflow tests Chromium and WebKit at 360, 390, 768 and 1440 pixels. It uses only a local synthetic API and blocks off-origin requests. Coverage includes keyboard activation, consistent stage labels, layout width, date/time proximity, Back/Forward/refresh/sign-in, explicit resume/discard, starting again, account isolation, stale availability rejection, homepage facts, the complete chapter list, and offline versus connection-error presentation. Screenshots are uploaded as `booking-continuity-evidence` in Actions.

The follow-up retry fixture additionally simulates a booking that commits but returns a failed response, then verifies recovery in place and after refresh in both engines. The in-place case delays visibility until a second lookup to exercise the concurrent-commit race. Each case creates exactly one in-memory fixture booking and no charge. HTTP contract and Mongo integration tests verify exact-key matching and account isolation for the recovery read.

Existing release workflows additionally cover actual local server/Mongo fixtures for authorization, reservations, memberships, credits, owner editing, payment safeguards, private live access, publishing, mobile menus and tutorial/media behavior. PR checks and the PR description contain the final commit-specific results.

The complete application/browser regression run passed, then its dependency audit found two existing development-tool vulnerabilities. The focused dependency update pins Vite from 8.0.16 to 8.1.6 and refreshes the Mongo test tool's transitive `follow-redirects` from 1.16.0 to 1.16.1. These are the first fixed versions listed in the [Vite advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm) and [follow-redirects advisory](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8). Vite's required Rolldown bindings update with it. Stripe, authentication and server dependency versions are unchanged; audit thresholds and release gates are unchanged.

## Preview and release limitations

The protected Vercel feature preview renders the homepage. Its account API was unavailable during inspection, so real preview authentication/booking is not claimed as verified; browser journey tests use safe fixtures. No production customer account, booking, charge or outbound message was created. A real-device/live-network broadcast and the production timeout cause remain unverified. No production merge or deployment is authorized by this work.
