#!/usr/bin/env python3
"""DRAFT, NOT RUN. Render the compose files the Sandbox switch needs, from `docker inspect` of the running containers (read-only) and the Paper rendered file.

Sub-commands (never prints secret content, host paths of secrets or DSN parts; prints names and sha256 prefixes only):
  render --out DIR      write manager-sandbox.rendered.json, edge-sandbox.rendered.json, override-edge-memo-on.yaml, the two rollback renders of the CURRENT state, RENDER.sha256 (all 0600, never overwrites)
  secrets --sec DIR     create DIR (0700) if absent and copy, only if absent and with mode 0600, the secret/config files of the CURRENT Sandbox Manager mounts into it
                        (JWKS, revocations, server cert/key, mTLS CA, cursor key), the Postgres CA from the Paper Manager mount, and a runtime env with ONE key changed
                        (TS_PORTAL_MANAGER_READ_DB_CONNECTION_LIMIT 4 -> 2). facade-db.dsn is never written or overwritten (the DB step creates it); catalogue and policy come from
                        the committed package via sandbox_switch_step.sh stage.
  check --out DIR [--only manager|edge] [--live]
                        re-render in memory and compare with DIR/RENDER.sha256 (drift detector: images, env, mounts of the running containers changed or not).
                        --only X inspects ONLY the containers that group is derived from (manager: Sandbox Manager + Paper Manager reference; edge: Sandbox Edge + Live Edge reference);
                        the other group is never inspected, so its state cannot break the check. --live: the container is already on its post-switch state; the rollback renders
                        (which describe the PRE-switch container) are not compared and the Manager's own S1 source id env is accepted. Overlay state of the Edge (catalogue memo
                        TTL, the two source-DB pin variables) never counts as drift: it is delivered by override files, not by the base render.
  dsn --sec DIR         shape check of facade-db.dsn (no part printed)
Inputs it reads: docker inspect of the Sandbox Manager, Sandbox Edge and Paper Manager containers; nothing else is read except the files it copies in `secrets`.
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

SBX_MANAGER = "trading-system-manager-read-sandbox-portal_manager_read-1"
SBX_EDGE = "portal-execution-edge-sandbox-execution-edge-1"
PAPER_MANAGER = "portal-manager-read-paper-v2-portal_manager_read-1"
LIVE_EDGE = "portal-execution-edge-live-execution-edge-1"   # same compose lineage: reference for cpu_shares / mem_reservation of an Edge with a 2 GiB limit
SEC = "/home/bobby/secure/portal-manager-sandbox-20261116"
STAGE = "/home/bobby/.local/state/portal-execution-edge/releases/sandbox-switch-20261116"
NEW_MANAGER_IMAGE = "localhost/portal-manager-read@sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd"
NEW_EDGE_IMAGE = "localhost/portal-execution-edge@sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054"
RELEASE_SHA = "sha256:14778175eb6720c8b56ae0dd245023e2aff2e1afb161edb0ef6f32872699a1a5"
SEAL = "3852c844e7d06f70317bd54e53776081213d82569c6d203f78f05caa5bda15df"
# S1 source incarnation, formula of stage_m0_release.py:83-90 with the Sandbox database; the reset bundle and contract pins are the Paper literals (not defined for the Sandbox:
# owner decision D13). The value is only format-checked by the Manager and used as the snapshot fence identity.
S1_DESCRIPTOR = {
    "schema_version": "portal.execution.m0-source-incarnation.v1",
    "system_identifier": "7674585245102796834",
    "database": "trading_system_sandbox",
    "database_oid": 75754038,
    "reset_bundle_sha256": "704a3f72382a9cda44cf777dba2793446124648e23d7905afc670f7b77530bb6",
    "source_contract_sha256": "81a3c3282875522d65cef53b68f346549ebe208a548ba45b7df2fbed76a32844",
    "catalogue_sha256": SEAL,
}
CONNECTION_LIMIT_KEY = "TS_PORTAL_MANAGER_READ_DB_CONNECTION_LIMIT"
S1_ENV_KEY = "TS_PORTAL_MANAGER_S1_SOURCE_ID"
OVERLAY_ENV_KEYS = ("EDGE_MANAGER_SOURCE_DB_PIN_FILE", "EDGE_MANAGER_SOURCE_DB_PIN_SHA256")   # delivered by override-sandbox-guard-pin-on.yaml, not by the base render
MANAGER_FILES = {  # destination in the container -> file name in SEC
    "/run/secrets/manager-runtime.env": "facade-runtime.env",
    "/run/secrets/facade-db.dsn": "facade-db.dsn",
    "/run/secrets/relation-catalogue.json": "relation-catalogue.json",
    "/run/secrets/serving-policy.json": "serving-policy.json",
    "/run/secrets/cursor.key": "cursor.key",
    "/run/secrets/jwt-jwks.json": "jwt-jwks.json",
    "/run/secrets/revocations.json": "revocations.json",
    "/run/secrets/server-cert.pem": "server-cert.pem",
    "/run/secrets/server-key.pem": "server-key.pem",
    "/run/secrets/mtls-ca-cert.pem": "mtls-ca-cert.pem",
    "/run/secrets/ts-postgres-ca.crt": "ts-postgres-ca.crt",
}


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inspect(name: str) -> dict:
    return json.loads(subprocess.check_output(["docker", "inspect", name]))[0]


def image_env(ref: str) -> dict[str, str]:
    data = json.loads(subprocess.check_output(["docker", "image", "inspect", ref]))[0]
    return dict(item.split("=", 1) for item in data["Config"]["Env"])


def compose_env(container: dict) -> dict[str, str]:
    """Env set by compose = container env minus what the image itself defines."""
    base = image_env(container["Image"])
    env = dict(item.split("=", 1) for item in container["Config"]["Env"])
    return {k: v for k, v in env.items() if base.get(k) != v}


def mount_source(container: dict, destination: str) -> str:
    return next(m["Source"] for m in container["Mounts"] if m["Destination"] == destination)


def render_manager(sbx: dict, paper: dict, live: bool = False) -> dict:
    own = dict(item.split("=", 1) for item in sbx["Config"]["Env"])
    names = ("PYTHONDONTWRITEBYTECODE", "PYTHONPATH", "PYTHONUNBUFFERED", "TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE")   # the four Paper's rendered file sets explicitly
    extra = set(compose_env(sbx)) - set(names) - ({S1_ENV_KEY} if live else set())
    if extra:
        raise SystemExit(f"STOP: the Sandbox Manager has compose-set env beyond the four known names: {sorted(extra)}")
    env = {name: own[name] for name in names}
    env[S1_ENV_KEY] = "sha256:" + sha(canonical(S1_DESCRIPTOR))
    host = sbx["HostConfig"]
    paper_host = paper["HostConfig"]
    (port,) = host["PortBindings"]["8023/tcp"]
    service = {
        "cap_drop": host["CapDrop"],
        "command": ["python", "/opt/manager-s1/manager_s1.py"],   # Paper's S1 entrypoint (inspect of the Paper container)
        "cpus": paper_host["NanoCpus"] / 1e9,                      # Paper limits (the old Sandbox container had none): decision, see the doc
        "environment": dict(sorted(env.items())),
        "image": NEW_MANAGER_IMAGE,
        "logging": {"driver": host["LogConfig"]["Type"], "options": host["LogConfig"]["Config"]},
        "mem_limit": str(paper_host["Memory"]),
        "networks": {"executor_network": None},
        "pids_limit": paper_host["PidsLimit"],
        "ports": [{"host_ip": port["HostIp"], "mode": "ingress", "protocol": "tcp", "published": port["HostPort"], "target": 8023}],
        "read_only": host["ReadonlyRootfs"],
        "restart": host["RestartPolicy"]["Name"],
        "security_opt": host["SecurityOpt"],
        "tmpfs": [f"{path}:{opts}" for path, opts in host["Tmpfs"].items()],
        "user": sbx["Config"]["User"],
        "volumes": [
            {"type": "bind", "source": f"{SEC}/{name}", "target": dest, "read_only": True, "bind": {"create_host_path": False}}
            for dest, name in MANAGER_FILES.items()
        ],
    }
    return {
        "name": "trading-system-manager-read-sandbox",
        "networks": {"executor_network": {"external": True, "name": "executor_network"}},
        "services": {"portal_manager_read": service},
    }


def render_edge(edge: dict, reference: dict, current: bool = False) -> dict:
    """Service execution-edge of project portal-execution-edge-sandbox, from the running container (the 7 compose files under /srv/... are not readable by this user)."""
    cfg, host = edge["Config"], edge["HostConfig"]
    ref = reference["HostConfig"]
    # group_add: the original container carries a supplementary group that gives read access to the secrets directory (a first render without it crash-looped
    # the Edge with "Permission denied"); cpu_shares and mem_reservation are soft limits of the compose lineage, taken from the reference Edge when the container has none.
    group_add = host.get("GroupAdd") or ref.get("GroupAdd")
    if not group_add:
        raise SystemExit("STOP: no supplementary group found for the Edge (the secrets directory would be unreadable)")
    env = {k: v for k, v in compose_env(edge).items() if k not in OVERLAY_ENV_KEYS}
    if not current:
        env["EDGE_MANAGER_CATALOGUE_RELEASE_FILE"] = "/run/manager-release/catalogue.json"
        env["EDGE_MANAGER_CATALOGUE_RELEASE_SHA256"] = RELEASE_SHA
        env["EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS"] = "0"      # memo OFF at first (one change at a time); override-edge-memo-on.yaml turns it on
    (port,) = host["PortBindings"]["8443/tcp"]
    health = cfg["Healthcheck"]
    network = host["NetworkMode"]
    ulimit = host["Ulimits"][0]
    service = {
        "cap_drop": host["CapDrop"],
        "command": cfg["Cmd"],
        "cpu_shares": host["CpuShares"] or ref["CpuShares"],
        "cpus": host["NanoCpus"] / 1e9,
        "entrypoint": cfg["Entrypoint"],
        "group_add": list(group_add),
        "environment": dict(sorted(env.items())),
        "healthcheck": {
            "test": health["Test"], "interval": f"{health['Interval'] // 10**9}s", "timeout": f"{health['Timeout'] // 10**9}s",
            "start_period": f"{health['StartPeriod'] // 10**9}s", "retries": health["Retries"],
        },
        "image": cfg["Image"] if current else NEW_EDGE_IMAGE,
        "init": host["Init"],
        "logging": {"driver": host["LogConfig"]["Type"], "options": host["LogConfig"]["Config"]},
        "mem_limit": str(host["Memory"]),
        "mem_reservation": str(host["MemoryReservation"] or ref["MemoryReservation"]),
        "memswap_limit": str(host["MemorySwap"]),
        "networks": {"execution-private": None},
        "pids_limit": host["PidsLimit"],
        "ports": [{"host_ip": port["HostIp"], "mode": "ingress", "protocol": "tcp", "published": port["HostPort"], "target": 8443}],
        "read_only": host["ReadonlyRootfs"],
        "restart": host["RestartPolicy"]["Name"],
        "security_opt": host["SecurityOpt"],
        "shm_size": str(host["ShmSize"]),
        "stop_grace_period": f"{cfg['StopTimeout']}s",
        "tmpfs": [f"{path}:{opts}" for path, opts in host["Tmpfs"].items()],
        "ulimits": {ulimit["Name"]: {"soft": ulimit["Soft"], "hard": ulimit["Hard"]}},
        "user": cfg["User"],
        "volumes": [
            {"type": "bind", "source": mount_source(edge, "/run/secrets"), "target": "/run/secrets", "read_only": True, "bind": {"create_host_path": False}},
        ] + ([] if current else [
            {"type": "bind", "source": f"{STAGE}/manager-catalogue-release.json", "target": "/run/manager-release/catalogue.json", "read_only": True,
             "bind": {"create_host_path": False}},
        ]),
    }
    return {
        "name": "portal-execution-edge-sandbox",
        "networks": {"execution-private": {"external": True, "name": network}},
        "services": {"execution-edge": service},
    }


def render_manager_rollback(sbx: dict) -> dict:
    """The CURRENT Sandbox Manager state (image 0bd48db3, command, env, the current mount sources, no limits), for the rollback."""
    own = dict(item.split("=", 1) for item in sbx["Config"]["Env"])
    names = ("PYTHONDONTWRITEBYTECODE", "PYTHONPATH", "PYTHONUNBUFFERED", "TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE")
    host = sbx["HostConfig"]
    (port,) = host["PortBindings"]["8023/tcp"]
    service = {
        "cap_drop": host["CapDrop"],
        "command": sbx["Config"]["Cmd"],
        "environment": {name: own[name] for name in names},
        "image": sbx["Config"]["Image"],
        "logging": {"driver": host["LogConfig"]["Type"], "options": host["LogConfig"]["Config"]},
        "networks": {"executor_network": None},
        "ports": [{"host_ip": port["HostIp"], "mode": "ingress", "protocol": "tcp", "published": port["HostPort"], "target": 8023}],
        "read_only": host["ReadonlyRootfs"],
        "restart": host["RestartPolicy"]["Name"],
        "security_opt": host["SecurityOpt"],
        "tmpfs": [f"{path}:{opts}" for path, opts in host["Tmpfs"].items()],
        "user": sbx["Config"]["User"],
        "volumes": [
            {"type": "bind", "source": m["Source"], "target": m["Destination"], "read_only": True, "bind": {"create_host_path": False}}
            for m in sorted(sbx["Mounts"], key=lambda item: item["Destination"])
        ],
    }
    return {
        "name": "trading-system-manager-read-sandbox",
        "networks": {"executor_network": {"external": True, "name": "executor_network"}},
        "services": {"portal_manager_read": service},
    }


MEMO_ON = """# Sandbox Edge: catalogue memo ON (30 s). Stacked after edge-sandbox.rendered.json; the only change is this value.
services:
  execution-edge:
    environment:
      EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS: "30000"
