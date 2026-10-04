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
The phone sends one copy per viewer, targeting 540p/20fps and up to 700 kbps video per connection where the
browser supports bitrate control. More viewers increase phone upload, CPU and
battery use; removing the cap does not guarantee unlimited capacity or unchanged
quality. Existing API abuse protection and hosting/database quotas still apply.

## Network and cost boundary

The only ICE service is Cloudflare's public, free, unlimited STUN endpoint:
`stun:stun.cloudflare.com:3478`. STUN discovers reachable addresses; it does not
relay video. No TURN URL or credentials are configured. Some cellular networks,
VPNs or firewalls prevent a direct connection. Connection timeout explains this
and suggests Wi-Fi or another network. This deliberately cannot promise universal
connectivity or large public audiences. Direct peers can see each other's network
addresses. See https://developers.cloudflare.com/realtime/turn/faq/ and
https://webrtc.org/getting-started/turn-server.

## Access and lifecycle

- Existing staff authorization, assignment checks, CSRF protection, public consent,
  and one-open-session-per-trainer database index remain enforced.
- The trainer's browser reports local camera readiness every five seconds. There
  is no SFU to independently verify publication. LIVE means the authenticated
  trainer reports a ready camera; the viewer count reflects connected peers.
- Viewer SDP must be receive-only, audio/video only, and at most 40 KB. Only the
  original broadcasting trainer can answer. An owner may end another trainer's
  session but cannot impersonate that trainer's phone to answer offers.
- Each viewer receives a random in-memory capability; only its SHA-256 hash is
  stored. Logged-in viewer capabilities are bound to that user and credential
  version. Private access and trainer authorization are rechecked when polling.
- Offers/answers are never in public lists. Expiring LivePeer records use a TTL
  index; every API checks expiry directly rather than waiting for MongoDB cleanup.
  The 45-second lease is renewed while watching. End removes all peer records.
- Stopping ends local tracks and all local peers immediately. A remote owner stop
  or credential revocation reaches cooperative browsers on their next checks
  (trainer around 5 seconds, connected viewers around 15 seconds). Signaling loss
  closes the trainer's peer connections; viewers also fail closed on expired
  authorization. A stopped/frozen phone expires from discovery after 75 seconds.
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
