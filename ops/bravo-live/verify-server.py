#!/usr/bin/env python3
"""Verify DNS, trusted TLS and authenticated room API. Does not prove WebRTC."""
import argparse
import base64
import hashlib
import hmac
import json
from pathlib import Path
import socket
import ssl
import time
import urllib.error
import urllib.request


def encoded(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=")


def verify(config_file, expected_ip):
    config = json.loads(Path(config_file).read_text())
    key, secret = next(iter(config["keys"].items()))
    tls = ssl.create_default_context()
    for hostname in ["live.bravounleashed.com", "turn.bravounleashed.com"]:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)}
        if addresses != {expected_ip}:
            raise ValueError(f"{hostname} must resolve only to the selected VM IPv4; check A/AAAA records.")
        with socket.create_connection((hostname, 443), timeout=10) as connection:
            with tls.wrap_socket(connection, server_hostname=hostname):
                pass
    now = int(time.time())
    payload = {"iss": key, "nbf": now - 5, "exp": now + 60, "video": {"roomList": True}}
    message = b".".join(encoded(json.dumps(part).encode()) for part in [{"alg": "HS256", "typ": "JWT"}, payload])
    signature = encoded(hmac.new(secret.encode(), message, hashlib.sha256).digest())
    token = (message + b"." + signature).decode()
    request = urllib.request.Request(
        "https://live.bravounleashed.com/twirp/livekit.RoomService/ListRooms", data=b"{}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15, context=tls) as response:
        body = json.load(response)
        if response.status != 200 or not isinstance(body, dict):
            raise ValueError("Unexpected room API response.")
    print("PASS: DNS, both TLS certificates, and authenticated room API. WebRTC/phone tests still required.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Generated private livekit.yaml")
    parser.add_argument("--expected-ip", required=True, help="VM public IPv4")
    args = parser.parse_args()
    try:
        verify(args.config, args.expected_ip)
    except urllib.error.HTTPError as error:
        parser.exit(1, f"Room API failed with HTTP {error.code}. Check the server credentials.\n")
    except (OSError, ValueError, KeyError, StopIteration) as error:
        parser.exit(1, f"Verification failed ({type(error).__name__}); check DNS, TLS and the private config.\n")
