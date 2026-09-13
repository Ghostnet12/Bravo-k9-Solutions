# Bravo search visibility

Canonical website: https://bravounleashed.com/
Sitemap: https://bravounleashed.com/sitemap.xml
Robots: https://bravounleashed.com/robots.txt

## Implementation

- `shared/page-metadata.js` is the source for titles, descriptions, canonical URLs, social previews, indexing rules, and LocalBusiness / WebSite / WebPage / BreadcrumbList / Service JSON-LD.
- The build renders the real public React components through `client/src/entry-public.jsx`. Public text and links are present without JavaScript; normal React behavior and live API data take over in the browser. No authenticated requests or member data are used during rendering.
- Public landing pages: home, dog training, behavior assessment, dog walking, online lessons, contact, accessibility, media permissions. Each has one H1 and a self-referencing canonical URL.
- Booking, schedule, account, password reset, staff desk and community screens receive `noindex` in their initial HTML and HTTP headers. They are omitted from the sitemap. Authentication remains the actual security boundary.
- The sitemap is generated from the public route registry on every build. It excludes query strings, aliases and private routes. No invented last-modified dates, priorities or frequency claims.
- Vercel resolves known routes explicitly. Unknown URLs use `404.html` with a real 404 response. Both Vercel and Express redirect `.html` aliases and trailing slashes to canonical paths while retaining queries.
- `robots.txt` advertises the sitemap and allows public images, config, team, reviews and lesson-catalog responses needed to render the public pages. Other API endpoints remain disallowed.
- Existing published hero framing is applied to the pre-rendered image and preload before the first frame. Owner image edits, undo, booking and memberships remain supported.
- Public service descriptions link to the existing booking flows. Prices are not duplicated in the new landing-page copy or structured data. The existing home/walking/lesson components retain their catalog fallbacks and refresh from the public config as before.
- New pages remain lazy-loaded in the interactive application. Existing optimized WebP images, dimension attributes, local fonts and lazy loading remain in place.

## Publishing and verification

Run `npm run build`, then `npm test`. `node tests/seo.browser.mjs` verifies JavaScript-disabled public content plus responsive navigation, FAQ controls and metadata changes in Chromium and WebKit. The existing client-services workflow also runs scheduling, membership, login, deletion-permission and home-hero regressions before release.

On production, check each sitemap URL returns 200 with matching canonical metadata, private routes have noindex, unknown URLs return 404, and aliases redirect. Parse sitemap.xml as XML and verify robots.txt advertises the same URL.

## Search Console and ongoing local discovery

These tasks need access to the business's Google properties and are not completed by deploying website code:

1. In the verified Search Console property for bravounleashed.com, submit `sitemap.xml` under Sitemaps.
2. Inspect `/`, `/dog-training`, `/behavior-assessment`, and `/dog-walking`; run the live URL test and request indexing if appropriate.
3. Review Pages, Performance, and Core Web Vitals after Google recrawls. Indexing and rankings are search-engine decisions, not deployment guarantees.
4. Keep the Google Business Profile name, phone, website, real service area and business details consistent with the site. Do not invent a storefront address or fixed hours for a mobile business.
5. Add genuine service information and client feedback as it becomes available. Do not add fake ratings, city doorway pages or keyword lists. Self-serving review stars are not included in the business JSON-LD.

No Google verification token, Search Console submission, Google Business Profile changes, or ranking improvement is claimed by this release. The public sitemap is discoverable through robots.txt immediately; Google chooses when to crawl it.

## Sources

- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://vercel.com/kb/guide/custom-404-page
- https://vite.dev/guide/ssr.html