"""


GROUP_FILES = {
    "manager": ("manager-sandbox.rendered.json", "manager-sandbox.rollback.rendered.json"),
    "edge": ("edge-sandbox.rendered.json", "override-edge-memo-on.yaml", "edge-sandbox.rollback.rendered.json"),
}
ROLLBACK_FILES = {"manager-sandbox.rollback.rendered.json", "edge-sandbox.rollback.rendered.json"}


def _dump(value: dict) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def render_group(group: str, live: bool = False) -> dict[str, bytes]:
    """Render only the files of one group; inspects only that group's containers."""
    if group == "manager":
        sbx, paper = inspect(SBX_MANAGER), inspect(PAPER_MANAGER)
        return {
            "manager-sandbox.rendered.json": _dump(render_manager(sbx, paper, live)),
            "manager-sandbox.rollback.rendered.json": _dump(render_manager_rollback(sbx)),
        }
    if group == "edge":
        edge, live_edge = inspect(SBX_EDGE), inspect(LIVE_EDGE)
        return {
            "edge-sandbox.rendered.json": _dump(render_edge(edge, live_edge)),
            "override-edge-memo-on.yaml": MEMO_ON.encode(),
            "edge-sandbox.rollback.rendered.json": _dump(render_edge(edge, live_edge, current=True)),
        }
    raise SystemExit(f"unknown group {group!r}")


