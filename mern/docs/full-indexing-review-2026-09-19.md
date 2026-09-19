# Full-site indexing review — 19 September 2026

This review applies Google's five categories shown in the owner's Search Console
screenshots to the website's entire current route registry. The screenshots show
six indexed URLs and ten excluded URLs, but not the URL examples or group counts.
The review therefore verifies website behavior without inventing Google's exact
URL-to-category assignments.

## Public and private route decisions

| Route | Intended search behavior |
| --- | --- |
| `/` | Index the canonical homepage |
| `/dog-training` | Index the training service page |
| `/behavior-assessment` | Index the behavior-assessment service page |
| `/dog-walking` | Index the walking service page |
| `/learn` | Index the public lesson overview; protect actual member lessons |
| `/contact` | Index the contact page |
| `/accessibility` | Index the accessibility statement |
| `/media-rights` | Index the media-permissions page |
| `/portal` | Keep the transactional booking screen noindex |
| `/account` | Keep the account screen noindex |
| `/schedule` | Keep the client schedule screen noindex |
| `/reset-password` | Keep password recovery noindex |
| `/community` | Keep member conversations noindex |
| `/admin` | Keep the staff/administrator screen noindex |

Every public route supplied HTTP 200, a single H1, useful HTML before JavaScript,
a matching canonical URL and indexable metadata. All six private route shells
supplied noindex metadata and HTTP headers. Their underlying APIs still enforce
authentication and authorization; robots directives do not provide security.

## What Google's categories mean here

- **Page with redirect:** document aliases and trailing slashes should redirect
  permanently to clean paths. Google should consider the destination, not index
  every alias. Preserve query parameters used by legitimate booking links.
- **Excluded by noindex:** expected for the six private/transactional screens.
  None of the eight public pages has an accidental noindex directive.
- **Alternate page with proper canonical tag:** tracking-query variants should
  point to the same clean canonical URL. They do not need separate indexing.
- **Crawled, currently not indexed:** Google fetched the URL but has not included
  it. Check the exact page's usefulness, canonical and rendering; this label alone
  does not identify a code defect or promise indexing after a deployment.
- **Discovered, currently not indexed:** Google knows the URL but has not crawled
  it yet. The canonical sitemap, real internal links and crawlable public resources
  support discovery. Do not remove private-page exclusions to reduce the count.

## Correction in this release

Public pages loaded through separate JavaScript modules could discard their
pre-rendered content and show “Opening Bravo…” while that module downloaded.
Startup now waits for the current public page module before taking over the HTML.
If the module fails, useful public content, contact information, metadata and normal
links remain available. Once it succeeds, the normal application, navigation,
account checks and editing tools start. Private screens and homepage startup retain
their existing behavior. This addresses a verified rendering weakness; it is not
proof that this weakness caused any particular Search Console exclusion.

## Verification

- Audited all 14 route shells, robots.txt and sitemap.xml directly on production.
- Parsed internal links, images, scripts, styles and font references. All 15
  additional distinct targets returned HTTP 200, including the public image and
  downloadable accessibility report. No missing public-page fragment targets.
- `node scripts/check-indexing.mjs` performs 43 read-only live checks covering all
  registered routes, all non-home `.html`/trailing-slash aliases, sitemap inclusion,
  crawler rules and a real noindex 404. It exits nonzero on a regression.
- `tests/public-content.browser.mjs` deliberately delays and aborts the training
  page module in Chromium and WebKit, checking retained content and successful
  interactive navigation after recovery. Existing SEO and homepage tests also run.

## Boundaries

The canonical apex domain is `bravounleashed.com`. The prior provider review found
no www-domain attachment on the Vercel project. Its DNS/attachment requires
provider configuration access beyond the exposed integration; no www fix is
claimed. The apex routes tested here work independently of that variant.

Search Console submission, URL Inspection results, Google's chosen canonicals,
and validation completion cannot be inferred from a public crawl. No private
Search Console action or guarantee of indexing all ten excluded URLs is claimed.
The correct goal is indexing useful canonical public pages, not every URL.

## Primary references

- [Google Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
