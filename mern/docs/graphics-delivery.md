# Graphics delivery, October 2026

The original Bravo shield, photography, photo dimensions, owner framing, and
black/gold design are preserved. This update improves delivery of existing artwork.

| Published image | Original bytes | WebP bytes | Dimensions |
| --- | ---: | ---: | --- |
| Team portrait (`team-ashley-northrop`) | 2,675,573 | 140,770 | 1122 × 1402 |
| Training certificates (gallery entry `09a4e693-7c6e-4ebb-9bc1-5a7d122ecdc6`) | 2,530,029 | 223,596 | 1536 × 864 |
| Main training gallery photo | 380,738 | 142,022 | 1056 × 1298 |
| FCI world banner | 2,095,526 | 130,946 | 2172 × 724 |
| FCI intro shield | 207,932 | 18,820 | 512 × 512, displayed at 130–180 CSS pixels |

## Published uploads

`server/site-image-rendition.js` matches both the SHA-256 of an upload ID and its
exact photo slot. The existing API URL resolves the current MongoDB record, checks
expiry and upload availability, then returns an uncached redirect to the matching
content-hashed WebP. Unknown/replacement uploads continue through existing media
delivery. Framing and undo still use the unchanged MongoDB originals and snapshots.
Range requests continue to stream original bytes. Private/background/lesson media
cannot match this explicit public-photo map. No new runtime image decoder is added.

Copies were encoded with Sharp WebP quality 86, effort 6, auto-orientation, original
dimensions and no retained EXIF metadata. Content hashes name the static files for
immutable caching. Before regenerating a copy, confirm the current upload identity
and photo key; never select by revision alone. Original byte SHA-256 values:

- Portrait: `ff61c50d53ef6dab2bba01a4126aaf1a42e79243a6bfad7294a9eb529570d48d`
- Certificates: `49fb9de0bdf6b6a29b0187e2a588f0ec6fd4bdf447d1accf8882c00640abd42e`
- Main gallery: `fe6a73a393e8507b76dfb9149a0dfd35138b64bb330ccf1e42051f48baaa6262`

## Static artwork

The FCI banner uses the original PNG at WebP quality 86/effort 6. The intro logo
uses the original JPEG resized to 512 pixels wide at quality 92/effort 6. Original
files remain available. Four decorative resource symbols now use inline SVG paths,
matching the site's existing outline icon style without platform-dependent glyphs.

The app manifest includes 192- and 512-pixel PNG icons plus a separate 512-pixel
maskable icon. Both new PNGs are raster exports of the existing `bravo-app-icon.svg`;
the maskable export centers a 384-pixel rendering on a 512-pixel #101010 canvas.
The complete shield fits inside the central 80%-diameter safe circle. The original
SVG, favicon and Apple touch icon remain available unchanged.

## Verification

- `npm run lint`, `npm test`, `npm run build`
- `node --test tests/media-editor.integration.js` (isolated MongoDB replica set)
- `node tests/fci.browser.mjs` (Chromium and WebKit, 375–1440 pixels)
- Existing photo editor, homepage, transport and security regression workflows
- Live mobile/tablet/desktop image delivery and layout comparison after deployment
