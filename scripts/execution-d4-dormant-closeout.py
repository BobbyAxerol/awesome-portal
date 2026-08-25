#!/usr/bin/env python3
"""Fail-closed lifecycle controller for the D4 qualification-only source path.

This host-side tool has deliberately narrow authority.  It may stop the D4
qualifier, recreate Portal's Source Proxy from the accepted D2 dark runtime,
and stop one explicitly named Trading System compatibility facade after its
Compose identity has been verified.  It never accesses Trading System data,
removes a database/volume, activates an epoch, or enables a business API.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Protocol


SCHEMA_VERSION = "portal.execution-d4.dormant-closeout.v1"
SOURCE_EVIDENCE_VERSION = "portal.execution-d4.source-idle-evidence.v1"
D4_PHASE_LABEL = "d4-paper-read-shadow"
PORTAL_SERVICE_ALLOWLIST = frozenset({"paper-read-qualifier", "source-proxy"})
PERMANENT_FALSE_KEYS = (
    "ACTIVATION_AUTHORIZED",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_TRADING_SYSTEM_CHANGES",
)
CONFIG_KEYS = frozenset(
    {
        "INPUT_VERSION",
        "OWNER_INPUT_FILE",
        "D2_ACCEPTED_RUNTIME_ENV_FILE",
        "PORTAL_COMPOSE_PROJECT",
        "SOURCE_FACADE_CONTAINER",
        "SOURCE_FACADE_COMPOSE_PROJECT",
        "SOURCE_FACADE_COMPOSE_SERVICE",
        "STATE_DIRECTORY",
        "SOURCE_SESSION_EVIDENCE_FILE",
        "POLL_INTERVAL_SECONDS",
        "START_DEADLINE_SECONDS",
        "STOP_TIMEOUT_SECONDS",
        "D2_HEALTH_TIMEOUT_SECONDS",
        "MIN_IDLE_OBSERVATION_SECONDS",
    }
)
SAFE_VALUE = re.compile(r"[A-Za-z0-9_./:@+-]+")
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}")


class CloseoutError(RuntimeError):
    """Stable fail-closed lifecycle rejection."""


@dataclass(frozen=True)
class Config:
    owner_input_file: pathlib.Path
    d2_runtime_env_file: pathlib.Path
    portal_project: str
    facade_container: str
    facade_project: str
    facade_service: str
    state_directory: pathlib.Path
    source_evidence_file: pathlib.Path
    poll_interval: int
    start_deadline: int
    stop_timeout: int
    health_timeout: int
    minimum_idle_observation: int


@dataclass(frozen=True)
class OwnerWindow:
    window_id: str
    authorized: bool
    start: datetime
    end: datetime
    owner_input_sha256: str

    def is_open(self, now: datetime) -> bool:
        return self.authorized and self.start <= now < self.end


@dataclass(frozen=True)
class Container:
    container_id: str
    name: str
    running: bool
    health: str
    labels: dict[str, str]

    @property
    def service(self) -> str:
        return self.labels.get("com.docker.compose.service", "")


class Host(Protocol):
    def portal_d4_containers(self, project: str) -> list[Container]: ...

    def facade(self, name: str) -> Container | None: ...

    def stop(self, container: Container, timeout: int) -> None: ...

    def remove_ephemeral(self, container: Container) -> None: ...

    def restore_d2_dark(self, config: Config) -> Container: ...

    def d2_source_proxy(self, project: str) -> Container: ...


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(raw: str) -> datetime:
    if not raw.endswith("Z"):
        raise CloseoutError("timestamp must use UTC Z form")
    try:
        value = datetime.fromisoformat(raw[:-1] + "+00:00")
    except ValueError as exc:
        raise CloseoutError("timestamp is malformed") from exc
    if value.utcoffset() != timedelta(0):
        raise CloseoutError("timestamp must be UTC")
    return value


def _sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def _parse_env(path: pathlib.Path, *, allowed: frozenset[str] | None = None) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise CloseoutError("required lifecycle input is unreadable") from exc
    values: dict[str, str] = {}
    for raw in lines:
        if not raw or raw.startswith("#"):
            continue
        if "=" not in raw:
            raise CloseoutError("lifecycle input contains a malformed line")
        key, value = raw.split("=", 1)
        if allowed is not None and key not in allowed:
            raise CloseoutError("lifecycle input contains an unknown key")
        if key in values:
            raise CloseoutError("lifecycle input contains a duplicate key")
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or (
            value and not SAFE_VALUE.fullmatch(value)
        ):
            raise CloseoutError("lifecycle input contains an unsafe value")
        values[key] = value
    return values


def _absolute_path(raw: str, key: str) -> pathlib.Path:
    path = pathlib.Path(raw)
    if not path.is_absolute() or ".." in path.parts:
        raise CloseoutError(f"{key} must be an absolute non-traversing path")
    return path


def _bounded_integer(values: dict[str, str], key: str, low: int, high: int) -> int:
    try:
        value = int(values[key])
    except (KeyError, ValueError) as exc:
        raise CloseoutError(f"{key} must be an integer") from exc
    if not low <= value <= high:
        raise CloseoutError(f"{key} is outside its safe bound")
    return value


def _require_private_file(path: pathlib.Path) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as exc:
        raise CloseoutError("private lifecycle input is missing") from exc
    if stat.S_ISLNK(mode) or not stat.S_ISREG(mode) or stat.S_IMODE(mode) != 0o600:
        raise CloseoutError("private lifecycle input must be a non-symlink mode-0600 file")


def load_config(path: pathlib.Path, *, template: bool = False) -> Config:
    values = _parse_env(path, allowed=CONFIG_KEYS)
    if values.keys() != CONFIG_KEYS:
        raise CloseoutError("dormant closeout config schema is incomplete")
    if values["INPUT_VERSION"] != SCHEMA_VERSION:
        raise CloseoutError("dormant closeout config version mismatch")
    for key in (
        "PORTAL_COMPOSE_PROJECT",
        "SOURCE_FACADE_CONTAINER",
        "SOURCE_FACADE_COMPOSE_PROJECT",
        "SOURCE_FACADE_COMPOSE_SERVICE",
    ):
        if not SAFE_ID.fullmatch(values[key]):
            raise CloseoutError(f"{key} is malformed")
    if values["PORTAL_COMPOSE_PROJECT"] != "portal-execution-edge":
        raise CloseoutError("Portal Compose project must remain portal-execution-edge")
    if values["SOURCE_FACADE_CONTAINER"] != "ts_d4_source_read-portal_paper_read-1":
        raise CloseoutError("source facade target differs from the accepted dedicated container")
    config = Config(
        owner_input_file=_absolute_path(values["OWNER_INPUT_FILE"], "OWNER_INPUT_FILE"),
        d2_runtime_env_file=_absolute_path(
            values["D2_ACCEPTED_RUNTIME_ENV_FILE"], "D2_ACCEPTED_RUNTIME_ENV_FILE"
        ),
        portal_project=values["PORTAL_COMPOSE_PROJECT"],
        facade_container=values["SOURCE_FACADE_CONTAINER"],
        facade_project=values["SOURCE_FACADE_COMPOSE_PROJECT"],
        facade_service=values["SOURCE_FACADE_COMPOSE_SERVICE"],
        state_directory=_absolute_path(values["STATE_DIRECTORY"], "STATE_DIRECTORY"),
        source_evidence_file=_absolute_path(
            values["SOURCE_SESSION_EVIDENCE_FILE"], "SOURCE_SESSION_EVIDENCE_FILE"
        ),
        poll_interval=_bounded_integer(values, "POLL_INTERVAL_SECONDS", 1, 60),
        start_deadline=_bounded_integer(values, "START_DEADLINE_SECONDS", 30, 1800),
        stop_timeout=_bounded_integer(values, "STOP_TIMEOUT_SECONDS", 5, 60),
        health_timeout=_bounded_integer(values, "D2_HEALTH_TIMEOUT_SECONDS", 15, 300),
        minimum_idle_observation=_bounded_integer(
            values, "MIN_IDLE_OBSERVATION_SECONDS", 30, 3600
        ),
    )
    if not template:
        _require_private_file(path)
        _require_private_file(config.owner_input_file)
        _require_private_file(config.d2_runtime_env_file)
    return config


def load_owner_window(config: Config) -> OwnerWindow:
    values = _parse_env(config.owner_input_file)
    required = {
        "INPUT_VERSION",
        "D4_AUTHORIZED",
        "D4_CHANGE_WINDOW_ID",
        "D4_CHANGE_WINDOW_START_UTC",
        "D4_CHANGE_WINDOW_END_UTC",
        "REGISTRY_DELIVERY_PROFILE",
        *PERMANENT_FALSE_KEYS,
    }
    if not required.issubset(values):
        raise CloseoutError("owner input lacks lifecycle safety fields")
    if values["INPUT_VERSION"] != "portal.execution-d4.owner-input.v2":
        raise CloseoutError("owner input version mismatch")
    if values["D4_AUTHORIZED"] not in {"true", "false"}:
        raise CloseoutError("D4_AUTHORIZED must be true or false")
    if values["REGISTRY_DELIVERY_PROFILE"] != "fixture":
        raise CloseoutError("D4 lifecycle forbids a non-fixture registry profile")
    for key in PERMANENT_FALSE_KEYS:
        if values[key] != "false":
            raise CloseoutError(f"{key} must remain false")
    start = _timestamp(values["D4_CHANGE_WINDOW_START_UTC"])
    end = _timestamp(values["D4_CHANGE_WINDOW_END_UTC"])
    if end <= start or end - start > timedelta(hours=2):
        raise CloseoutError("D4 owner window must be positive and no longer than two hours")
    if not re.fullmatch(r"d4-[a-z0-9][a-z0-9._-]{2,63}", values["D4_CHANGE_WINDOW_ID"]):
        raise CloseoutError("D4 change-window ID is malformed")
    return OwnerWindow(
        window_id=values["D4_CHANGE_WINDOW_ID"],
        authorized=values["D4_AUTHORIZED"] == "true",
        start=start,
        end=end,
        owner_input_sha256=_sha256(config.owner_input_file),
    )


def _labels(payload: dict[str, object]) -> dict[str, str]:
    raw = payload.get("Config", {})
    if not isinstance(raw, dict):
        return {}
    labels = raw.get("Labels", {})
    if not isinstance(labels, dict):
        return {}
    return {str(key): str(value) for key, value in labels.items()}


def _container(payload: dict[str, object]) -> Container:
    state = payload.get("State", {})
    if not isinstance(state, dict):
        state = {}
    health_payload = state.get("Health", {})
    if not isinstance(health_payload, dict):
        health_payload = {}
    return Container(
        container_id=str(payload.get("Id", "")),
        name=str(payload.get("Name", "")).lstrip("/"),
        running=bool(state.get("Running", False)),
        health=str(health_payload.get("Status", "none")),
        labels=_labels(payload),
    )


class DockerHost:
    def __init__(self, root: pathlib.Path, sleep: Callable[[float], None] = time.sleep):
        self.root = root
        self.sleep = sleep

    @staticmethod
    def _run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(args, check=check, capture_output=True, text=True)

    def _inspect(self, reference: str) -> Container | None:
        result = self._run(["docker", "inspect", "--type", "container", reference], check=False)
        if result.returncode != 0:
            return None
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise CloseoutError("Docker returned malformed inspect output") from exc
        if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
            raise CloseoutError("Docker returned an unexpected inspect result")
        return _container(payload[0])

    def portal_d4_containers(self, project: str) -> list[Container]:
        result = self._run(
            [
                "docker",
                "ps",
                "-aq",
                "--filter",
                f"label=com.docker.compose.project={project}",
                "--filter",
                f"label=com.primusspark.portal.execution-phase={D4_PHASE_LABEL}",
            ]
        )
        containers: list[Container] = []
        for reference in result.stdout.split():
            item = self._inspect(reference)
            if item is not None:
                containers.append(item)
        return containers

    def facade(self, name: str) -> Container | None:
        return self._inspect(name)

    def stop(self, container: Container, timeout: int) -> None:
        self._run(["docker", "stop", "--time", str(timeout), container.container_id])

    def remove_ephemeral(self, container: Container) -> None:
        refreshed = self._inspect(container.container_id)
        if refreshed is not None and refreshed.running:
            raise CloseoutError("refusing to remove a running qualifier container")
        self._run(["docker", "rm", container.container_id])

    def restore_d2_dark(self, config: Config) -> Container:
        preflight = self.root / "scripts/execution-d2-preflight.sh"
        self._run(
            [
                str(preflight),
                "--env-file",
                str(config.d2_runtime_env_file),
                "--mode",
                "readiness",
            ]
        )
        self._run(
            [
                "docker",
                "compose",
                "--project-directory",
                str(self.root),
                "--project-name",
                config.portal_project,
                "--env-file",
                str(config.d2_runtime_env_file),
                "-f",
                str(self.root / "deploy/compose.execution-edge.yaml"),
                "-f",
                str(self.root / "deploy/execution-d1/compose.dark.yaml"),
                "up",
                "-d",
                "--no-deps",
                "--force-recreate",
                "--pull",
                "never",
                "source-proxy",
            ]
        )
        deadline = time.monotonic() + config.health_timeout
        while time.monotonic() < deadline:
            candidates = self._project_service(config.portal_project, "source-proxy")
            if len(candidates) == 1 and candidates[0].running and candidates[0].health == "healthy":
                if candidates[0].labels.get("com.primusspark.portal.execution-phase") == D4_PHASE_LABEL:
                    raise CloseoutError("D2 restore retained the D4 source contract label")
                return candidates[0]
            self.sleep(1)
        raise CloseoutError("accepted D2 dark Source Proxy did not become healthy")

    def d2_source_proxy(self, project: str) -> Container:
        candidates = self._project_service(project, "source-proxy")
        if len(candidates) != 1:
            raise CloseoutError("expected exactly one accepted D2 Source Proxy")
        candidate = candidates[0]
        if (
            not candidate.running
            or candidate.health != "healthy"
            or candidate.labels.get("com.primusspark.portal.execution-phase") == D4_PHASE_LABEL
        ):
            raise CloseoutError("accepted D2 dark Source Proxy is not healthy and dark")
        return candidate

    def _project_service(self, project: str, service: str) -> list[Container]:
        result = self._run(
            [
                "docker",
                "ps",
                "-aq",
                "--filter",
                f"label=com.docker.compose.project={project}",
                "--filter",
                f"label=com.docker.compose.service={service}",
            ]
        )
        values = []
        for reference in result.stdout.split():
            item = self._inspect(reference)
            if item is not None:
                values.append(item)
        return values


def _validate_targets(config: Config, host: Host) -> tuple[list[Container], Container | None]:
    containers = host.portal_d4_containers(config.portal_project)
    for item in containers:
        if item.labels.get("com.docker.compose.project") != config.portal_project:
            raise CloseoutError("D4 container project identity mismatch")
        if item.labels.get("com.primusspark.portal.execution-phase") != D4_PHASE_LABEL:
            raise CloseoutError("D4 container phase identity mismatch")
        if item.service not in PORTAL_SERVICE_ALLOWLIST:
            raise CloseoutError("refusing an unexpected D4 service target")
    facade = host.facade(config.facade_container)
    if facade is not None:
        if facade.name != config.facade_container:
            raise CloseoutError("source facade container-name identity mismatch")
        if facade.labels.get("com.docker.compose.project") != config.facade_project:
            raise CloseoutError("source facade Compose project identity mismatch")
        if facade.labels.get("com.docker.compose.service") != config.facade_service:
            raise CloseoutError("source facade Compose service identity mismatch")
    return containers, facade


def audit(config: Config, host: Host, *, now: datetime) -> dict[str, object]:
    window = load_owner_window(config)
    containers, facade = _validate_targets(config, host)
    active_portal = sorted(item.service for item in containers if item.running)
    facade_running = facade is not None and facade.running
    open_window = window.is_open(now)
    violation = not open_window and (bool(active_portal) or facade_running)
    decision = "D4_DORMANT"
    if violation:
        decision = "D4_DORMANT_VIOLATION"
    elif open_window and (active_portal or facade_running):
        decision = "D4_WINDOW_ACTIVE"
    return {
        "schema_version": SCHEMA_VERSION,
        "decision": decision,
        "window_id": window.window_id,
        "owner_window_open": open_window,
        "active_portal_services": active_portal,
        "source_facade_running": facade_running,
    }


def _atomic_json(path: pathlib.Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def closeout(
    config: Config,
    host: Host,
    *,
    reason: str,
    now: datetime,
) -> dict[str, object]:
    window = load_owner_window(config)
    containers, facade = _validate_targets(config, host)
    stopped: list[str] = []
    removed: list[str] = []

    order = {"paper-read-qualifier": 0, "source-proxy": 1}
    for item in sorted(containers, key=lambda candidate: order[candidate.service]):
        if item.running:
            host.stop(item, config.stop_timeout)
            stopped.append(item.service)
        if item.service == "paper-read-qualifier":
            host.remove_ephemeral(item)
            removed.append(item.service)

    if facade is not None and facade.running:
        host.stop(facade, config.stop_timeout)
        stopped.append("dedicated-source-facade")

    remaining_d4, remaining_facade = _validate_targets(config, host)
    if any(item.running for item in remaining_d4) or (
        remaining_facade is not None and remaining_facade.running
    ):
        raise CloseoutError("D4 source path remained active after bounded stop")

    d2_proxy = host.restore_d2_dark(config)
    remaining_d4, remaining_facade = _validate_targets(config, host)
    if any(item.running for item in remaining_d4) or (
        remaining_facade is not None and remaining_facade.running
    ):
        raise CloseoutError("D4 source path restarted during D2 dark restore")
    payload: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "decision": "D4_DORMANT_CLOSEOUT_COMPLETE",
        "reason": reason,
        "closed_at_utc": now.isoformat().replace("+00:00", "Z"),
        "window_id": window.window_id,
        "owner_input_sha256": window.owner_input_sha256,
        "accepted_d2_runtime_env_sha256": _sha256(config.d2_runtime_env_file),
        "portal_commit": _git_commit(),
        "stopped_services": stopped,
        "removed_ephemeral_services": removed,
        "source_facade_running": False,
        "d2_dark_source_proxy": {
            "running": d2_proxy.running,
            "health": d2_proxy.health,
            "d4_phase_label_present": False,
        },
        "activation_authorized": False,
        "registry_delivery_profile": "fixture",
        "source_idle_evidence": "PENDING_OWNER_OBSERVATION",
    }
    _atomic_json(config.state_directory / "latest-closeout.json", payload)
    return payload


def _git_commit() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=pathlib.Path(__file__).resolve().parent.parent,
        capture_output=True,
        text=True,
        check=False,
    )
    value = result.stdout.strip()
    return value if re.fullmatch(r"[0-9a-f]{40}", value) else "unavailable"


def validate_source_idle_evidence(config: Config, *, closeout_at: datetime) -> dict[str, object]:
    _require_private_file(config.source_evidence_file)
    try:
        payload = json.loads(config.source_evidence_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CloseoutError("source idle evidence is unreadable") from exc
    if not isinstance(payload, dict) or set(payload) != {
        "schema_version",
        "change_window_id",
        "observed_at_utc",
        "source_facade_container",
        "source_facade_running",
        "source_db_sessions",
        "source_selects_delta",
        "source_bytes_delta",
        "observation_seconds",
        "sanitized",
        "producer",
    }:
        raise CloseoutError("source idle evidence schema is not exact")
    if payload["schema_version"] != SOURCE_EVIDENCE_VERSION:
        raise CloseoutError("source idle evidence version mismatch")
    if payload["source_facade_container"] != config.facade_container:
        raise CloseoutError("source idle evidence targets another facade")
    if payload["source_facade_running"] is not False or payload["sanitized"] is not True:
        raise CloseoutError("source idle evidence does not prove a sanitized dormant facade")
    for key in ("source_db_sessions", "source_selects_delta", "source_bytes_delta"):
        if type(payload[key]) is not int or payload[key] != 0:
            raise CloseoutError("source idle evidence reports non-zero source traffic")
    if (
        type(payload["observation_seconds"]) is not int
        or payload["observation_seconds"] < config.minimum_idle_observation
    ):
        raise CloseoutError("source idle observation is shorter than the accepted minimum")
    observed_at = _timestamp(str(payload["observed_at_utc"]))
    if observed_at < closeout_at:
        raise CloseoutError("source idle evidence predates closeout")
    if not isinstance(payload["producer"], str) or not SAFE_ID.fullmatch(payload["producer"]):
        raise CloseoutError("source idle evidence producer is malformed")
    return payload


def verify(config: Config, host: Host, *, now: datetime) -> dict[str, object]:
    current = audit(config, host, now=now)
    if current["active_portal_services"] or current["source_facade_running"]:
        raise CloseoutError("D4 source path is not dormant")
    d2_proxy = host.d2_source_proxy(config.portal_project)
    closeout_path = config.state_directory / "latest-closeout.json"
    _require_private_file(closeout_path)
    try:
        closeout_payload = json.loads(closeout_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CloseoutError("closeout evidence is unreadable") from exc
    if closeout_payload.get("decision") != "D4_DORMANT_CLOSEOUT_COMPLETE":
        raise CloseoutError("closeout evidence decision is not accepted")
    closeout_at = _timestamp(str(closeout_payload.get("closed_at_utc", "")))
    source = validate_source_idle_evidence(config, closeout_at=closeout_at)
    if source["change_window_id"] != current["window_id"]:
        raise CloseoutError("source idle evidence belongs to another owner window")
    result = dict(current)
    result["decision"] = "D4_DORMANT_VERIFIED"
    result["closeout_evidence_sha256"] = _sha256(closeout_path)
    result["source_idle_evidence_sha256"] = _sha256(config.source_evidence_file)
    result["source_db_sessions"] = 0
    result["source_bytes_delta"] = 0
    result["d2_dark_source_proxy_health"] = d2_proxy.health
    return result


def guard(
    config: Config,
    host: Host,
    *,
    now: Callable[[], datetime] = _utc_now,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, object]:
    window = load_owner_window(config)
    saw_qualifier = False
    start_deadline = min(window.start + timedelta(seconds=config.start_deadline), window.end)
    while True:
        current = now()
        containers, _ = _validate_targets(config, host)
        qualifier_running = any(
            item.service == "paper-read-qualifier" and item.running for item in containers
        )
        saw_qualifier = saw_qualifier or qualifier_running
        if not window.authorized:
            return closeout(config, host, reason="owner-authorization-revoked", now=current)
        if current >= window.end:
            return closeout(config, host, reason="owner-window-expired", now=current)
        if not saw_qualifier and current >= start_deadline:
            return closeout(config, host, reason="qualification-start-deadline-missed", now=current)
        if saw_qualifier and not qualifier_running:
            return closeout(config, host, reason="qualification-finished", now=current)
        sleep(config.poll_interval)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=pathlib.Path, required=True)
    parser.add_argument("--mode", choices=("template", "audit", "closeout", "guard", "verify"), required=True)
    parser.add_argument("--reason", default="operator-requested")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        config = load_config(args.config, template=args.mode == "template")
        if args.mode == "template":
            print("D4 dormant closeout template: PASSED")
            return 0
        host = DockerHost(pathlib.Path(__file__).resolve().parent.parent)
        if args.mode == "audit":
            payload = audit(config, host, now=_utc_now())
            print(json.dumps(payload, sort_keys=True))
            return 3 if payload["decision"] == "D4_DORMANT_VIOLATION" else 0
        if args.mode in {"closeout", "guard"} and os.geteuid() != 0:
            raise CloseoutError("closeout and guard modes require root")
        if args.mode == "closeout":
            payload = closeout(config, host, reason=args.reason, now=_utc_now())
        elif args.mode == "guard":
            payload = guard(config, host)
        else:
            payload = verify(config, host, now=_utc_now())
        print(json.dumps(payload, sort_keys=True))
        return 0
    except (CloseoutError, subprocess.CalledProcessError) as exc:
        print(f"D4 dormant closeout: REJECTED ({exc})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
