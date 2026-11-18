#!/usr/bin/env python3
"""DRAFT, NOT RUN. Render, drift-check and stage the OKX Paper Manager (facade + issuer) from `docker inspect` of the running Paper containers (read-only) and the committed catalogue package.

Profile: PAPER_OKX_SWAP (mode paper, venue OKX, database trading_system), new compose project `trading-system-manager-read-paper-okx`, loopback ports 8323 (facade) and 8324 (issuer).
Never prints secret content, DSN parts or host paths of secrets; prints names and sha256 prefixes only. Nothing under /home/bobby/secure or /srv/primus is created by `render`/`check`.

Sub-commands:
  render --out DIR        write manager-paper-okx.rendered.json and RENDER.sha256 (0600, never overwrites). DIR is chosen by the caller (the worktree or a state dir), NOT the secret dir.
  check  --out DIR        re-render in memory and compare with DIR/RENDER.sha256 (drift detector: the Paper containers it is derived from changed or not).
  secrets --sec DIR       [HOST STEP, owner approval, never run by the author] create DIR (0700) if absent and copy, only if absent and with mode 0600, the files the new containers mount, BY NAME,
                          from the mounts of the running Paper Manager and Paper issuer containers; generate a NEW cursor.key; write the two runtime env files with ONLY the profile keys changed;
                          copy the catalogue and serving policy from the committed package after verifying their sha256. facade-db.dsn is a byte copy of the Paper one (same login, same database).
  dsn --sec DIR           shape check of facade-db.dsn (no part printed)
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

PAPER_MANAGER = "portal-manager-read-paper-v2-portal_manager_read-1"
PAPER_ISSUER = "portal-manager-read-paper-v2-portal_manager_issuer-1"
PROJECT = "trading-system-manager-read-paper-okx"
SEC = "/home/bobby/secure/portal-manager-paper-okx-20261118"          # NOT created by this draft until `secrets` is approved and run
HERE = Path(__file__).resolve().parent
PACKAGE = HERE / "artifacts" / "paper-okx-swap"
MANAGER_IMAGE = "localhost/portal-manager-read@sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd"   # facade; the issuer image is a decision, see ISSUER_IMAGE
ISSUER_IMAGE = MANAGER_IMAGE            # owner choice: the Paper issuer runs sha256:28ea3958... today; 8d4765a4 carries the same manager_issuer module (import checked offline), one image to roll
PROFILE_ID, PROFILE_MODE, PROFILE_VENUE = "PAPER_OKX_SWAP", "paper", "OKX"
FACADE_PORT, ISSUER_PORT = "8323", "8324"
SEAL = "14bb84b495bca93807486b4edac1f9fb45488485ee6e80842970a4848312eb29"
PACKAGE_SHA256 = {
    "relation-catalogue.json": "6c89a03abb44c8c7bd90cc59ecae17ab4a72a2238f9528d7ba8fb6ad0f485d1a",
    "serving-policy.json": "ac8b1478027a090bc0c8b8512bc70cffdaa8dfca8c133586edee1ef7f7509ed1",
    "profile-selection.json": "b61876234af3b0dc270bad80d33ccf95e03b8d721a95b6ef471a87dc9a00f1dc",
    "manager-catalogue-release.json": "8fd7bdf8d1cc36a50077b7e5565c58ba6886a03f76680c48640c00a9f97d6f82",
}
# S1 source incarnation: formula of stage_m0_release.py:83-90 (verified to reproduce the Paper value f9764913... from the 12 Nov catalogue seal 6d4c4a65...), Paper literals for the cluster,
# database oid, reset bundle and contract pins, the OKX catalogue seal. Only format-checked by the Manager and used as the snapshot fence identity.
S1_DESCRIPTOR = {
    "schema_version": "portal.execution.m0-source-incarnation.v1",
    "system_identifier": "7674585245102796834",
    "database": "trading_system",
    "database_oid": 74352923,
    "reset_bundle_sha256": "704a3f72382a9cda44cf777dba2793446124648e23d7905afc670f7b77530bb6",
    "source_contract_sha256": "81a3c3282875522d65cef53b68f346549ebe208a548ba45b7df2fbed76a32844",
    "catalogue_sha256": SEAL,
}
S1_ENV_KEY = "TS_PORTAL_MANAGER_S1_SOURCE_ID"
PROFILE_KEYS = {"TS_PORTAL_MANAGER_READ_PROFILE_ID": PROFILE_ID, "TS_PORTAL_MANAGER_READ_PROFILE_VENUE": PROFILE_VENUE}   # the ONLY env keys that differ from the Paper BINANCE Manager
FACADE_FILES = {   # destination in the container -> (file name in SEC, where it is copied from: container, destination of the mount in that container)
    "/run/secrets/manager-runtime.env": ("facade-runtime.env", None),
    "/run/secrets/facade-db.dsn": ("facade-db.dsn", (PAPER_MANAGER, "/run/secrets/facade-db.dsn")),
    "/run/secrets/relation-catalogue.json": ("relation-catalogue.json", None),
    "/run/secrets/serving-policy.json": ("serving-policy.json", None),
    "/run/secrets/cursor.key": ("cursor.key", None),                                    # NEW (generated), see secrets
    "/run/secrets/jwt-jwks.json": ("jwt-jwks.json", (PAPER_MANAGER, "/run/secrets/jwt-jwks.json")),
    "/run/secrets/revocations.json": ("revocations.json", (PAPER_MANAGER, "/run/secrets/revocations.json")),
    "/run/secrets/server-cert.pem": ("server-cert.pem", (PAPER_MANAGER, "/run/secrets/server-cert.pem")),
    "/run/secrets/server-key.pem": ("server-key.pem", (PAPER_MANAGER, "/run/secrets/server-key.pem")),
    "/run/secrets/mtls-ca-cert.pem": ("mtls-ca-cert.pem", (PAPER_MANAGER, "/run/secrets/mtls-ca-cert.pem")),
    "/run/secrets/ts-postgres-ca.crt": ("ts-postgres-ca.crt", (PAPER_MANAGER, "/run/secrets/ts-postgres-ca.crt")),
}
ISSUER_FILES = {
    "/run/secrets/manager-runtime.env": ("issuer-runtime.env", None),
    "/run/secrets/mtls-ca-cert.pem": ("mtls-ca-cert.pem", (PAPER_ISSUER, "/run/secrets/mtls-ca-cert.pem")),
    "/run/secrets/jwt-jwks.json": ("jwt-jwks.json", (PAPER_ISSUER, "/run/secrets/jwt-jwks.json")),
    "/run/secrets/revocations.json": ("revocations.json", (PAPER_ISSUER, "/run/secrets/revocations.json")),
    "/run/secrets/issuer-server-cert.pem": ("issuer-server-cert.pem", (PAPER_ISSUER, "/run/secrets/issuer-server-cert.pem")),
    "/run/secrets/issuer-server-key.pem": ("issuer-server-key.pem", (PAPER_ISSUER, "/run/secrets/issuer-server-key.pem")),
    "/run/secrets/jwt-ed25519-private.pem": ("jwt-ed25519-private.pem", (PAPER_ISSUER, "/run/secrets/jwt-ed25519-private.pem")),
}
BASE_ENV_NAMES = ("PYTHONDONTWRITEBYTECODE", "PYTHONPATH", "PYTHONUNBUFFERED")


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inspect(name: str) -> dict:
    return json.loads(subprocess.check_output(["docker", "inspect", name]))[0]


def mount_source(container: dict, destination: str) -> str:
    return next(m["Source"] for m in container["Mounts"] if m["Destination"] == destination)


def s1_source_id() -> str:
    return "sha256:" + sha(canonical(S1_DESCRIPTOR))


def _service(container: dict, image: str, runtime_env_key: str, port: str, files: dict, extra_env: dict, limits: bool) -> dict:
    own = dict(item.split("=", 1) for item in container["Config"]["Env"])
    env = {name: own[name] for name in (*BASE_ENV_NAMES, runtime_env_key)}
    env.update(extra_env)
    host = container["HostConfig"]
    (binding,) = host["PortBindings"][next(iter(host["PortBindings"]))]
    service = {
        "cap_drop": host["CapDrop"],
        "command": container["Config"]["Cmd"],
        "environment": dict(sorted(env.items())),
        "image": image,
        "logging": {"driver": host["LogConfig"]["Type"], "options": host["LogConfig"]["Config"]},
        "networks": {"executor_network": None},
        "ports": [{"host_ip": binding["HostIp"], "mode": "ingress", "protocol": "tcp", "published": port, "target": int(next(iter(host["PortBindings"])).split("/")[0])}],
        "read_only": host["ReadonlyRootfs"],
        "restart": host["RestartPolicy"]["Name"],
        "security_opt": host["SecurityOpt"],
        "tmpfs": [f"{path}:{opts}" for path, opts in host["Tmpfs"].items()],
        "user": container["Config"]["User"],
        "volumes": [{"type": "bind", "source": f"{SEC}/{name}", "target": dest, "read_only": True, "bind": {"create_host_path": False}} for dest, (name, _) in files.items()],
    }
    if limits:   # the Paper facade carries cpus 0.5 / 512 MiB / 128 pids; the Paper issuer carries none: same here
        service.update(cpus=host["NanoCpus"] / 1e9, mem_limit=str(host["Memory"]), pids_limit=host["PidsLimit"])
    return service


def render(facade: dict, issuer: dict) -> dict:
    extra = {name for name in dict(item.split("=", 1) for item in facade["Config"]["Env"]) if name.startswith("TS_PORTAL_MANAGER_S1")} - {S1_ENV_KEY}
    if extra:
        raise SystemExit(f"STOP: the Paper Manager has S1 env keys this draft does not know: {sorted(extra)}")
    return {
        "name": PROJECT,
        "networks": {"executor_network": {"external": True, "name": "executor_network"}},
        "services": {
            "portal_manager_issuer": _service(issuer, ISSUER_IMAGE, "TS_PORTAL_MANAGER_ISSUER_RUNTIME_ENV_FILE", ISSUER_PORT, ISSUER_FILES, {}, False),
            "portal_manager_read": _service(facade, MANAGER_IMAGE, "TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE", FACADE_PORT, FACADE_FILES, {S1_ENV_KEY: s1_source_id()}, True),
        },
    }


def _dump(value: dict) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def render_all() -> dict[str, bytes]:
    return {"manager-paper-okx.rendered.json": _dump(render(inspect(PAPER_MANAGER), inspect(PAPER_ISSUER)))}


def write_new(path: Path, data: bytes, mode: int) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)


def cmd_render(out: Path) -> None:
    out.mkdir(mode=0o700, parents=True, exist_ok=True)
    table = ""
    for name, data in render_all().items():
        write_new(out / name, data, 0o600)
        table += f"{sha(data)}  {name}\n"
    write_new(out / "RENDER.sha256", table.encode(), 0o600)
    print(table, end="")


def cmd_check(out: Path) -> None:
    expected = dict(line.split("  ", 1)[::-1] for line in (out / "RENDER.sha256").read_text().splitlines())
    bad = [name for name, data in render_all().items() if expected.get(name) != sha(data)]
    if bad:
        raise SystemExit(f"DRIFT: the running Paper containers no longer render to {bad}")
    print("render matches", out)


def env_with(text: str, changes: dict[str, str]) -> bytes:
    """The Paper runtime env with ONLY the given keys changed; each key must exist exactly once."""
    lines, seen = [], set()
    for line in text.splitlines(keepends=True):
        key = line.split("=", 1)[0]
        if key in changes:
            line, seen = f"{key}={changes[key]}\n", seen | {key}
        lines.append(line)
    if seen != set(changes):
        raise SystemExit(f"STOP: the Paper runtime env does not carry exactly the keys {sorted(changes)}")
    return "".join(lines).encode()


def cmd_secrets(sec: Path) -> None:
    containers = {PAPER_MANAGER: inspect(PAPER_MANAGER), PAPER_ISSUER: inspect(PAPER_ISSUER)}
    if not sec.exists():
        sec.mkdir(mode=0o700, parents=True)
    from cryptography.fernet import Fernet

    def put(name: str, data: bytes, note: str) -> None:
        target = sec / name
        if target.exists():
            print(f"keep   {name} (exists, not touched)")
            return
        write_new(target, data, 0o600)
        print(f"wrote  {name} sha256={sha(data)[:12]} ({note})")

    copied: set[str] = set()
    for files in (FACADE_FILES, ISSUER_FILES):
        for dest, (name, origin) in files.items():
            if origin is None or name in copied:
                continue
            container, mount = origin
            put(name, Path(mount_source(containers[container], mount)).read_bytes(), "byte copy of the Paper mount")
            copied.add(name)
    for name in PACKAGE_SHA256:
        if name == "manager-catalogue-release.json" or name == "profile-selection.json":
            continue
        data = (PACKAGE / name).read_bytes()
        if sha(data) != PACKAGE_SHA256[name]:
            raise SystemExit(f"STOP: {name} differs from the approved package hash")
        put(name, data, "committed package, hash checked")
    put("cursor.key", Fernet.generate_key(), "NEW key, never the Paper one")
    facade_env = Path(mount_source(containers[PAPER_MANAGER], "/run/secrets/manager-runtime.env")).read_text()
    issuer_env = Path(mount_source(containers[PAPER_ISSUER], "/run/secrets/manager-runtime.env")).read_text()
    put("facade-runtime.env", env_with(facade_env, PROFILE_KEYS), "Paper env, profile id and venue changed")
    put("issuer-runtime.env", env_with(issuer_env, {**PROFILE_KEYS}), "Paper issuer env, profile id and venue changed")
    for path in sorted(sec.iterdir()):
        if stat.S_IMODE(path.stat().st_mode) != 0o600:
            raise SystemExit(f"STOP: {path.name} has mode {oct(stat.S_IMODE(path.stat().st_mode))}, expected 0o600")


def cmd_dsn(sec: Path) -> None:
    from urllib.parse import parse_qsl, urlsplit

    url = urlsplit((sec / "facade-db.dsn").read_text().strip())
    query = dict(parse_qsl(url.query))
    checks = {
        "scheme postgresql": url.scheme in {"postgres", "postgresql"},
        "host live_data_executor:5432": url.hostname == "live_data_executor" and url.port in (None, 5432),
        "database trading_system": url.path == "/trading_system",
        "login ts_portal_manager_read_facade": url.username == "ts_portal_manager_read_facade",
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
    if len(args) != 3 or args[0] not in {"render", "check", "secrets", "dsn"} or args[1] not in {"--out", "--sec"}:
        raise SystemExit(__doc__)
    {"render": cmd_render, "check": cmd_check, "secrets": cmd_secrets, "dsn": cmd_dsn}[args[0]](Path(args[2]))


if __name__ == "__main__":
    main()
