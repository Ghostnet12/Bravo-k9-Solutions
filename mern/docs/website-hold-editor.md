# Bravo website editing

Sign in with the owner or administrator account, open the page, and hold the item for about two-thirds of a second. A normal tap still follows a link; moving your finger cancels the hold so the page scrolls normally.

- Text and links: edit the wording, destination, font, size, alignment, color or spacing. Use **Edit this part** to select a containing card or section. **Publish website changes** saves all parts changed in the current draft together. A conflict saves none of that draft.
- Program cards and prices: hold the price or card to edit the real program name, description and prices. Training includes an additional-dog rate. Online lessons include the combined training + lessons total. Prices update public pages, new quotes and checkout. Existing bookings retain their server-recorded agreement.
- Trainer profiles: hold a trainer’s name or title. Public name, title and introduction can change while the account identity, portrait slot, assignments and joint trainer option remain stable. **Colors & layout** opens the card’s design controls.
- Backgrounds: select a section, card or the whole website. Choose a solid color, gradient, transparency or uploaded photo, with photo position and darkness controls. Uploaded backgrounds do not affect the live page until publication. Abandoned drafts expire after 24 hours; published images and the previous version for Undo are retained.
- Photos and videos: hold the media, or use its visible owner controls. Each program also has a photo/video toolkit. The hero, trainer gallery, proof videos and advertisements retain their specialized editors.
- Workshops: hold the workshop details to edit the event. The weather and information banner is immediately below the hero; hold it to edit announcements, colors and movement.
- Keyboard: focus an editable item and use Alt+E, or use **Edit page text & design**. The media editor also supports F2.

Editors are available only to owner/administrator accounts that have completed password setup. Public edits never change account permissions, private customer records, payment states, published customer review evidence or calendar reservations. Use their existing management controls for those records.

All writes use server authorization, same-origin enforcement, validation and audit records. Content and program/profile editors detect stale revisions. Program prices stay in the catalog rather than arbitrary display-text overrides. Server-rendered prices and the browser start with the same published catalog snapshot.

Validation: `npm run lint`, `npm run build`, `npm test`, `tests/website-editor.integration.js`, `tests/website-editor.browser.mjs`, and the existing content, program media, hero, banner, scheduling, payment and security suites. Hosted CI runs isolated MongoDB and Chromium/WebKit. Local MongoDB cannot start in the managed sandbox; production data is never used for tests.
