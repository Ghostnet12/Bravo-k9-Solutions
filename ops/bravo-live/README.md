# Bravo Live media service

The website controls authentication, client access and session records. A separate
LiveKit server carries WebRTC video/audio; Vercel never proxies the video. The code
ships disabled until this service exists. No paid infrastructure is provisioned by
this change. There is no automatic recording.

## Server choice and status

Proposed starting host: one DigitalOcean CPU-Optimized Droplet, 2 dedicated vCPUs,
4 GiB RAM, 25 GiB SSD, Ubuntu 24.04 LTS amd64, in a region close to the trainers.
The published regular plan costs **$42/month** before tax with 4,000 GiB of monthly
outbound transfer. Allowances accrue with runtime; outbound overage is $0.01/GiB.
This is a starting configuration to test, not a promise of 100 simultaneous viewers
or a hard monthly spending limit. No backups, extra disks or paid add-ons are included.
Pricing checked 2026-10-04:

- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/platform/billing/bandwidth/

**Hosting has not been purchased or provisioned by this change.** The generator's
credential isolation and refusal cases have been tested locally. The generated
containers still require runtime, DNS, TLS and phone/network verification on a VM.

## Deploy on the approved VM

The included generator adapts LiveKit's official VM layout: Caddy terminates TLS,
LiveKit supplies the SFU and authenticated TURN, and Redis remains host-local.
Separate coturn is unnecessary. Source attribution is in `NOTICE` and
`LICENSE.livekit-deploy`. Images are fixed by digest in `images.lock.json`.

1. Provision the approved persistent Linux VM with a public IPv4 address and SSH
   key authentication. Install Docker Engine and its Compose v2 plugin using
   https://docs.docker.com/engine/install/ubuntu/. Enable Docker at boot. Do not
   use an ephemeral development workspace as the production media server.
2. Attach a default-deny cloud firewall **before starting containers**. Mirror
   these rules in the host firewall. Keep existing SSH access until its allowed
   administrator source addresses have been verified.

   | Inbound traffic | Source | Purpose |
   | --- | --- | --- |
   | TCP 22 | Administrator IP/CIDR only | SSH management |
   | TCP 80 | Internet | Automatic certificate issuance |
   | TCP 443 | Internet | Secure signaling and TURN/TLS |
   | TCP 7881 | Internet | WebRTC TCP fallback |
   | UDP 443 | Internet | Authenticated TURN/UDP |
   | UDP 7882 | Internet | WebRTC UDP multiplexing |

   Do not expose TCP 7880, 5349, 6379 or 2019. Allow outbound traffic and established
   replies. This configuration uses UDP multiplexing, not a 50000–60000 media range.
3. Point both `live.bravounleashed.com` and `turn.bravounleashed.com` A records
   directly to the VM's public IPv4. Remove conflicting records for these two names
   only; this IPv4 deployment should not advertise AAAA records. Disable ordinary
   HTTP/CDN proxying for these names. The main website's DNS stays on Vercel.
4. Copy this directory to the server. As root, run the generator with an IPv4
   address actually assigned to a VM interface. Inspect `ip -4 addr` to obtain it;
   do not use loopback. Generate into a new private directory outside Git:

   ```sh
   python3 prepare-server.py --bind-ip VM_INTERFACE_IPV4 --output /opt/bravo-live
   cd /opt/bravo-live
   docker compose config --quiet
   docker compose pull
   docker compose run --rm --no-deps caddy validate --config /etc/caddy.json
   docker compose up -d
   docker compose ps
   ```

   JSON-formatted YAML is intentional. The generator refuses existing output
   directories and symlink paths. Files are private to root. The LiveKit secret is
   generated on the VM, not placed in cloud-init, source control, logs or chat.
   If generation fails partway, inspect the private directory before any retry;
   do not replace keys for an existing deployment.
5. Wait for Caddy to obtain trusted certificates for both names. From the directory
   containing the verification script, run:

   ```sh
   python3 verify-server.py --config /opt/bravo-live/livekit.yaml --expected-ip VM_PUBLIC_IPV4
   ```

   This checks DNS, both TLS handshakes and the authenticated LiveKit room API.
   It never prints credentials or room contents. It does not test media or TURN
   allocations; complete the acceptance checks below before public broadcasts.

