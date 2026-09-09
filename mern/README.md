# Bravo K9 Solutions — MERN rebuild

React 19 + Vite 8 · Express 5 · Node 24 · Mongoose 9 / MongoDB · Stripe Checkout

The original Sites application remains unchanged in the parent directory. This
self-contained `mern/` application is the migration target for a Node-capable
host such as Vercel, following The Fold’s architecture. Do not deploy this Node
backend to the existing Cloudflare/Sites Worker runtime or copy The Fold’s data
or credentials into Bravo.

## Current status — September 9, 2026

- Production frontend build: passed.
- Domain/API checks: 13 passed (no production services contacted).
- Production dependency audit: 0 known vulnerabilities at the time of testing.
- Full database integration: **not verified**. The disposable MongoDB process
  was blocked by the execution environment (`open: Operation not permitted`).
  The supplied integration suite must pass in a permitted local/CI environment.
- Real Stripe sandbox checkout and webhook delivery: **not tested**; no Bravo
  Stripe account or keys were connected. No payments were taken.
- Browser/mobile interaction testing: not performed in this turn.
- No new deployment or audience changes were made. The original live site remains
  as it was. This is a saved implementation, **not a production launch**.

## Local setup

1. Open `mern/` as the VS Code project. Install Node 24.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and fill in a **dedicated Bravo** MongoDB URI.
   MongoDB must be a replica set; MongoDB Atlas supports transactions.
4. Set `APP_ORIGIN=http://localhost:5173` for development.
5. Run `npm run dev`, then open `http://localhost:5173`.
6. For production-like local testing, run `npm run build`, set
   `APP_ORIGIN=http://localhost:3001`, and run `npm start`.

Without MongoDB, the branded public site and upcoming lesson catalog still work.
Accounts, scheduling, and chat show unavailable states instead of claiming to save
data. Persistent records never fall back to localStorage. Browser storage is used
only for accessibility preferences.

## Included flows

- Preserved homepage, exact original logos, 14 image assets, team, service pages,
  existing black/gold look, and accessibility controls.
- Account registration, salted scrypt passwords, opaque HttpOnly session cookies,
  sign-in/out, saved profiles, and password changes that revoke other sessions.
- Account recovery is a verified staff support workflow; automated reset email is
  **not connected**. Never grant staff access based solely on a claimed email.
- Real-date scheduling in `America/Chicago` with DST handling, past-slot rejection,
  9 AM–9 PM starting times, configured weekdays, and shared slot availability.
- Trip auto-scheduling with first-arrival / return cutoffs, per-day times, editable
  visits, explicit care-gap warnings, and no silently partial schedules.
- Training and sitting visits are selected independently inside packages.
- Server-calculated pricing, idempotent booking requests, transactional slot claims,
  cancellation, editable unpaid schedules, and account history.
- Authenticated community messages; server-enforced staff announcements, alerts,
  and message moderation. Members’ emails are not exposed in chat responses.
- Staff desk for opening hours, blocked slots, and confirming/cancelling requests.
- Protected member video, caption, and transcript endpoints. Public catalog entries
  never contain private filenames or transcripts.
- Stripe one-time and recurring Checkout, customer billing portal, signed raw-body
  webhooks, event deduplication, and subscription entitlement updates.

## Pricing preserved (USD)

| Program | Price |
| --- | --- |
| Professional training | $200/month |
| Dog sitting | $20/selected care day |
| Online training | $50/month |
| Aggressive-dog assessment | $400 initial intake |
| Training + online | $250/month |
| Training + sitting | $350/month |
| Training + sitting + online | $400/month |

Packages are exclusive to avoid duplicate billing. Recurring charges and one-time
intake/care charges are displayed separately. Follow-on aggression pricing is not
automatically enrolled; Bravo determines that transition with the client.

## Activate operations deliberately

1. Create David’s account through registration.
2. Verify the exact account and run `npm run staff -- verified-email@example.com staff`.
   To revoke staff access, use `member` as the final argument. This is an operator
   command, not a public endpoint; it never uses client-submitted roles.
3. Sign in, open `/admin`, review weekdays and hours, then enable online booking.
   Availability begins **closed** so the app does not advertise an invented calendar.
4. Review staffing capacity before launch. This version uses one shared visit per
   hourly slot across all services. Block travel times explicitly. Aggression
   appointments still require staff to confirm both trainers can attend.
