# Bravo Live — direct phone streaming

Bravo uses native browser WebRTC. The trainer's phone sends encrypted video/audio
straight to each viewer; Vercel and MongoDB handle authentication, session records
and short-lived connection setup only. No media server, LiveKit account, TURN
subscription, paid infrastructure or new service keys are required. No video is
recorded. Existing site/database quotas and ordinary phone data usage still apply.

## Use

Open `/live/studio` as a trainer, select the dog/client, choose Public or Client
Only, preview the camera, and press Start live. Viewers use `/live`. Client Only
requires the account attached to the selected booking; the broadcasting trainer
and owner also have authorized access. Public sessions appear in the homepage ad.
Camera and microphone permission are requested only by the trainer. Audio starts
off. Front/rear camera switching and microphone changes work during a session.
Keep the phone unlocked and this screen open. There is no fixed concurrent viewer cap.
The phone sends one copy per viewer, targeting 540p/20fps. No application video
or audio bitrate ceiling is imposed: the browser estimates bandwidth and adapts
each connection. No Wi-Fi-only rule, connection-type gate or minimum-speed check
is used. Cellular data is allowed, including browsers reporting Save Data. More viewers increase phone upload, CPU and
battery use; removing the cap does not guarantee unlimited capacity or unchanged
quality. Existing API abuse protection and hosting/database quotas still apply.

## Network and cost boundary

The shared `shared/live-network.js` configuration uses two public free STUN
endpoints: `stun:stun.cloudflare.com:3478` and `stun:stun.l.google.com:19302`.
A second provider avoids depending on one address-discovery service. STUN discovers
reachable addresses; it does not relay video or bypass carrier NAT/firewalls. No TURN URL or credentials are configured. Some cellular networks,
VPNs or firewalls prevent a direct connection. Connection timeout explains this
and suggests Wi-Fi or another network. This deliberately cannot promise universal
connectivity or large public audiences. Direct peers can see each other's network
addresses. See https://developers.cloudflare.com/realtime/turn/faq/ and
https://webrtc.org/getting-started/turn-server.

## Access and lifecycle

- Existing staff authorization, assignment checks, CSRF protection, public consent,
  and one-open-session-per-trainer database index remain enforced.
- Preview, permission and a new session record cannot go LIVE. After Start, a
  browser-local WebRTC sender/receiver verifies advancing encoded AND decoded camera
  frames. The authenticated phone reports these counters and camera readiness every
  2 seconds. Only healthy publication sets `startedAt` once and renews `lastPublishedAt`.
  This is a real encode/decode pipeline, not an independent media-server observation
  or proof of external network reachability. It adds a small local test connection.
- `shared/live-policy.js` defines the authoritative server lifecycle. `/api/live`
  supplies one snapshot to the hero, banner, ad promotions, viewing page and trainer
  active-session list. It loads current eligible staff public names (including the
  existing public-name normalization), dedupes trainer IDs and rejects blocked,
  removed or revoked accounts. New staff and changed public names need no code edit.
- Starting has no publication/start timestamp and is never advertised. Live requires
  healthy advancing frames less than 8 seconds old. Stalled counters or an 8-second
  publication gap produce Reconnecting and remove red LIVE claims/promotions.
  Healthy publication before expiry restores the session.
- A 20-second gap in either heartbeat or healthy publication makes a session Ended;
  discovery closes it and deletes peers. Abandoned starts expire after 20 seconds
  without a heartbeat. This is checked on access, independent of Mongo TTL cleanup.
- Discovery polls every 2 seconds with a 4-second timeout and server-clock correction.
  Normal start/end announcements target <5 seconds after the successful server
  operation. A client-side lease check suppresses stale LIVE while requests lag.
  Failed requests/disabled service are Unavailable, never confirmed Offline.
  Offline is a successful available response with no active public broadcast.