The non-loopback Caddy TURN upstream follows the official generator's Firefox
compatibility fix. Caddy listens on TCP 443 while TURN/UDP uses UDP 443. LiveKit's
internal TURN/TLS listener is 5349, with external TLS termination; LiveKit 1.13.7
advertises the public TURN/TLS candidate on port 443. Ports 7880/5349 remain
reachable only locally/within the trusted host because of the firewall.

References:

- https://docs.livekit.io/transport/self-hosting/vm/
- https://docs.livekit.io/transport/self-hosting/ports-firewall/
- https://github.com/livekit/livekit/blob/v1.13.7/pkg/service/roommanager.go

## Connect the website

Set encrypted production Vercel environment variables on **bravo-k9-mern**:

- `LIVEKIT_URL=wss://live.bravounleashed.com`
- `LIVEKIT_API_KEY`: the server's API key
- `LIVEKIT_API_SECRET`: the matching secret, at least 32 characters
- `BRAVO_LIVE_ENABLED=true`: set only after the media server is ready

The generated private `vercel.env` supplies the matching values but deliberately
sets `BRAVO_LIVE_ENABLED=false`. Transfer values through authenticated secret
management; do not attach the file to a PR or paste it into chat. After the VM
passes the API check, enable the flag for the controlled private-session acceptance
test. Verify signed events reach `/api/live/webhook` and end the session correctly
before any public broadcast.

Redeploy after changing the variables. Never put keys in `VITE_*` variables,
client code, logs, browser storage, or a URL. The fixed media hostname is included
in both the Vercel and Express CSP. Camera/microphone permission is same-origin.

## Acceptance checks before launch

1. Sign in as a trainer. Open `/live/studio`, choose an assigned dog/client, and
   preview the camera. Switch front/rear cameras and enable/disable the microphone.
2. Start a **client-only** session. The session appears only after the SFU confirms
   an unmuted camera track. Sign in as the client on another device to watch it.
3. A signed-out viewer, another client, and an unrelated staff member must not
   discover the private session or obtain a watch token for its UUID.
4. End the session: viewers disconnect and new watch tokens are refused. Existing
   media credentials are short-lived bearer tokens; self-hosted LiveKit does not
   provide instant revocation of every already-issued token. Rooms are unique and
   never reused. Restart to change audience; never relabel an existing room.
5. Start a public session with permission from everyone filmed. Its homepage
   banner appears within about 15 seconds. Verify sound, fullscreen and timers.
6. Test iPhone Safari/PWA and Android Chrome over cellular, plus Wi-Fi viewers.
   Force TURN/TLS in a network test. Local tests do not prove cellular reachability.
7. Test lock-screen, incoming calls, tab close and airplane mode. Signed publisher
   departure events end rooms; absent heartbeats expire discovery/admission after
   75 seconds. Trainers must leave the broadcast screen open and phone unlocked.
8. Disable/rotate a test trainer's credentials during a broadcast. New admission
   must fail; the next authorized control request detects the change. Remember
   that this is not an instant global kill switch for a transport already open.
9. Verify actual server bandwidth, viewer capacity and monitoring before promoting
   public events. Each room currently caps participants at 100. There are no
   guarantees about frame delay or viewer capacity without a load/network test.

Studio Stop immediately stops local tracks even if its request fails. An `ending`
record remains locked and can be retried until the SFU confirms room deletion.
After a crash a trainer can close the old session from the studio and start anew.
The PWA is network-only: it never caches private API data, tokens or video.

## Operations and rollback

- Set DigitalOcean billing and resource alerts. Watch outbound transfer, CPU,
  memory, disk and packet loss during a representative broadcast. A billing alert
  does not cap spending. Set a suitable initial viewer limit after load testing.
- Preserve `/opt/bravo-live` securely, including Caddy certificate state, for
  recovery. Redis stores ephemeral routing state; application session records
  remain in the existing MongoDB deployment. There is no video recording storage.
- Reboot the VM during acceptance and confirm containers restart and a new session
  works. Leave automatic OS security updates enabled; schedule disruptive reboots
  and container upgrades outside live sessions.
- For an upgrade, review and update the image digests, retain the old configuration,
  and test a private session. Do not regenerate credentials just to update images.
- To disable new admissions, set `BRAVO_LIVE_ENABLED=false` on Vercel and redeploy.
  This alone does not terminate already connected media. To stop all media during
  an incident, run `docker compose down` from `/opt/bravo-live`; it disconnects all
  participants. Restart only after resolving the incident and verifying access.

Run the generator checks from the repository root:

```sh
python3 -m unittest discover -s ops/bravo-live -p 'test_*.py' -v
```
