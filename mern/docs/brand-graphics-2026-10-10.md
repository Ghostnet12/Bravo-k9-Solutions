# Bravo graphic language — October 10, 2026

## Design references inspected

- Method K9, https://www.methodk9.com/ — real trainer/dog photography, graphic backgrounds and clearly separated program destinations.
- K9 Integritas designer case study, https://www.wingnut-websites.com/dog-training-web-design — restrained natural palette supporting the client's photographs. The live K9 Integritas domain was not accessible in the research tool, so this is a case-study reference, not a live-site audit.
- The Dog Lady designer case study, https://sethbarham.com/portfolio/the-dog-lady-frontend-web-design — a consistent family of service icons, logo-derived patterns and graphic section rhythm. The responsive mockup was inspected. Borrow the coherent visual system, not the artwork or different training philosophy.
- Snooze & Sniff designer case study, https://www.eterniadigital.com/work-snooze-and-sniff/ — distinctive custom illustration and motion. Its storybook look was considered but not adopted for Bravo.
- Ruffwear, https://ruffwear.com/ — outdoor/working-dog storytelling and category clarity. Product marketing is not a training-quality endorsement.

## Original implementation

Nine small, original, self-hosted SVG drawings: companion, leash, assessment, compass, bond, focus, route, field contours and connection rings. No third-party artwork, code, fonts, tracking scripts or animation libraries were copied or embedded.

The existing real Bravo shield is retained. Graphics complement the original photographs rather than replacing or recropping them. Service icons sit next to existing labels; Trust, Train and Deploy become a connected three-part graphic; subtle field contours support specialist content; corner lines frame training/team photographs; short gold dividers establish visual rhythm.

Only the homepage's visual presentation changes. The integration is one CSS import and homepage-scoped rules. Existing content keys, prices, links, ad destinations, editing interactions, scheduler, payments, authentication and client records are not changed. CSS-generated elements have no text content and ignore pointer events. No new perpetual animation is added. Reduced-motion and high-contrast modes retain the actual content while reducing/removing decorative effects.

## Checks

`npm run lint`, `npm run build`, `npm test`, and `node tests/brand-graphics.browser.mjs`.

The focused browser test uses isolated public fixtures, checks 320/390/768/1440px widths, local asset delivery, service/assessment routes, keyboard navigation, enlarged text, reduced motion, contrast modes, the ad link and booking entry. It records screenshots and a JSON result in test-results. This is not a physical-device or payment test, a full accessibility certification, or a real-visitor Core Web Vitals measurement.