def render_all(only: str = "", live: bool = False) -> dict[str, bytes]:
    groups = [only] if only else ["manager", "edge"]
    files: dict[str, bytes] = {}
    for group in groups:
        files.update(render_group(group, live))
    order = [name for names in GROUP_FILES.values() for name in names]
    return {name: files[name] for name in sorted(files, key=order.index)}


def write_new(path: Path, data: bytes, mode: int) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)


def cmd_render(out: Path) -> None:
    out.mkdir(mode=0o700, parents=True, exist_ok=True)
    files = render_all()
    table = ""
    for name, data in files.items():
        write_new(out / name, data, 0o600)
        table += f"{sha(data)}  {name}\n"
    write_new(out / "RENDER.sha256", table.encode(), 0o600)
    print(table, end="")


def cmd_check(out: Path, only: str = "", live: bool = False) -> None:
    """--only manager|edge renders and compares just the files derived from that container (the other one has changed by design after its own step).
    --live skips the rollback renders (they describe the pre-switch container) for a container that is already on its post-switch state."""
    if only and only not in GROUP_FILES:
        raise SystemExit("STOP: --only takes manager or edge")
    expected = dict(line.split("  ", 1)[::-1] for line in (out / "RENDER.sha256").read_text().splitlines())
    rendered = render_all(only, live)
    bad = [name for name, data in rendered.items() if not (live and name in ROLLBACK_FILES) and expected.get(name) != sha(data)]
    if bad:
        raise SystemExit(f"DRIFT: the running containers no longer render to {bad}")
    print("render matches", out, f"(only={only or 'all'} live={live})")


