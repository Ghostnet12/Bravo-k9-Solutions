# Bravo website operations

## Staff desk
Sign in with an existing staff account and open Staff desk. Today’s agenda uses Aberdeen time. Filter the latest 200 requests by name, phone, booking ID, status, or visit date. Confirm or cancel requests and reopen blocked times here. Calendar downloads are available for confirmed appointments; downloaded events do not synchronize automatically, so replace them after a schedule change.

## Lesson studio
Choose an upcoming topic or create a new lesson. Save titles, instructors, cover selection, and transcripts as drafts. Draft content and private media fields are accessible only to staff. The public catalog retains the approved coming-soon topics until a lesson is published.

Publishing requires a real private MP4/WebM video, VTT captions, and a nonempty transcript. The editor references existing private files; it does not upload video. The existing file-based delivery must be connected to durable private object storage for Vercel before recording uploads or paid lesson publication can launch. No media was fabricated or published by this update.

## Client tools
Clients can save their profile, change passwords, manage visit requests, and download confirmed appointments. Contact & visit help includes booking and account assistance. The phone navigation collapses behind Menu.

## Search
Public routes have their own initial HTML titles, descriptions, canonical URLs, and Open Graph metadata. robots.txt links to sitemap.xml. Account, staff, and community pages request no indexing. The canonical host is bravo-k9-mern.vercel.app; update shared/page-metadata.js when an approved custom domain is connected. Indexing is not guaranteed or submitted automatically.

## Remaining external setup
Stripe work is paused at the owner’s request. Recent checkout tests still returned live-mode sessions, so payment verification remains incomplete. This update does not change the Stripe configuration or disable payment endpoints. All test bookings from those checks were cancelled without submitting payment.

Real recordings, captions, durable private media storage, and any future automated recovery email provider still require setup. Account recovery currently directs customers to phone Bravo for identity verification.

## Validation
September 10, 2026: production build and 17 automated tests passed, covering routing, public metadata, account/database failure behavior, scheduling, pricing, calendar daylight-saving behavior, and existing security checks. Staff publishing and authenticated browser workflows still require final owner validation; no production staff record was impersonated or altered for testing.
