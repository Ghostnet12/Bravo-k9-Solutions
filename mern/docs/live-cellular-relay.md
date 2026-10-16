# Bravo Live: cellular viewing and public audiences

## Activation status
This change adds TURN support; it does not provision a hosted TURN server.
Production is still direct-only until an owner-provided relay account is connected.
Do not label the cellular repair complete based only on unit tests, a green build,
or a `relayConfigured` flag. That flag means configuration exists, not that a
carrier-to-viewer media path has been verified.

## Recommended production configuration
Create a Cloudflare Realtime TURN key in the owner's account. Put its key ID and
associated API token in Vercel's production environment variables:

- `BRAVO_TURN_PROVIDER=cloudflare`
- `CLOUDFLARE_TURN_KEY_ID`: the TURN key ID
- `CLOUDFLARE_TURN_API_TOKEN`: its associated server-side credential
- `BRAVO_LIVE_ICE_POLICY=all`

Never put the token in source code, chat, an ad field, or a VITE-prefixed variable.
Redeploy after adding environment variables. Credential issuance runs on the
server against Cloudflare's fixed API endpoint. Browsers receive only expiring
TURN username/password values with UDP, TCP and TURN-over-TLS 443 endpoints.
Both trainer and viewer configure ICE before generating descriptions. Connections
renew their configuration before expiry; ended sessions cannot obtain new access.
Already issued TURN credentials remain usable until their TTL expires: TURN is
not the private-session authorization system. Private media signaling remains
server-authorized, and existing viewers are disconnected on revocation/closure.

An owner-managed coturn alternative uses `BRAVO_TURN_PROVIDER=coturn`, comma-
separated `BRAVO_TURN_URLS`, and a high-entropy `BRAVO_TURN_SHARED_SECRET` (32 or
more characters) matching coturn's TURN REST auth secret. Configure production
TLS certificates, port 443, peer restrictions, allocation/bandwidth quotas and
monitoring. Never copy the localhost test's allow-loopback setting to production.
The repository does not launch a production relay or change provider billing.

## Public versus client-only
Public live sessions are available to anonymous guests and signed-in users with
no subscription. Viewers do not provide a camera or microphone. Client-only
sessions still require the assigned client, broadcasting trainer or owner. The
connection credential endpoint applies the same audience checks before issuance
and rechecks the session after upstream latency. Provider failure does not return
fake or unprotected credentials. Guessed sessions and private-session access fail.

Validated token-bound peers receive separate polling rate budgets so legitimate
viewers sharing a cellular public IP do not consume one another's polling quota.
Unknown/expired/guessed credentials retain ordinary aggregate abuse protection.
Join/credential requests remain rate-limited. No fixed simultaneous viewer cap was
added. A direct-plus-TURN architecture still sends a separate stream per viewer
from the trainer's phone: upload capacity is not unlimited. Large audiences need
an SFU or broadcast delivery service rather than a promise of unlimited bandwidth.

## Acceptance checks
1. Set the provider in a nonproduction isolated test environment. Force
   `BRAVO_LIVE_ICE_POLICY=relay` and prove the selected candidate is `relay`, not
   merely that relay credentials exist.
2. Start a public broadcast and watch from a phone on mobile data, with Wi-Fi off,
   signed out, and without a subscription. Confirm moving video and optional audio.
3. Repeat with publisher on cellular and viewer on a different carrier. Test
   reconnecting after switching networks. A stable data connection is required;
   data service alone cannot guarantee every firewall or low-signal situation.
4. Verify a private stream cannot be discovered/watched or obtain credentials by
   a guest or unrelated account. Check shutdown, stale sessions and revocation.
5. Restore `all` for direct-first operation unless relay-only is deliberately
   selected, and monitor provider usage/limits. Do not change fees automatically.

## Automated evidence
`live-relay.test.js` validates provider request/response, transport endpoints,
expiry/HMAC, safe errors and no long-lived secret exposure.
`live-relay.integration.js` uses a temporary database and real API authorization
for guests, non-subscribers, private audiences, shared-IP quotas and closure races.
`live-relay.browser.mjs` runs a temporary loopback-only authenticated coturn server,
uses native WebRTC and synthetic camera pixels, forces relay on both ends, and
asserts selected relay/TCP candidates, advancing frames, two anonymous viewers,
microphone control and cleanup. This is not a physical carrier or iPhone test.

## Provider references (checked October 11, 2026)
- https://webrtc.org/getting-started/turn-server
- https://developers.cloudflare.com/realtime/turn/generate-credentials/
- https://developers.cloudflare.com/realtime/sfu/platform/pricing/

At the check date Cloudflare documents 1,000 GB/month free shared by SFU and TURN,
then $0.05/GB egress. The allowance is not a guarantee of zero bills. Obtain owner
approval for account setup/charges and check current provider terms before use.
