# Bravo K9 — Staging Build 02

A separate, multi-page website for design review. This is not a production replacement.

## Run

Node.js 22 is required. No third-party dependencies are needed.

```sh
cd mern
npm test
npm run build
npm run preview
```

The build produces 20 content pages plus a custom 404 page. Each page is prerendered HTML, with small JavaScript modules for interactions. This build is not the production React application and does not include a production backend.

## Review features

- Eight individual training-program pages, approach page, team directory and three biographies.
- Media gallery with a lightbox and device-local video preview.
- Three-step demonstration booking with session-local preferences and a clearly labeled demo JSON export.
- Preview studio for headline, supporting copy, announcement, and accent color. Edits are saved only in this browser, with a JSON export and reset.
- Responsive layouts, native links, mobile navigation, and reduced-motion support.

## Isolation

This branch must not be merged into `bravo-mern` or `main`. The build refuses Vercel production targets and those branch names. These guards supplement, but do not replace, operational review.

No API endpoints, production app code, customer records, live scheduling, Stripe integration, database access, or production credentials are included. No Atlas database was created or modified. MongoDB Atlas remains disconnected from this app. Browser CSP disallows application network connections and form submissions.

Deploy only as a non-production Git branch preview. Never promote this deployment to the live domain. A production release requires explicit owner approval, content/media review, integration with existing functions, and separate testing.

## Content and assets

Logos are the supplied Bravo assets reused from the previous preview branch. Supporting images and portraits are reused from the existing website repository. The hero and dog portrait are illustrative crops from the approved mockup, not documentary photographs. Biographies and program copy are drafts. Reviews, ratings, success figures, course availability, pricing, and appointment availability have not been invented.

See QA.md for checks and limitations.
