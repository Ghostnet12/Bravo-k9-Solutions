# Bravo cinematic concept preview

Isolated non-production design prototype requested by David. Do not merge this branch directly into bravo-mern, attach the live domain, or promote it to production. Port only the approved presentation components into the existing application after review.

Run `cd mern && npm install && npm run build`. The Vercel root directory is `mern`. A production-environment build deliberately fails.

The mobile menu, program filters/details, trainer cards, photo gallery, local hero-video picker, and three-step demonstration booking are functional. The video picker creates a browser-only object URL; it never uploads a file. Booking choices remain in page memory only. There are no account, payment, scheduling, analytics, or customer-record integrations.

MongoDB Atlas was inspected with read-only access. No database or collection was created or modified. Content is bundled. `api/concept.js` is an optional read-only adapter requiring a dedicated `BRAVO_PREVIEW_MONGO_URI` with least-privilege access to only `bravo_concept_preview.site_content`. It never reads the live MONGO_URI. The adapter reads a single allowlisted announcement and supports no writes. Do not configure it with production credentials.

Owner-supplied logo derivatives preserve the original image design (cropped and resized, not redrawn). Photography is copied from the existing public website asset tree. Reviews and numerical claims are deliberately not invented. All proposed copy/media is subject to owner approval.

The isolated scaffold intentionally omits the production application, its serverless functions, crons, and environment files. This is not a drop-in replacement for the operational site.
