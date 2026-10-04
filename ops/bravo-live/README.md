# Bravo Live media service

The website controls authentication, client access and session records. A separate
LiveKit server carries WebRTC video/audio; Vercel never proxies the video. The code
ships disabled until this service exists. No paid infrastructure is provisioned by
this change. There is no automatic recording.

## Deployment prerequisites

Use a maintained Linux VM with a public IP and sufficient outbound bandwidth.
Create DNS records `live.bravounleashed.com` and `turn.bravounleashed.com` pointing
to that service. These records must permit direct WebRTC traffic; an ordinary
HTTP-only reverse proxy cannot carry all media transports.

Use LiveKit's official VM deployment generator, which generates Docker Compose,
Caddy TLS routing, TURN, and optional Redis configuration:
https://docs.livekit.io/transport/self-hosting/vm/

Follow the current generated deployment rather than deploying a bare coturn
container: coturn alone is not the signaling server or an SFU. Review and pin the
generated container versions. Keep generated keys/configuration off GitHub.

Apply `livekit.example.yaml` settings to the generated configuration. Retain its
TLS certificate locations and TCP 443 routing: HTTPS and TURN/TLS share an IP only
when the generated layer-4 routing handles both hostnames. Do not expose port
7880 publicly without the HTTPS proxy or expose Redis publicly.

Allow the generator's required ports, typically TCP 80/443/7881, UDP 443/7882.
If its configuration uses a UDP port range instead of the UDP mux port, allow that
range instead. See https://docs.livekit.io/transport/self-hosting/ports-firewall/.
Set the signed webhook URL to `https://bravounleashed.com/api/live/webhook` using
the same LiveKit API key. Verify signed events reach the handler before enabling.

## Connect the website

Set encrypted production Vercel environment variables on **bravo-k9-mern**:

- `LIVEKIT_URL=wss://live.bravounleashed.com`
- `LIVEKIT_API_KEY`: the server's API key
- `LIVEKIT_API_SECRET`: the matching secret, at least 32 characters
- `BRAVO_LIVE_ENABLED=true`: set only after the media server is ready

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
