#!/usr/bin/env python3
"""Generate a private, single-host Bravo media deployment. Never prints keys."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets

LIVE = "live.bravounleashed.com"
TURN = "turn.bravounleashed.com"
HERE = Path(__file__).resolve().parent


def prepare(output, bind_ip):
    ip = ipaddress.IPv4Address(bind_ip)
    if ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_reserved or ip.is_link_local:
        raise ValueError("Use a non-loopback IPv4 address assigned to this server.")
    requested = Path(output).expanduser()
    if not requested.is_absolute():
        raise ValueError("Output must be an absolute path outside a Git checkout.")
    if any(p.is_symlink() for p in [requested, *requested.parents]):
        raise ValueError("Output path must not contain symlinks.")
    destination = requested.resolve()
    if any((p / ".git").exists() for p in [destination, *destination.parents]):
        raise ValueError("Credentials must be generated outside a Git checkout.")
    if destination.exists():
        raise ValueError("Output already exists; refusing to overwrite credentials.")
    if not destination.parent.is_dir():
        raise ValueError("Create the output parent directory first.")
    images = json.loads((HERE / "images.lock.json").read_text())
    api_key = "BRAVO" + secrets.token_hex(12)
    api_secret = secrets.token_hex(32)
    livekit = {
        "port": 7880,
        "rtc": {"tcp_port": 7881, "udp_port": 7882, "use_external_ip": True},
        "room": {"auto_create": False, "empty_timeout": 90,
                 "departure_timeout": 20, "max_participants": 100},
        "redis": {"address": "127.0.0.1:6379"},
        "keys": {api_key: api_secret},
        "turn": {"enabled": True, "domain": TURN, "tls_port": 5349,
                 "external_tls": True, "udp_port": 443},
        "webhook": {"api_key": api_key,
                    "urls": ["https://bravounleashed.com/api/live/webhook"]},
        "logging": {"level": "info"},
    }
    # Based on LiveKit's VM generator. A non-loopback TURN upstream is needed
    # for Firefox; the host firewall blocks external access to port 5349.
    routes = []
    for domain, upstream, tls_handler in [
        (TURN, f"{ip}:5349", {"handler": "tls"}),
        (LIVE, "127.0.0.1:7880", {"handler": "tls", "connection_policies": [{"alpn": ["http/1.1"]}]}),
    ]:
        routes.append({"match": [{"tls": {"sni": [domain]}}], "handle": [
            tls_handler, {"handler": "proxy", "upstreams": [{"dial": [upstream]}]}
        ]})
    caddy = {
        "admin": {"disabled": True},
        "logging": {"logs": {"default": {"level": "INFO"}}},
        "storage": {"module": "file_system", "root": "/data"},
        "apps": {
            "tls": {"certificates": {"automate": [LIVE, TURN]}},
            "layer4": {"servers": {"main": {"listen": [":443"], "routes": routes}}},
        },
    }
    services = {}
    for name, command, volumes in [
        ("redis", ["redis-server", "--bind", "127.0.0.1", "--protected-mode", "yes",
                   "--save", "", "--appendonly", "no"], []),
        ("livekit", ["--config", "/etc/livekit.yaml"], ["./livekit.yaml:/etc/livekit.yaml:ro"]),
        ("caddy", ["run", "--config", "/etc/caddy.json"],
         ["./caddy.json:/etc/caddy.json:ro", "./caddy-data:/data"]),
    ]:
        services[name] = {
            "image": images[name], "command": command, "network_mode": "host",
            "restart": "unless-stopped", "volumes": volumes,
            "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}},
        }
    services["redis"]["healthcheck"] = {
        "test": ["CMD", "redis-cli", "ping"], "interval": "5s", "timeout": "3s", "retries": 12,
    }
    services["livekit"]["depends_on"] = {"redis": {"condition": "service_healthy"}}
    files = {
        "compose.yaml": json.dumps({"name": "bravo-live", "services": services}, indent=2) + "\n",
        "livekit.yaml": json.dumps(livekit, indent=2) + "\n",
        "caddy.json": json.dumps(caddy, indent=2) + "\n",
        "vercel.env": f"LIVEKIT_URL=wss://{LIVE}\nLIVEKIT_API_KEY={api_key}\nLIVEKIT_API_SECRET={api_secret}\nBRAVO_LIVE_ENABLED=false\n",
    }
    previous_umask = os.umask(0o077)
    try:
        destination.mkdir(mode=0o700)
        for name, content in files.items():
            with (destination / name).open("x") as handle:
                handle.write(content)
        (destination / "caddy-data").mkdir(mode=0o700)
    finally:
        os.umask(previous_umask)
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind-ip", required=True, help="Non-loopback IPv4 assigned to the VM")
    parser.add_argument("--output", required=True, help="New absolute directory, e.g. /opt/bravo-live")
    args = parser.parse_args()
    try:
        prepared = prepare(args.output, args.bind_ip)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Preparation failed: {error}\n")
    print(f"Prepared {prepared}. Website broadcasting remains disabled. See the deployment README.")
