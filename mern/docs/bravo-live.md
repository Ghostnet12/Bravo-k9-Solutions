# Bravo Live

- Public watching: `/live`; trainer camera: `/live/studio`.
- The trainer signs into the existing Bravo session and selects a saved request,
  or enters a dog name for a public demonstration. Private access is bound to the
  saved booking's client on the server, not to an arbitrary submitted client ID.
- Camera permission and preview precede broadcasting. Audio starts off; rear
  camera is preferred. Capture uses 720p at up to 24 fps and LiveKit simulcast.
- Starting creates a private `starting` record and a publish-only, camera/mic-only
  token. The server confirms a camera publication before setting `live`.
- Viewers get receive-only tokens. Public summaries omit client IDs, contact
  details, booking IDs, credentials and internal room names. Private rooms are
  discoverable by the client, broadcasting trainer and authorized administrators.
- Only one open session per trainer is allowed by a MongoDB partial unique index.
  Staff credential version and assignment are checked during creation; startup
  shares the staff authorization transaction lock.
- Heartbeats every 15 seconds confirm the camera with the SFU. Listings expire
  after 75 seconds without a successful heartbeat. The signed departure webhook
  ends sessions when the broadcaster leaves. End hides first and retries room
  deletion if the service is temporarily unreachable.
- Audience is immutable. Stop and start a new room to change public/private mode.
- `/live` and `/live/studio` pause the site soundtrack. Public homepage banners
  only use public sessions. Private client sessions create an in-site notification.
- `BRAVO_LIVE_ENABLED` and the three LiveKit environment variables are required.
  See `ops/bravo-live/README.md` at the repository root for deployment and launch
  tests. An unconfigured server leaves preview available and Start Live disabled.

Tests: `node --test tests/live.integration.js` uses a disposable MongoDB replica
set and mocked SFU control calls to check authorization, token grants, concurrent
start, expiry, shutdown retries, and signed webhook processing. It does not prove
actual camera-to-viewer transmission or cellular TURN connectivity. Run the
infrastructure acceptance checks against a real media server before activation.
