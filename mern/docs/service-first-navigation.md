# Service-first homepage and navigation

Base: production `d1691d77b78a50655ece2f9fd3c7934bb2623296`; feature branch `feat/service-first-navigation-20261021`.

## Observed issues

The production homepage placed the equipment shopping card immediately after the hero, ahead of the actual training offer. Service selection came after approach, video, reviews and team sections. First-visit answers and the final booking invitation followed the peripheral content. Reviews required opening About, while the persistent mobile bar offered Live cams but no direct service selector. Tools occupied a highlighted row in the shared hamburger menu. Preview inspection also exposed an existing desktop grid issue: additional-dog pricing and renewal terms fell below the program-terms control because their grid row was implicit.

## Changes

- Remove Tools from the shared header menu, covering both mobile controls and desktop. Preserve the page, all five product photographs and original purchase links, assessment-first copy, owner editing and footer access.
- Keep additional-dog pricing and renewal terms above the booking action on desktop by assigning their grid row explicitly, matching the reading order.
- Put the current monthly training offer directly after the hero. Follow with operational announcements/live status, service choices, reviews, trainers, first-visit answers and a booking invitation.
- Place the approach and Tools card together after that decision path, followed by videos, real-session photographs, workshops, FCI and online education. The same DOM order serves mobile, desktop and server-rendered pages.
- Expose Reviews directly beside Training & Pricing. Keep existing operational, account, how-to and role-specific destinations.
- Add Services to the mobile shortcut bar. Its anchor clears the fixed header, works from another route, and restores focus when used again after scrolling. Live Cams remains in the main menu.
- Retain Bravo’s black-and-gold styling, typography, approved media and all owner content keys. No payment, booking, account, membership, credit, database or streaming logic changes.

## Verification

Local lint, production build and all 251 unit tests pass. The existing safe-fixture browser coverage now checks the requested navigation and page order, both mobile menu toggles with Escape focus restoration, direct Reviews keyboard activation, the Services cross-route and repeated-anchor behavior, and continued Tools access through the homepage/footer. The viewport matrix is 360, 390, 768 and 1440 pixels in Chromium and WebKit, plus the 1280/1281px header boundary. Existing release checks retain booking, owner editing, security, media and broader responsive/accessibility regression coverage. Final browser and deployment results are recorded in the pull request.

No real bookings, charges or outbound messages are created by verification. Conversion uplift is not measured by this change. The separately observed production live-status database-acquisition delay remains outside this navigation update; no timeout or streaming behavior is changed.