def cmd_secrets(sec: Path) -> None:
    sbx, paper = inspect(SBX_MANAGER), inspect(PAPER_MANAGER)
    if not sec.exists():
        sec.mkdir(mode=0o700, parents=True)
    plan = {
        "cursor.key": ("/run/secrets/cursor.key", sbx),
        "jwt-jwks.json": ("/run/secrets/jwt-jwks.json", sbx),
        "revocations.json": ("/run/secrets/revocations.json", sbx),
        "server-cert.pem": ("/run/secrets/server-cert.pem", sbx),
        "server-key.pem": ("/run/secrets/server-key.pem", sbx),
        "mtls-ca-cert.pem": ("/run/secrets/mtls-ca-cert.pem", sbx),
        "ts-postgres-ca.crt": ("/run/secrets/ts-postgres-ca.crt", paper),
    }
    for name, (dest, container) in plan.items():
        target = sec / name
        if target.exists():
            print(f"keep   {name} (exists, not touched)")
            continue
        data = Path(mount_source(container, dest)).read_bytes()
        write_new(target, data, 0o600)
        print(f"copied {name} sha256={sha(data)[:12]}")
    target = sec / "facade-runtime.env"
    if target.exists():
        print("keep   facade-runtime.env (exists, not touched)")
    else:
        lines = Path(mount_source(sbx, "/run/secrets/manager-runtime.env")).read_text().splitlines(keepends=True)
        out, changed = [], 0
        for line in lines:
            if line.startswith(CONNECTION_LIMIT_KEY + "="):
                line, changed = f"{CONNECTION_LIMIT_KEY}=2\n", changed + 1
            out.append(line)
        if changed != 1:
            raise SystemExit("STOP: the runtime env does not carry exactly one connection-limit key")
        data = "".join(out).encode()
        write_new(target, data, 0o600)
        print(f"copied facade-runtime.env sha256={sha(data)[:12]} (one key changed: {CONNECTION_LIMIT_KEY})")
    dsn = sec / "facade-db.dsn"
    print("present facade-db.dsn" if dsn.exists() else "MISSING facade-db.dsn (created by the DB step; this tool never writes it)")
    for path in sorted(sec.iterdir()):
        mode = stat.S_IMODE(path.stat().st_mode)
        if mode != 0o600:
            raise SystemExit(f"STOP: {path.name} has mode {oct(mode)}, expected 0o600")


