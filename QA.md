# Staging QA — 2026-10-03

## Local checks completed

Eight Node tests passed. They cover unique prerendered routes, program/team destinations, strict design input validation, demo preference validation, HTML escaping, absence of application network/transaction code, and production target/branch build rejection. The normal local build generated 21 routes including the custom 404.

Offline Chromium interaction checks passed for program filters (2 everyday / 6 working paths), local editor apply/reset/escaped text, persistence logic with a Storage fixture, all three demo-booking steps and back navigation, gallery next/previous and Escape closure, and mobile navigation. No horizontal overflow was found on the homepage at 320, 390, 768, or 1440 pixels. The booking flow also completed with native browser storage unavailable and reduced motion requested. All 21 generated pages contain one H1 and known internal page links. No JavaScript page errors occurred during these interaction checks.

## Important limits

The testing environment blocks browser network navigation. Browser tests used locally generated markup rendered offline, not a full hosted end-to-end browser run. Storage persistence used an in-memory test fixture; unavailable native storage was tested separately. Supporting local image fixtures were representative only; the GitHub deployment tree reuses the original repository image assets. The approved hero and dog crops were checked visually on desktop and mobile.

Real-device Safari playback, real-origin storage across page navigation, full hosted accessibility/performance checks, final media crops, and approved business copy still require review. This is not a production security or accessibility certification. Production deployment has not been authorized.