5. The $20/day sitting flow schedules one visit per selected care day. It is not
   continuous supervision or overnight boarding. Confirm additional care needs
   with clients; the trip screen flags dates with no visit.
6. Submitted requests reserve their slots and remain pending until staff reviews
   them. There is no automatic expiry of unpaid requests; staff must manage them.
   Cancelling a visit does not cancel recurring billing or automatically refund a
   charge. Use Stripe and your business policy for billing decisions.

## Stripe setup and launch gate

Use a Bravo-specific Stripe account and **test-mode** keys first. Never paste secret
keys into chat, frontend code, Git, or a public environment variable.

Server configuration:

```
APP_ORIGIN=https://your-verified-bravo-domain.example
STRIPE_SECRET_KEY=<test secret key configured privately>
STRIPE_WEBHOOK_SECRET=<webhook signing secret configured privately>
STRIPE_LIVE_ENABLED=false
```

Configure the webhook endpoint at `/api/stripe/webhook` for:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Enable Stripe’s customer billing portal. Recurring prices are constructed server
side from the approved catalog. The app uses hosted Checkout and never handles raw
card details. A browser success URL does not grant access; verified webhook events
do. Identical Checkout parameters are saved before the network call for safe retries.

Test a one-time sitting charge, each recurring package, duplicate webhook delivery,
payment failure, renewal, cancellation, and member access removal. Confirm Stripe
webhook API compatibility with the installed SDK. Only after these pass should the
owner configure live keys and explicitly set `STRIPE_LIVE_ENABLED=true`.

Overlapping recurring plans are blocked to prevent accidental double subscriptions.
Plan changes require the billing portal or Bravo assistance; proration/upgrades are
not automated. Refunds and disputes require staff handling in Stripe and must be
included in the operating procedure before launch.

## Lessons: real files required

The retained catalog contains planned topics, not real videos. No video files or
captions were supplied. Online checkout remains closed until at least one lesson is
published. **Do not mark a lesson published simply to enable sales.**

For self-hosted Node, put video (`.mp4`/`.webm`) and caption (`.vtt`) files in the
directory named by `PRIVATE_MEDIA_DIR`, outside `client/public`. An authenticated
staff request to `PUT /api/admin/lessons/<slug>` accepts `title`, `category`,
`instructor`, an existing `/images/<name>.webp` image, `videoFile`, `captionFile`,
`transcript`, and `published`. Publishing checks that both files exist. Video and
captions are served through authenticated, no-store, range-aware endpoints.

Vercel’s ephemeral filesystem is not durable media storage. Before publishing
lessons there, connect private object storage with short-lived signed access or
protected streaming, then adapt `server/lessons.js`; do not put paid lesson media
in Vercel’s public assets. This storage connection is a remaining launch task.

## Vercel preparation

Use this `mern/` directory as the project root. The included `vercel.json` builds
`client/dist`, sends `/api/*` to `api/index.js`, and falls back to the SPA for UI
routes. Configure `MONGODB_URI`, `MONGODB_DB`, `APP_ORIGIN`, `NODE_ENV=production`,
and Stripe server values in the **Bravo** project. Do not alter The Fold’s project.
Each preview environment needs an exact matching `APP_ORIGIN` for write requests.

Before switching any existing domain: pass the database and Stripe sandbox tests,
verify authentication and deep links on the actual host, confirm MongoDB network
access and backups, connect private lesson storage, review business/privacy/media
policies, and verify staff accounts. Preserve the original deployment for rollback.
Existing D1 community messages have not been exported or migrated; do not delete
that database. A separate verified migration is needed to retain historical chat.

## Verification commands

```
npm run build
npm test
npm run test:database
npm audit --omit=dev
```

`test:database` downloads a test MongoDB binary and starts an isolated disposable
replica set; it never points at the production database. Run it only where that is
permitted. The test verifies conflicting reservations, retry behavior, ownership,
staff permissions, chat persistence, webhook replay, and subscription revocation.

## Asset provenance and rights

All 14 images were copied byte-for-byte from the original Bravo project. The logo
was not regenerated. This preserves the supplied assets, but does not create new
copyright or establish an asset’s license. Confirm the source rights for commercial
reuse. Website copy/drag controls are not security or DRM; authenticated server
access is used for paid lessons. Existing visitors’ accessibility preferences
remain device-local.

## Implementation references

- [Stripe Checkout session creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe webhook signatures and delivery](https://docs.stripe.com/webhooks)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Mongoose transactions](https://mongoosejs.com/docs/transactions.html)
- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
