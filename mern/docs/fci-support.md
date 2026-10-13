# FCI support integration

FCI resources and announcements are an independent Bravo educational initiative. No membership, accreditation, certification, partnership or endorsement is asserted.

## Source and refresh

- Source: https://www.fci.be/en/ — dated `ActualitesRepeater` announcement links only.
- Reviewed 2026-10-13: homepage has no advertised RSS/Atom feed; official-site feed searches found no supported API/feed. `/robots.txt` returns 404. The source's legal notice and disclaimer were reviewed. This is a small text/link index, not a mirror of the FCI website or carousel imagery.
- Refresh: daily Vercel cron at 13:00 UTC, plus cache-miss/due reads. Successful snapshots are cached until the next 13:00 UTC refresh boundary (at most 24 hours), so page reads cannot postpone the daily cron; source failures are retried no more than hourly on requests. The browser checks Bravo's endpoint every five minutes while visible; this does not fetch FCI on every page view and is not real-time synchronization.
- Uses the existing production `CRON_SECRET`, timing-safe authentication, and a dedicated MongoDB `BravoFCIUpdates` model. Existing customer records are not altered.
- Persistent last-success snapshot survives source outages, parse changes, and function restarts. The page labels stale snapshots; if no snapshot is available it links directly to FCI.
- Fixed HTTPS source, redirect rejection, 8-second timeout, 1 MB streamed response limit, parse5 text extraction, official-domain URL validation, deduplication, and no external HTML/scripts/images in announcements. FCI-provided title/date/link metadata only.
- If FCI later offers syndication or changes access requirements, adapt or disable the source fetch and retain the official-link fallback.

## Advertisement lifecycle

`withFCICampaign` appends a single default FCI campaign to existing collections without changing their saved data during reads. The existing authenticated advertisement editor persists the complete effective list, its order, and `fciCampaignVersion: 1` on the next edit. The marker prevents deleted campaigns from reappearing. An existing campaign linking to `/fci-support` prevents duplicate insertion. Uploaded replacement artwork or a selected video supersedes the default HTML creative. Existing Owner/Administrator access checks and revision conflicts are unchanged.

## Branding and artwork

The supplied FCI identity, Bravo shield and Bravo wordmark files are copied unchanged under `client/public/images/`. `fci-world-hero.png` is generated background artwork based on the approved mockup. It contains no official logo or text. Generation brief: panoramic blue forest/world-map background, realistic German Shepherd at right, dark negative space at left, no text, logos, buttons or screenshot framing. The original supplied logos are separate HTML images. Announcement cards use original CSS artwork rather than copied third-party photos.

## Deployment repair

The failed deployment's client compilation succeeded but public prerendering threw `No public component for /fci-support`. The page is now registered in `entry-public.jsx`, the public handler, canonical redirect, and Vercel rewrite. Announcement routes run through the existing Express entry point instead of a standalone endpoint hidden by the API wildcard rewrite. Footer FCI links are siblings of the Facebook anchor, not nested inside it.

## Verification

- `npm run build`, `npm run lint`, `npm test`
- `node --test tests/site-ads.integration.js` (isolated MongoDB)
- `node tests/fci.browser.mjs` (Chromium/WebKit, 375/390/430/768/1440 px)
- Existing release-gate, security, membership, scheduling, hero, motion and publisher workflows remain required.

Preview intentionally has no production MongoDB credentials. It serves the page and official-site fallback. Database-backed tests run in isolated CI; production is smoke-tested after release without payments or customer mutations.
