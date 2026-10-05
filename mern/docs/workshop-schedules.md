# Workshop schedules

Owner and delegated Administrator accounts can use Profile → Workshop management
(`/admin?tab=workshops`) or **Edit workshop date** on Home and Workshops. Existing
press-and-hold editing and Edit workshop details remain available.

The stored configuration has `scheduleMode` (`specific`, `weekly`, `none`) and
separate Central wall-clock `startTime`/`endTime` (HH:mm). Existing specific-date
records and legacy display times remain supported. Weekly mode requires valid
start/end clocks. Publication is independent; saving a draft never publishes it.

`shared/workshop-schedule.js` resolves America/Chicago's calendar day server-side.
Saturday remains current until Sunday 00:00 Central; Sunday through Friday resolve
the upcoming Saturday. Calendar arithmetic avoids elapsed-hour/DST assumptions.
No job, database date rewrite, open browser, or visit is needed for correctness.
Public API responses are no-store; open pages and ad collections refresh every
15 seconds and on return to a visible tab. SSR, API, preview and linked ad captions
use the same resolver. No-date presentation omits Date and Time while management
retains configured clocks.

Dated occurrences use `featured:YYYY-MM-DD`. Schedule edits transactionally append
revision snapshots to BravoWorkshopOccurrence and never move an old date record.
The owner-only occurrence history endpoint is `/api/admin/workshop-occurrences`.
The current site confirms seats manually: there are no workshop registration,
payment, attendance or capacity records to migrate or test. Future booking work
must attach these to the occurrence ID, never just `featured`, and calculate
capacity per occurrence. This change does not implement a booking/payment system
or claim that manual historical records have been migrated.

Workshop-linked ads (`/workshops`, or the existing Saturday ad ID) use the resolved
schedule. The original `/images/saturday-workshop-october-3.webp` has October 3
baked into its pixels. It remains editable in the ad manager but is suppressed
when it would advertise another date or an unpublished workshop. Replace it with
approved **date-free** artwork using the existing ad editor; dynamic captions
reserve their own space and do not obscure artwork. Uploaded dated artwork must
also be replaced by its owner; metadata cannot alter pixels. Other ads keep their
existing rotation, destinations, permissions, and playback implementation.

Tests: `node --test tests/workshop-schedule.test.js tests/workshop-html.test.js`,
`node --test tests/discovery.integration.js tests/site-ads.integration.js` and
`node tests/discovery.browser.mjs`. Browser screenshots named `workshop-schedule-*`
use isolated test data, not production workshop changes. No extra paid resources
or scheduled jobs were introduced. Live code and the restored /live hero were not
changed.
