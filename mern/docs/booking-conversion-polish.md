# Bravo booking and conversion refinement

## Implementation prompt

Improve the existing Bravo K9 Solutions website in `Ghostnet12/Bravo-k9-Solutions`, starting from production `bravo-mern`, in `mern/`. Work in a feature branch, provide a reviewable pull request and preview, pass required release checks, then deploy to the existing Vercel production project and verify the live domain. Production deployment is explicitly authorized for this update.

1. Shorten the first booking screen. Keep the current calculated price and manual-renewal terms visible. Put the dog fields sooner; move explanatory detail into an accessible disclosure. Preserve four stages, drafts, sign-in return, trainer choice, specialist pricing, full-month scheduling, waiting lists and the how-to video.
2. Combine training videos, optional session stories and training photographs into one coherent proof section. Reduce repeated large headings and default page length. Preserve all approved media, playback controls, swipe behavior and owner editing keys.
3. Move routine date, weather and announcement content below the primary customer decision path. Keep urgent live-session visibility and all banner editing controls.
4. Use correlated production client/server timing to identify the live-status delay. Make a narrow, verified change that removes unnecessary waiting. Preserve streaming, private-session authorization, broadcasting, offline/error distinctions, timeout values and full database initialization for account/booking writes.
5. Use the existing privacy-respecting booking analytics to display the proportion of booking starts that produce a server-saved request. Keep staff exclusions, privacy preferences, deduplication and server-verified conversion attribution. Do not claim measured uplift without real post-release data.

Preserve Bravo’s black/gold identity and typography, customer data, authentication, Stripe, membership dates/credits, both mobile menus, service prices and the complete how-to guide. Test Chromium and WebKit at 360, 390, 768 and 1440px with safe fixtures. Create no real bookings, payments or outbound messages. Record evidence, limitations, preview, commit and production deployment in the pull request.

## Reproduction and cause

- The live first-visit screen displayed a page introduction, a dog-step introduction and membership explanation before the first input. The reviewed desktop screenshot placed the first input near the viewport bottom.
- The homepage rendered featured stories and a video library for the same clips, followed by a separate large training-photo section. The routine moving announcement strip interrupted the main offer/service path.
- Correlated production timing on October 21 showed a client live-status timeout at 4,009ms (zero client queue), with its server request taking 6,627ms: 6,522ms waiting for database readiness and 63ms for the live snapshot. Later startup records identify repeated model/collection/index initialization as the dominant part of readiness: for example 352ms connection + 2,070ms initialization, including 2,035ms model work. Platform/network time can add further latency.
- `connectDb()` used one promise for connection plus initialization of all application models and schedule defaults. GET `/api/live` waited on that entire promise despite needing only existing state. The proposed split preserves automatic index creation and the full readiness barrier for all other requests; only the exact live-status GET can read after connection while Vercel retains initialization work.
- Existing analytics already attribute conversions to actual saved booking records. A booking-start completion percentage can be calculated from those counts without new tracking or customer fields.

## Verification record

Final checks, visual evidence and deployment identifiers are recorded in the pull request. Conversion uplift requires subsequent real traffic. Live-status improvements must be judged with measured samples; removing initialization from the status response path does not eliminate platform cold starts or network outages.
