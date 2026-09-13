# Review branch status: superseded

Do not merge or force-push this branch onto `bravo-mern`.

During review on September 13, 2026, production advanced independently to `b48f932a6c9ec14d572ff881c348ba861b00ccd2`. That release already implements backdated calendar-month onboarding and the David-and-Ashley joint trainer option. Its implementation differs from this review branch. Preserve production and fetch its latest state before any subsequent changes.

Verified release checkpoint:
- Repository: Ghostnet12/Bravo-k9-Solutions; production branch: bravo-mern.
- Vercel project: bravo-k9-mern; production alias: bravounleashed.com.
- Deployment dpl_8ADMryuSPNtC2iyeDVEnMJxHF4ot was READY for the production commit above.
- Live GET /api/health returned HTTP 200 with {"ok":true}.
- Production workflow 34734767637 (Client schedules and manual memberships) completed successfully. It covers the build, unit tests, four database integration suites, client-services browser regression, membership/joint-trainer browser checks, and hero first-paint checks.
- Production artifact 10310816300 contains screenshot evidence; mobile membership-date and joint-acceptance screenshots were inspected.

Live onboarding uses optional `membershipStartDate` and `trainingDogCount` fields. January 1 ends February 1: a calendar month, not a fixed thirty-day period. Blank start creates an account without training access. Historical/future access follows the selected month and does not create a card charge or invent past visits.

Production joint assignments use `staffIds` and `requestedStaffIds` alongside legacy single-trainer fields, and real trainer identities. Both schedules/capacities and acceptance states are checked. This branch's alternative co-trainer fields must not be introduced without deliberate reconciliation and migration analysis.

This note documents a verified point in time, not a guarantee that the production branch will remain unchanged.
