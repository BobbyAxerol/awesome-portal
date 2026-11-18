#!/usr/bin/env python3
"""DRAFT, NOT RUN on the host. Offline renderer for STEP 4 of the OKX Paper profile: the new source proxy and the new Edge instance on 10.70.0.2:8446.

Reads (read-only) `docker inspect` of the running Paper Edge and the running Sandbox source proxy (the shapes to copy) and the two committed nginx templates in ./templates
(copies of deploy/execution-d1/source-proxy). Writes only into --out (never overwrites, 0600) and never prints a secret: the inputs contain none (secrets are files).
Sub-commands:  render --out DIR [--option a|b] [--image sha256:<digest>]   |   check --out DIR [--option a|b] [--image ...]   (re-render in memory, compare with DIR/RENDER.sha256)
OPTION B (default, minimal risk): NO new bridge and NO new certificate. The new proxy listens on the EXISTING Paper bridge gateway 172.23.0.1 at the new port 8454 with the SAME server certificate (its SAN has
IP 172.23.0.1, a SAN has no port); the new Edge joins the Paper bridge (external network) at the fixed free address 172.23.0.4 under a DISTINCT service name (so it does not take the DNS alias `execution-edge`
of the Paper Edge). OPTION A: new bridge 172.30.0.0/24, gateway 172.30.0.1, port 8444, NEW leaf source-proxy-server-okx.crt/.key.
Outputs: edge-okx.compose.json, proxy-okx.compose.json, nginx.manager-okx.conf, manager-v2-locations-okx.conf, RENDER.sha256.
Without --image the Edge image is the literal placeholder __OKX_EDGE_IMAGE_DIGEST__ (the build is not done yet); the owner approves the hashes of the files rendered WITH the real digest.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAPER_EDGE = "portal-execution-edge-execution-edge-1"
SBX_PROXY = "portal-execution-edge-sandbox-source-proxy-1"
LIVE_EDGE = "portal-execution-edge-live-execution-edge-1"            # reference for cpu_shares / mem_reservation of the compose lineage
PROJECT = "portal-execution-edge-okx"
OPTIONS = {
    "a": {"subnet": "172.30.0.0/24", "gateway": "172.30.0.1", "port": "8444", "service": "execution-edge", "cert": ("source-proxy-server-okx.crt", "source-proxy-server-okx.key")},
    "b": {"subnet": "172.23.0.0/24", "gateway": "172.23.0.1", "port": "8454", "service": "execution-edge-okx", "cert": ("source-proxy-server.crt", "source-proxy-server.key"),
          "edge_ip": "172.23.0.4", "network": "portal-execution-edge_execution-private"},
}
OPT = OPTIONS["b"]
NETWORK_SUBNET, NETWORK_GATEWAY, PROXY_PORT = OPT["subnet"], OPT["gateway"], OPT["port"]
EDGE_HOST_BIND = ("10.70.0.2", "8446")
FACADE_PORT, ISSUER_PORT = "8323", "8324"
PROFILE_ID, AUDIENCE = "PAPER_OKX_SWAP", "portal-execution-edge-paper-okx"
SHARED_EDGE_DIR = "/srv/primus/portal/execution-edge"              # existing shared directory, mounted read-only exactly like the other three Edges
SHARED_PROXY_DIR = "/srv/primus/portal/source-proxy"
STATE = "/home/bobby/.local/state/portal-execution-edge/releases/okx-paper-20261118"
RELEASE_SHA = "sha256:8fd7bdf8d1cc36a50077b7e5565c58ba6886a03f76680c48640c00a9f97d6f82"
PLACEHOLDER = "__OKX_EDGE_IMAGE_DIGEST__"
SERVER_CERT, SERVER_KEY = OPT["cert"]
# Env of the Paper Edge that belongs to features this instance keeps OFF (files or manifests it must not reference): dropped from the copy.
DROP_PREFIXES = ("EDGE_MANAGER_EVENT_LEDGER_", "EDGE_REALTIME_", "EDGE_MANAGER_PROJECTION_", "EDGE_PROJECTION_DATABASE_URL_FILE", "EDGE_QUERY_CURSOR_")
def use_option(name: str) -> None:
    """Switch the module constants to option a or b (the default is b)."""
    global OPT, NETWORK_SUBNET, NETWORK_GATEWAY, PROXY_PORT, SERVER_CERT, SERVER_KEY
    OPT = OPTIONS[name]
    NETWORK_SUBNET, NETWORK_GATEWAY, PROXY_PORT = OPT["subnet"], OPT["gateway"], OPT["port"]
    SERVER_CERT, SERVER_KEY = OPT["cert"]
    FORCE["EDGE_SOURCE_ORIGIN"] = f"https://{NETWORK_GATEWAY}:{PROXY_PORT}"


FORCE = {
    "EDGE_ENVIRONMENT": "paper",
    "EDGE_MANAGER_V2_PROFILE_ID": PROFILE_ID,
    "EDGE_MANAGER_V2_READ_ENABLED": "true",
    "EDGE_DELEGATION_AUDIENCE": AUDIENCE,
    "EDGE_SOURCE_ORIGIN": f"https://{NETWORK_GATEWAY}:{PROXY_PORT}",
    "EDGE_MANAGER_CATALOGUE_RELEASE_FILE": "/run/manager-release/catalogue.json",
    "EDGE_MANAGER_CATALOGUE_RELEASE_SHA256": RELEASE_SHA,
    "EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS": "0",                    # memo OFF first, one change at a time
    "EDGE_MANAGER_PROJECTION_ENABLED": "false",
    "EDGE_MANAGER_EVENT_LEDGER_ENABLED": "false",
    "EDGE_REALTIME_SSE_ENABLED": "false",
    "EDGE_PROJECTION_INGESTION_ENABLED": "false",
    "EDGE_ANALYTICS_QUERY_ENABLED": "false",
    "EDGE_SHADOW_QUERY_ENABLED": "false",
    "EDGE_PAPER_WORKBENCH_SHADOW_ENABLED": "false",
    "EDGE_COMMAND_RELAY_ENABLED": "false",
    "EDGE_SOURCE_PROBES_ENABLED": "false",
}
NEVER = ("EDGE_MANAGER_SOURCE_DB_PIN_FILE", "EDGE_MANAGER_SOURCE_DB_PIN_SHA256")      # the guard pin is a LATER step (override file), never part of the first start


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inspect(name: str) -> dict:
    return json.loads(subprocess.check_output(["docker", "inspect", name]))[0]


def image_env(ref: str) -> dict:
    data = json.loads(subprocess.check_output(["docker", "image", "inspect", ref]))[0]
    return dict(item.split("=", 1) for item in data["Config"]["Env"])


def compose_env(container: dict) -> dict:
    base = image_env(container["Image"])
    env = dict(item.split("=", 1) for item in container["Config"]["Env"])
    return {k: v for k, v in env.items() if base.get(k) != v}


def dump(value) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def edge_env(paper: dict) -> dict:
    env = {k: v for k, v in compose_env(paper).items() if not k.startswith(DROP_PREFIXES) and k not in NEVER}
    env.update(FORCE)
    return dict(sorted(env.items()))


def render_edge(paper: dict, reference: dict, image: str) -> dict:
    cfg, host, ref = paper["Config"], paper["HostConfig"], reference["HostConfig"]
    health, ulimit = cfg["Healthcheck"], host["Ulimits"][0]
    service = {
        "cap_drop": host["CapDrop"],
        "command": cfg["Cmd"],
        "container_name": f"{PROJECT}-execution-edge-1",
        "cpu_shares": host["CpuShares"] or ref["CpuShares"],
        "cpus": host["NanoCpus"] / 1e9,
        "entrypoint": cfg["Entrypoint"],
        "environment": edge_env(paper),
        "group_add": list(host["GroupAdd"]),
        "healthcheck": {"test": health["Test"], "interval": f"{health['Interval'] // 10**9}s", "timeout": f"{health['Timeout'] // 10**9}s",
                        "start_period": f"{health['StartPeriod'] // 10**9}s", "retries": health["Retries"]},
        "image": image,
        "init": host["Init"],
        "logging": {"driver": host["LogConfig"]["Type"], "options": host["LogConfig"]["Config"]},
        "mem_limit": str(host["Memory"]),
        "mem_reservation": str(host["MemoryReservation"] or ref["MemoryReservation"]),
        "memswap_limit": str(host["MemorySwap"]),
        "networks": {"execution-private": ({"ipv4_address": OPT["edge_ip"]} if "edge_ip" in OPT else None)},
        "pids_limit": host["PidsLimit"],
        "ports": [{"host_ip": EDGE_HOST_BIND[0], "mode": "ingress", "protocol": "tcp", "published": EDGE_HOST_BIND[1], "target": 8443}],
        "pull_policy": "never",
        "read_only": host["ReadonlyRootfs"],
        "restart": host["RestartPolicy"]["Name"],
        "security_opt": host["SecurityOpt"],
        "shm_size": str(host["ShmSize"]),
        "stop_grace_period": f"{cfg['StopTimeout']}s",
        "tmpfs": [f"{path}:{opts}" for path, opts in host["Tmpfs"].items()],
        "ulimits": {ulimit["Name"]: {"soft": ulimit["Soft"], "hard": ulimit["Hard"]}},
        "user": cfg["User"],
        "volumes": [
            {"type": "bind", "source": SHARED_EDGE_DIR, "target": "/run/secrets", "read_only": True, "bind": {"create_host_path": False}},
            {"type": "bind", "source": f"{STATE}/manager-catalogue-release.json", "target": "/run/manager-release/catalogue.json", "read_only": True,
             "bind": {"create_host_path": False}},
        ],
    }
    if "network" in OPT:      # option b: the existing Paper bridge, never created or removed by this project
        networks = {"execution-private": {"external": True, "name": OPT["network"]}}
    else:
        networks = {"execution-private": {"driver": "bridge", "ipam": {"config": [{"subnet": NETWORK_SUBNET, "gateway": NETWORK_GATEWAY}]}}}
    return {"name": PROJECT, "networks": networks, "services": {OPT["service"]: service}}


def render_proxy(sbx_proxy: dict) -> dict:
    cfg, host = sbx_proxy["Config"], sbx_proxy["HostConfig"]
    health = cfg["Healthcheck"]
    service = {
        "cap_drop": host["CapDrop"],
        "command": cfg["Cmd"],
        "container_name": f"{PROJECT}-source-proxy-1",
        "cpus": host["NanoCpus"] / 1e9,
        "entrypoint": cfg["Entrypoint"],
        "group_add": list(host["GroupAdd"]),
        "healthcheck": {"test": health["Test"], "interval": f"{health['Interval'] // 10**9}s", "timeout": f"{health['Timeout'] // 10**9}s",
                        "start_period": f"{health['StartPeriod'] // 10**9}s", "retries": health["Retries"]},
        "image": cfg["Image"],
        "logging": {"driver": host["LogConfig"]["Type"], "options": host["LogConfig"]["Config"]},
        "mem_limit": str(host["Memory"]),
        "network_mode": "host",
        "pids_limit": host["PidsLimit"],
        "pull_policy": "never",
        "read_only": host["ReadonlyRootfs"],
        "restart": host["RestartPolicy"]["Name"],
        "security_opt": host["SecurityOpt"],
        "tmpfs": [f"{path}:{opts}" for path, opts in host["Tmpfs"].items()],
        "user": cfg["User"],
        "volumes": [
            {"type": "bind", "source": SHARED_PROXY_DIR, "target": "/run/secrets", "read_only": True, "bind": {"create_host_path": False}},
            {"type": "bind", "source": f"{SHARED_PROXY_DIR}/nginx.manager-okx.conf", "target": "/etc/nginx/nginx.conf", "read_only": True, "bind": {"create_host_path": False}},
            {"type": "bind", "source": f"{SHARED_PROXY_DIR}/manager-v2-locations-okx.conf", "target": "/run/secrets/manager-v2-locations.conf", "read_only": True,
             "bind": {"create_host_path": False}},
        ],
    }
    return {"name": PROJECT, "services": {"source-proxy": service}}


def render_nginx() -> bytes:
    """The repo template rendered as `manager-profile-read` (same substitutions as scripts/execution-d2-render-source-proxy.sh), with the certificate names of the chosen option and WITHOUT
    the seven Trading-System `/v1/*` locations: the OKX proxy carries only the Manager read routes (health, the included Manager locations, `location / { return 404; }`). The Paper file
    keeps those locations behind `return 503` but still loads `trading-system-read-header.conf` at start; the OKX file never references that credential include."""
    import re
    text = (HERE / "templates" / "nginx.conf.template").read_text()
    for key, value in (("__PORTAL_BRIDGE_GATEWAY_IP__", NETWORK_GATEWAY), ("__SOURCE_PROXY_PRIVATE_PORT__", PROXY_PORT), ("__PUBLIC_PROBE_GUARD__", "return 503;"),
                       ("__ALPHA_READ_GUARD__", "return 503;"), ("__MANAGER_READ_INCLUDE__", "include /run/secrets/manager-v2-locations.conf;")):
        text = text.replace(key, value)
    for old, new in (("/run/secrets/source-proxy-server.crt", "/run/secrets/" + SERVER_CERT), ("/run/secrets/source-proxy-server.key", "/run/secrets/" + SERVER_KEY)):
        assert text.count(old) == 1
        text = text.replace(old, new)
    start = text.index("        # Public-at-source compatibility probes")
    end = text.index("        location / {")
    text = text[:start] + text[end:]
    assert not re.search(r"__[A-Z0-9_]+__", text), "unresolved placeholder"
    assert "trading-system-read-header" not in text and "/v1/" not in text and "127.0.0.1:8000" not in text
    return text.encode()


def render_locations() -> bytes:
    text = (HERE / "templates" / "manager-v2-locations.conf.template").read_text()
    text = text.replace("127.0.0.1:8023", f"127.0.0.1:{FACADE_PORT}").replace("127.0.0.1:8024/internal/issue", f"127.0.0.1:{ISSUER_PORT}/internal/issue")
    import re
    assert not re.search(r"__[A-Z0-9_]+__", text) and "8023" not in text and "8024" not in text
    return text.encode()


def render_all(image: str) -> dict:
    return {
        "edge-okx.compose.json": dump(render_edge(inspect(PAPER_EDGE), inspect(LIVE_EDGE), "localhost/portal-execution-edge@" + image if image != PLACEHOLDER else PLACEHOLDER)),
        "proxy-okx.compose.json": dump(render_proxy(inspect(SBX_PROXY))),
        "nginx.manager-okx.conf": render_nginx(),
        "manager-v2-locations-okx.conf": render_locations(),
    }


def main(argv):
    if len(argv) < 4 or argv[1] not in ("render", "check") or argv[2] != "--out":
        print(__doc__)
        return 64
    out, image, rest = Path(argv[3]), PLACEHOLDER, argv[4:]
    while rest:
        if rest[0] == "--option" and len(rest) >= 2 and rest[1] in OPTIONS:
            use_option(rest[1]); rest = rest[2:]
        elif rest[0] == "--image" and len(rest) >= 2:
            image = rest[1]; assert image.startswith("sha256:") and len(image) == 71; rest = rest[2:]
        else:
            print(__doc__)
            return 64
    files = render_all(image)
    if argv[1] == "render":
        out.mkdir(mode=0o700, parents=True, exist_ok=True)
        table = ""
        for name, data in files.items():
            fd = os.open(out / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            table += f"{sha(data)}  {name}\n"
        fd = os.open(out / "RENDER.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(table)
        print(table, end="")
        return 0
    expected = dict(line.split("  ", 1)[::-1] for line in (out / "RENDER.sha256").read_text().splitlines())
    bad = [n for n, d in files.items() if expected.get(n) != sha(d)]
    if bad:
        print("DRIFT:", bad)
        return 1
    print("render matches", out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
