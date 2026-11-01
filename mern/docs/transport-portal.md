# Private transport portal

The `/transport` page uses existing Bravo accounts. Its entry points are the hamburger menu, K9 Transport page and signed-in account page. Registration, sign-in and required password setup return to the portal. No training membership is needed.

Bravo owner/delegated-owner accounts create breeder businesses, assign existing breeder/client accounts, create trips and post status updates. A breeder sees trips assigned to their enabled business. A client sees trips explicitly assigned to their account, including the breeder business name. Ordinary staff receive no transport privileges. Breeder access is a separate assignment, never a global owner/staff role.

## Operation

1. Have each breeder and client create their own Bravo account. Confirm the account with the person using a known contact method before granting access; an entered email alone is not verified identity.
2. Open **Bravo controls → Add a breeder** and enter the business name and the breeder's existing account email.
3. Create one trip per dog/client delivery. Select the breeder, optionally assign the client, and add pickup/destination cities and planned times. Multiple dog records may use the same vehicle tracker.
4. Start sharing to **!bravok9transport** in the Glympse app while parked. After pickup, update the trip status so its Glympse card appears. Post brief care/rest-stop updates; the draft buttons append editable text without publishing until Save. Times are stored as UTC and shown in each viewer's local device time zone. ETA is entered by Bravo; there is no automatic route-time estimate.
5. Mark the trip delivered or cancelled. Both remove the Glympse card from this trip, stop any dedicated hardware sharing, clear any saved hardware location and permanently close the journey. **Neither stops Glympse**: stop sharing in the Glympse app when the vehicle’s run is complete. For another journey, create a new trip.
6. Disable a breeder's access in Bravo controls to revoke their business-wide reads. Clear the client email in the trip editor to revoke that client's trip access. These assignments are independent. Global account blocking/removal also revokes access through existing authentication.

## Glympse — current tracking provider

Owner-provided public viewer: https://glympse.com/!bravok9transport
Supported embed: https://glympse.com/ext/!bravok9transport (generated with https://developer.glympse.com/tools/host).

The public K9 Transport page, guest portal and signed-in portal overview have a shared vehicle card. Active trip details show it after pickup; scheduled and completed trip details do not. The public tag remains accessible independently of private trip access. It is **not a per-dog or private GPS feed**, and may show multiple participants. A tag sharing password restricts contributors, not viewers. Do not post customer addresses, dog names or private trip details to the public tag.

Viewers choose **View vehicle map** before any Glympse iframe request. A direct full-screen link is always available if embedding fails. Copies contain either the public tracking URL or an owner-generated trip invitation pointing to the existing authenticated route. The copy buttons never send messages. Clipboard failure exposes selectable text.

Glympse owns its sharing timer, map markers and last-update timestamp. Bravo does not scrape the map, claim fresh GPS based on iframe loading, calculate a Glympse ETA, auto-renew sharing, or start/stop the phone. The owner road checklist explains app sharing and safe-stop renewal. The iframe sends no dog/client/trip identifiers, has no referrer and receives no camera, microphone or geolocation permission. CSP allows only the exact Glympse frame origin, without broadening script/connect policies.

Confirm the last-update time in Glympse before travel, keep the phone powered and check duration/signal at safe stops. Delivery in Bravo is independent of Glympse sharing, including when several dogs share one vehicle.

Vendor references verified November 1, 2026:
- https://app.glympse.com/faq/how-can-i-add-a-live-glympse-viewer-to-my-website/
- https://app.glympse.com/faq/how-do-i-share-my-glympse-premium-tag-location-with-others/
- https://glympse.zendesk.com/hc/en-us/articles/211602763-What-are-Glympse-Tags

## Optional dedicated GPS connection: not used by Glympse

The earlier dedicated-tracker receiver and private coordinate map remain available for a separately configured hardware tracker. Glympse works through its supported viewer and does not need this receiver. The hardware path is **not a vendor integration**. The actual tracker brand/model, vendor API entitlement, reporting frequency and credentials are still required. Never claim a tracker is connected simply because the receiver secret is configured. Test a real device before starting a customer trip. Nothing polls a vendor yet; do not expose vendor tokens in client code, URLs or trip fields.

A trusted server adapter must authenticate to the chosen GPS vendor, verify its device ownership/feed, normalize its report and POST to `/api/transport/gps`. The adapter may use vendor webhooks or polling according to the vendor's supported API. Do not weaken the receiver signature to accommodate an unauthenticated device callback. No browser phone location is collected.

Set `TRANSPORT_GPS_WEBHOOK_SECRET` to a random secret of at least 32 characters in the intended Vercel environment and the trusted adapter through secure configuration. Do not commit it. Rotate both together. The endpoint returns 503 when unconfigured. The UI prevents enabling sharing while unconfigured.

Send `Content-Type: application/json`, `X-Bravo-Timestamp` (current Unix seconds), and `X-Bravo-Signature` (hex HMAC-SHA256 over `timestamp + '.' + exact request body bytes`). The signature window is five minutes. Body limit is 2 KB. Payload:

```json
{
  "deviceId": "vendor-device-identifier",
  "latitude": 45.46,
  "longitude": -98.48,
  "accuracy": 15,
  "observedAt": "2026-10-31T18:00:00.000Z"
}
```

`accuracy` is optional and measured in metres. Observation time must not be in the future or more than 24 hours old. Normalize vendor clock skew in the trusted adapter, while preserving actual fix age. The assigned vehicle ID must match exactly. Signed requests are limited to 120 per device per minute. Repeated/older fixes are ignored; the response does not reveal device or trip matches. New sharing periods reject fixes from before their start. Pausing or changing the vehicle clears the old location.

## Privacy and truthful status

- Server-side authorization applies to lists and individual trip reads; guessed URLs disclose no trip details.
- Lists omit locations. Detail responses omit client IDs, emails and tracker identifiers for breeders/clients. Access uses account IDs, not a typed business name.
- Only the latest GPS fix is retained per active trip. No route history is recorded. Off-trip reports are ignored. Completed trips retain ordinary status notes, not coordinates.
- API responses and the portal use `private, no-store`; the portal is excluded from indexing. Location is not written to browser storage or application audit events.
- The map is an OpenStreetMap embed, whose service receives the displayed coordinates and viewer IP as needed to render it. It does not receive dog names, breeder names, account identifiers or Bravo cookies. Referrer policy is `no-referrer`. The iframe domain is explicitly allowed in both security policies.
- A fix older than two minutes is labelled last reported, not live. HTTP failure also removes the live label. No fix produces a waiting state. The browser polls every 30 seconds while visible; this is not continuous guaranteed tracking. Cellular outages remain possible.
- Pickup/destination labels and shared notes are visible to both assigned parties. Do not include other clients' addresses, door codes or private handling information.

## Validation

`npm run lint`, `npm test`, `npm run build`, `node --test tests/transport.integration.js`, and `node tests/transport-portal.browser.mjs` (Playwright Chromium/WebKit installed).

Integration uses a disposable MongoDB replica set, never production. It covers owner-only writes, CSRF, list/detail isolation, signed GPS validation, duplicate/out-of-order reports, stale fixes, pausing, vehicle changes, breeder/client revocation, blocking and delivery shutdown. Browser fixtures exercise layout, authentication return, owner create/update, stale map and unauthorized states. Fixture GPS coordinates are test data, not live transport evidence.