- Private announcements expose only public trainer name, staff ID, on-air status and
  Client session label/access-aware route. Private session IDs, dog, focus, client,
  booking, room, SDP and capabilities remain absent from public responses.
- Elapsed time uses persisted `startedAt`; refreshing never resets it. Start labels
  explicitly use America/Chicago Central Time including DST. Focus is trainer-entered;
  no metadata or viewer count is invented (trainer counts connected peers).
- Viewer SDP must be receive-only, audio/video only, and at most 40 KB. Only the
  original broadcasting trainer can answer. An owner may end another trainer's
  session but cannot impersonate that trainer's phone to answer offers.
- Broadcaster answers/rejections use per-peer request budgets for existing,
  authorized connections. Invalid or unauthorized requests retain the shared API
  limit. A burst of viewers does not exhaust the trainer’s general API budget.
- Each viewer receives a random in-memory capability; only its SHA-256 hash is
  stored. Logged-in viewer capabilities are bound to that user and credential
  version. Private access and trainer authorization are rechecked when polling.
- Offers/answers are never in public lists. Expiring LivePeer records use a TTL
  index; every API checks expiry directly rather than waiting for MongoDB cleanup.
  The 45-second lease is renewed while watching. End removes all peer records.
- Stopping ends local tracks and all local peers immediately. A remote owner stop
  or credential revocation reaches cooperative browsers on their next checks
  (trainer around 2 seconds, connected viewers around 4 seconds). Transient signaling loss
  retries with a Reconnecting status while preserving healthy peers until the
  20-second publication lease expires. Terminal authorization/session errors stop
  immediately; on lease expiry the trainer's peer connections close; viewers also fail closed on expired
  authorization. A stopped/frozen phone loses LIVE at 8 seconds and expires at 20 seconds, plus the UI/discovery tick.
  No server can forcibly revoke an already established direct connection between
  modified/non-cooperating clients; clients must implement these lease checks.
- Audience is immutable. Stop and start again to change Public/Client Only.
- The PWA is network-only and does not cache streams, private API data or tokens.

## Configuration and rollback

Direct mode is available by default on the existing deployment. No new environment
variables, DNS, hosting account or provisioning is needed. Set
`BRAVO_LIVE_ENABLED=false` and redeploy to disable discovery/admission. Existing
cooperative browsers close when their next control request is refused. Removed
LiveKit environment variables are no longer read. The paid host proposal was
withdrawn; do not deploy it.

## Homepage and ad dock

The homepage has a red recording light beneath hero copy, wrapping current trainer
links, and Client session labels. All live ads/announcements use the same snapshot.
The old saved unconditional “Bravo is live now” alert is filtered on API reads/writes
and defensively in the UI. The original live hero photo is preserved and contained
at phone/tablet/desktop sizes so the trainer's head and dog stay in frame.

Public Watch live is primary; sign-in and trainer studio links remain nearby. Sound
focus pauses competing media, and site music stays paused on live routes. Offline
keeps OUT IN THE FIELD / Explore training and up to three existing published uploaded
proof videos with training metadata, excluding obvious signup/sale promotions. Clips
are labeled Recorded training; failed media is removed. No next date is fabricated.

The original ad placement is removed. The fixed black/gold dock preserves existing
records, order, images, links, timing, fades and owner/admin editing. Three production
ads were image records at implementation. The same editor can also reference an
existing approved uploaded proof video; no new hosting/upload system is added.
Persistent keyed media elements and stable rotation dependencies survive scrolling,
clock updates and data refreshes. Videos stay muted. Pause/resume and expanded artwork
are accessible; reduced motion starts rotation/video paused and disables pulses/fades.
Measured dock height plus safe area reserves footer space and lifts floating controls.
Empty/hidden collections leave no gap. Dialogs/fullscreen obscure and pause the dock;
visualViewport keyboard shrinkage hides it while preserving layout space.

## Verification

