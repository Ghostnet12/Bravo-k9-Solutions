# Bravo website review — October 25, 2026

## Starting point and scope

Reviewed production commit `9296e0deb6575b278682557f9403ead785e83194`, deployment `dpl_7v2FrAZKCGDG5H4TXd7ZfzV5yoAm`, and the current application in `mern/`. Reviewed all 13 indexable public routes, navigation, the retired walking URL, public source, metadata, booking/account regression coverage and release checks. Public HTML returned successfully for every route. `/dog-walking` leads to dog training rather than a walking offer.

The hero, shield, black/gold palette, fonts, shared mobile/desktop navigation, real reviews, current prices, manual renewal, owner editing and working first-visit flow are worth keeping. Retired-service history remains available for historical payment reconciliation. No customer records or memberships are removed.

## Changes

| Finding | Change | Purpose |
| --- | --- | --- |
| Puppy card selected basic obedience | Select puppy foundations | Carry the visitor's choice into booking |
| Advanced and specialist inquiries lost their subject | Known program context on contact; matching links from homepage, goal selector and specialist booking note | Make the next conversation specific without selling a specialist package at the standard membership price |
| Membership and confirmation details were easy to miss | Plain explanation beside the main action; booking guide and equipment links nearby | Explain that exploration precedes account creation and a saved request does not charge a card or confirm an appointment |
| Several mobile descriptions used 12px text | 14–15px decision text and room for longer labels | Improve scanning and reading on smaller screens |
| Bravo's approach was absent from its main explanation | Explain “No treats. No toys.” in the existing approach section and use the existing approach component on the service page | Describe a concrete distinction without unsupported outcome claims |
| Training page repeated how to start | Keep one service journey and end with a useful booking/guide choice | Reduce repetition while providing a next step after reading |
| Team request failure could leave an empty section | Visible retry and phone alternative | Help visitors recover from a temporary content failure |
| Social preview used an old homepage image | Align homepage share metadata with the current hero | Keep shared links consistent with the landing page |
| Video filter could be mistaken for a retired service | Label the existing training topic “Leash skills” | Distinguish obedience content from dog walking as a service |
| Lesson-library action finished before its dependent refresh | Await the refresh; regression waits for the completed action before navigation | Avoid a race observed in the existing WebKit release check |

## Marketing basis and next decisions

Nielsen Norman Group's homepage guidance supports explaining the service clearly, showing concrete examples, prioritizing useful actions and keeping the page simple. The implementation keeps the existing hero and proof while repairing the paths from a visitor's problem to the appropriate service.

Google's local-ranking guidance emphasizes accurate business information, relevant services, reviews and photos. Keep Bravo's Google Business Profile aligned with Aberdeen mobile dog training, current contact details and current offerings. Remove retired services there if still listed. Publish real training examples with the situation, training focus and a clear booking link; use authentic reviews rather than invented success rates. No Business Profile edits, social posts or ad purchases were performed in this change.

Use the existing **Website health & bookings** report to compare tracked visits, booking starts and saved requests over comparable periods. Watch where visitors stop in the four-step flow. Saved requests, confirmed visits and payments are different outcomes. A better page does not establish a conversion lift until visitor data supports it; no conversion uplift or numerical quality score is claimed here.

Sources consulted:

- https://www.nngroup.com/articles/homepage-design-principles/
- https://support.google.com/business/answer/7091?hl=en

## Validation and limits

Run the production build before the unit tests: SEO tests read the rendered output. Release checks include lint, unit/security/indexing regressions, browser journeys, secret scanning and CodeQL. The marketing journey uses synthetic APIs and checks 320, 390, 768 and 1440px layouts, program context, trainer retry and absence of external writes. The existing booking regression covers account handoff and request payloads. WebKit checks run in CI where its operating-system dependencies are available; local Chromium is not a physical iPhone test.

No production booking, payment, lesson or live stream is created for testing. Authenticated owner/client behavior is tested with isolated fixtures, not a review of private production account data. Vercel's one-hour error-log query returned no error groups at review time; this is a limited observation window, not proof of zero incidents. Live publication depends on the required repository release checks and the resulting Vercel deployment.