def cmd_dsn(sec: Path) -> None:
    """Shape check of the DSN the DB step wrote (no part of it is printed)."""
    from urllib.parse import parse_qsl, urlsplit

    url = urlsplit((sec / "facade-db.dsn").read_text().strip())
    query = dict(parse_qsl(url.query))
    checks = {
        "scheme postgresql": url.scheme in {"postgres", "postgresql"},
        "host live_data_executor:5432": url.hostname == "live_data_executor" and url.port in (None, 5432),
        "database trading_system_sandbox": url.path == "/trading_system_sandbox",
        "login ts_portal_manager_read_sandbox_facade": url.username == "ts_portal_manager_read_sandbox_facade",
        "password present": bool(url.password),
        "sslmode verify-full": query.get("sslmode") == "verify-full",
        "sslrootcert /run/secrets/ts-postgres-ca.crt": query.get("sslrootcert") == "/run/secrets/ts-postgres-ca.crt",
        "mode 0600": stat.S_IMODE((sec / "facade-db.dsn").stat().st_mode) == 0o600,
    }
    for name, ok in checks.items():
        print(("ok   " if ok else "FAIL ") + name)
    if not all(checks.values()):
        raise SystemExit("STOP: the DSN does not have the expected shape")


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["check"] and len(args) >= 3 and args[1] == "--out":
        rest = args[3:]
        live = "--live" in rest
        rest = [a for a in rest if a != "--live"]
        if rest not in ([], ["--only", "manager"], ["--only", "edge"]):
            raise SystemExit(__doc__)
        cmd_check(Path(args[2]), rest[1] if rest else "", live)
        return
    if len(args) != 3 or args[0] not in {"render", "secrets", "dsn"} or args[1] not in {"--out", "--sec"}:
        raise SystemExit(__doc__)
    {"render": cmd_render, "secrets": cmd_secrets, "dsn": cmd_dsn}[args[0]](Path(args[2]))


if __name__ == "__main__":
    main()