`tests/live.integration.js` checks client isolation, token binding, receive-only
signaling, concurrent admission beyond the former three-viewer cap, expiry, account
revocation and shutdown with
an isolated MongoDB replica set. `tests/live-direct.browser.mjs` sends actual test
video/audio from a Chromium broadcaster to four simultaneous Chromium and WebKit viewers,
including camera switching and teardown. `tests/live.browser.mjs` checks mobile
and desktop presentation, the public banner and camera cleanup. These automated
same-host tests do not prove cellular NAT traversal. Finish acceptance on a real
iPhone and Android plus a viewer on a different network; unsupported networks must
show the direct-connection failure message, never silently enable a paid relay.

Additional focused checks: `live-policy.test.js` covers lease boundaries;
`live-experience.browser.mjs` covers fixture status transitions, rename/private/error
states, persisted elapsed time, full photo framing, 320/390/768/1440 px layouts,
playing ad continuity/footer/floating controls/dialogs/focus/reduced motion/empty
collections. Screenshots explicitly label isolated TEST DATA. Existing ad/banner
integration and editor checks cover durable editing, permissions, timing, ordering,
hiding, deletion and invalid/deleted video references. Fixture counters are not media
proof. The direct browser test also checks a second synthetic publisher, switching,
independent stop, and a closed tab whose end request is lost. Four simultaneous media
viewers means three Chromium and one WebKit on the same CI host, not four real phones.

### Remaining physical acceptance procedure

1. On an actual iPhone Safari, then Android Chrome, sign in to HTTPS `/live/studio`.
   Select Public, dog/focus and consent. Enable preview: no public LIVE badge yet.
2. Tap Start. Within 5 seconds of successful publication check the real staff name.
   On another device on a different network open its link, Watch live, enable audio,
   confirm moving camera imagery/voice and no competing music. Test mic, flip and
   fullscreen/return. Add three viewers and record their devices/networks/quality.
3. Refresh a viewer: elapsed time continues. Start a second trainer and switch.
   End one then the last: each disappears within 5 seconds. Repeat with airplane mode,
   lock screen or closed tab: LIVE disappears at the 8-second lease plus a UI tick;
   stale session expires after 20 seconds plus discovery. Restore and start again.
4. Start Client Only for a saved booking. Anonymous/different-client accounts see
   only public staff name and Client session. Only assigned client/trainer/owner can
   obtain the private stream; public responses contain no dog/client/media secrets.
5. In phone portrait/landscape, scroll to the footer and test artwork, pause/resume,
   expanded ad, editing, floating controls, forms/keyboard, dialogs, browser bars and
   notch safe area. Confirm controls remain reachable and ads keep their position.

Native phone camera, cellular NAT traversal, physical audio quality, device thermal/
upload capacity, lock-screen behavior, native keyboard and iOS fullscreen/safe-area
behavior require these physical checks. Same-host browser tests cannot establish them.
Free practical connectivity options are existing Wi-Fi or a less restricted network,
with the phone kept foregrounded. No universally reachable or unlimited audience is
promised. Aggregate upload is the sum of each viewer connection, plus audio and overhead;
there is no fixed Mbps promise after removing the per-connection bitrate ceiling. Existing per-IP abuse budgets can affect large shared-IP groups;
these are not a fixed viewer cap. No new relay, host or paid fallback is provisioned.

### Cellular startup regression

Camera encode/decode health is now established before creating the server session.
Slow phone setup must not consume the 20-second abandoned-start lease. A failed
health check creates no session, and failed admission cleans up local tracks.
The direct browser suite delays a real WebRTC health statistics read by 21 seconds,
checks that no session exists during setup, and then verifies successful publication
and four viewers with advancing media frames. It also marks browser connection
metadata as cellular/2g/Save Data and verifies no bitrate ceiling on the senders.
These metadata flags and same-host synthetic camera frames are not an actual
carrier or phone-camera test. Removing a bitrate ceiling does not repair blocked
direct ICE connectivity. No TURN relay, paid service or new host was introduced.
