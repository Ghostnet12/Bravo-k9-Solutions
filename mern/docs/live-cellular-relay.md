# Bravo Live: cellular viewer relay and guest access

## Activation status

Code support is not an activated relay. The production project had no TURN
credentials when inspected on October 11, 2026. No provider account, paid service,
production server, or relay credential was created by this change.

Current public broadcasts already permit anonymous viewers and account holders
without a membership. The UI now says that explicitly. Client-only sessions,
broadcaster ownership, public consent, and the camera-health repair from PR #99
are retained.

## Why this change

The former client used only STUN and direct peer connections. Certain carrier
NAT/firewall arrangements cannot carry that direct connection. Lowering bitrate
alone cannot create a missing route. TURN supplies the alternate media route;
UDP, TCP, and TLS on 443 cover different network restrictions.

Both roles request `/api/live/:id/network` before creating an offer or answer.
The endpoint checks session visibility, current broadcaster authority, freshness,
same-origin request protections, and request budgets before issuing temporary
credentials. It checks authority again after a provider call. A public guest
needs no account or subscription; a private session does not expose credentials
to an unrelated account or guest. Browsers never receive a provider master key.

## Option A: Cloudflare Realtime TURN

Use a TURN key, not a general-purpose account API key. Through the Vercel project’s
server-side production environment settings, add:

- `BRAVO_TURN_KEY_ID`: the Cloudflare TURN key identifier.
- `BRAVO_TURN_API_TOKEN`: its associated server-side TURN API token, stored as a
  sensitive secret. Never paste it in a public issue, repository or client bundle.

The server calls the fixed Cloudflare credential-generation endpoint. Returned
ICE routes are restricted to Cloudflare's primary UDP/TCP port and TLS port 443.
Blocked alternate ports and unrelated hosts are not passed to browsers.

Cloudflare documentation reviewed October 11, 2026 states a shared SFU/TURN free
allowance of 1,000 GB per month, then $0.05 per GB of egress. That is not an unlimited
free service or a promised spending cap. Provider setup/billing needs the owner’s
approval. No charges were authorized by this patch.

Official sources:
https://developers.cloudflare.com/realtime/turn/generate-credentials/
https://developers.cloudflare.com/realtime/sfu/platform/pricing/
https://webrtc.org/getting-started/turn-server

## Option B: an existing authenticated coturn server

Set `BRAVO_TURN_URLS` to a JSON array containing the server’s UDP, TCP and valid
TLS-on-443 endpoints. Set `BRAVO_TURN_SHARED_SECRET` to the matching REST-auth
secret (at least 32 characters). Do not configure the Cloudflare variables at the
same time. Provision certificates, firewall rules, bandwidth quotas, abuse
controls and private-address peer restrictions on that server independently.
The application cannot host production TURN inside Vercel HTTP functions.

Credentials are generated with HMAC-SHA1, an expiration and a random opaque name.
They expire after six hours; this bounds credentials, not a permanent session
entitlement. Ended/private/revoked sessions cannot issue new credentials. Existing
TURN credentials remain valid at the provider until expiration or provider-side
revocation; the app's stream signaling and media teardown enforce session access.
A viewer reconnecting receives fresh credentials. Sessions beyond the credential
window may need a new viewing connection. Credentials are not logged or persisted
in application records.

## Release and verification

After entering approved provider settings, deploy the tested branch, reopen the
trainer’s studio and begin a new broadcast. Verify from a signed-out second phone
with Wi-Fi disabled, using actual carrier data. Check that the selected ICE
candidate is a relay when direct connectivity is blocked; success on one Wi-Fi
network does not establish this. Repeat for the supported browsers, microphone
switching, camera flip, viewer retry, broadcast end, and private access denial.
Keep the existing production deployment available for rollback.

The automated relay test starts an authenticated coturn server bound to loopback
in an isolated runner. It forces both peers to use `iceTransportPolicy: relay`,
checks the actual selected relay candidates for UDP and TCP, and receives real
advancing browser video in a signed-out guest context with camera requests denied.
This is actual relayed media, not a mock of RTCPeerConnection or video counters,
but it is NOT a physical iPhone, carrier network or external TLS certificate test.

No TURN configuration: existing direct viewing is retained and the studio warns
that restricted mobile networks still need relay activation. Partial or invalid
configuration: report a configuration error, not false relay success. Provider
failure: show a bounded, sanitized error and permit retry.

Internet access alone is not a universal guarantee: captive portals, no signal,
blocked endpoints, provider outages, quotas and exhausted upload capacity can
still interrupt video. TURN does not turn the current per-viewer phone upload
architecture into a one-upload broadcast SFU.
