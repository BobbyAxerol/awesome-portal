#!/usr/bin/env python3
"""Safely adopt the already-running stable Portal stack for image deployment.

This is deliberately a narrow one-time transition helper, not a generic
Compose manager.  It reads only Docker *runtime metadata* from the established
stable project, proves the project/port/volumes/overlay graph, and writes a
mode-0600 production environment file without printing secret values.  It
never starts, stops, restarts or deletes a container, volume, network or file
outside its explicit deployment directory.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import secrets
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from typing import Any


DEFAULT_PROJECT = "portal-stable-v1-0-1"
DEFAULT_PORT = 18081
REQUIRED_SERVICES = (
    "portal-api",
    "roadmap-task-board-api",
    "portal-web",
    "control-api",
    "portal-postgres",
    "portal-nats",
    "portal-minio",
    "quant-worker-py",
)
# A failed application bootstrap may leave the durable data plane running while
# the application/one-shot containers are stopped.  Recovery is intentionally
# narrow: these are the only services allowed to be non-running in the
# explicit partial-resume mode; the durable companions must still be running.
DURABLE_SERVICES = (
    "portal-postgres",
    "portal-nats",
    "portal-minio",
)
PARTIAL_RESUME_SERVICES = tuple(
    service for service in REQUIRED_SERVICES if service not in DURABLE_SERVICES
)
REQUIRED_EXECUTION_OVERLAYS = (
    "deploy/compose.execution-current-source.yaml",
    "deploy/compose.execution-local-projection.yaml",
    "deploy/compose.execution-manager-analytics.yaml",
    "deploy/compose.execution-manager-realtime.yaml",
)
FEATURE_MAPPING = {
    "FEATURE_EXECUTION_EDGE": "CONTROL_API_FEATURE_EXECUTION_EDGE",
    "FEATURE_EXECUTION_REALTIME_SSE": "CONTROL_API_FEATURE_EXECUTION_REALTIME_SSE",
    "FEATURE_EXECUTION_ANALYTICS_QUERY": "CONTROL_API_FEATURE_EXECUTION_ANALYTICS_QUERY",
    "FEATURE_EXECUTION_SHADOW_QUERY": "CONTROL_API_FEATURE_EXECUTION_SHADOW_QUERY",
    "FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW": "CONTROL_API_FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW",
    "FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT": "CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT",
    "FEATURE_EXECUTION_LOCAL_R0_TASKS": "CONTROL_API_FEATURE_EXECUTION_LOCAL_R0_TASKS",
    "FEATURE_EXECUTION_CURRENT_SOURCE_PAPER": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER",
    "FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE",
    "FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX",
    "FEATURE_EXECUTION_CURRENT_SOURCE_LIVE": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE",
    "FEATURE_EXECUTION_MARKET_CONTEXT": "CONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT",
    "FEATURE_EXECUTION_LOCAL_PROJECTION": "CONTROL_API_FEATURE_EXECUTION_LOCAL_PROJECTION",
    "FEATURE_EXECUTION_DURABLE_MIRROR": "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR",
    "FEATURE_EXECUTION_DURABLE_MIRROR_READS": "CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS",
    "FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES": "CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES",
}
CONTROL_DIRECT = {
    "AUTH_MODE": "CONTROL_API_AUTH_MODE",
    "DATABASE_URL": "CONTROL_API_DATABASE_URL",
    "PORTAL_ENV": "CONTROL_API_PORTAL_ENV",
    "PORTAL_SSE_CONNECT_TIMEOUT_MS": "CONTROL_API_PORTAL_SSE_CONNECT_TIMEOUT_MS",
    "INTERNAL_PRINCIPAL_SECRET": "CONTROL_API_INTERNAL_PRINCIPAL_SECRET",
    "QUERY_CURSOR_ACTIVE_KEY_ID": "CONTROL_API_QUERY_CURSOR_ACTIVE_KEY_ID",
    "GOVERNANCE_APPLY_ACTIVE_KEY_ID": "CONTROL_API_GOVERNANCE_APPLY_ACTIVE_KEY_ID",
    "GOVERNANCE_PLAN_TTL_SECONDS": "CONTROL_API_GOVERNANCE_PLAN_TTL_SECONDS",
}
CONTROL_SAME_NAME = (
    "CLOUDFLARE_TEAM_DOMAIN",
    "CLOUDFLARE_ACCESS_ISSUER",
    "CLOUDFLARE_ACCESS_AUD",
    "CLOUDFLARE_ACCESS_JWKS_URI",
    "CLOUDFLARE_ALLOWED_EMAIL_DOMAIN",
    "PORTAL_PUBLIC_ORIGIN",
    "QUERY_CURSOR_TTL_SECONDS",
    "EXECUTION_REALTIME_AUTHORITY_MODE",
    "EXECUTION_MARKET_CANDLES_SOURCE",
    "EXECUTION_EDGE_ORIGIN",
    "EXECUTION_EDGE_ENVIRONMENT",
    "EXECUTION_EDGE_MANAGER_V2_PROFILE_ID",
    "EXECUTION_EDGE_PROJECTION_WORKSPACE_ID",
    "EXECUTION_EDGE_KEY_ID",
    "EXECUTION_EDGE_DELEGATION_ISSUER",
    "EXECUTION_EDGE_DELEGATION_AUDIENCE",
    "EXECUTION_EDGE_DELEGATION_TTL_SECONDS",
    "EXECUTION_EDGE_PAPER_ORIGIN",
    "EXECUTION_EDGE_PAPER_PROFILE_ID",
    "EXECUTION_EDGE_PAPER_AUDIENCE",
    "EXECUTION_EDGE_PAPER_DNSE_ORIGIN",
    "EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID",
    "EXECUTION_EDGE_PAPER_DNSE_AUDIENCE",
    "EXECUTION_EDGE_SANDBOX_ORIGIN",
    "EXECUTION_EDGE_SANDBOX_PROFILE_ID",
    "EXECUTION_EDGE_SANDBOX_AUDIENCE",
    "EXECUTION_EDGE_LIVE_ORIGIN",
    "EXECUTION_EDGE_LIVE_PROFILE_ID",
    "EXECUTION_EDGE_LIVE_AUDIENCE",
    "EXECUTION_EDGE_CONNECT_TIMEOUT_MS",
    "EXECUTION_EDGE_ANALYTICS_REQUEST_TIMEOUT_MS",
    "EXECUTION_EDGE_ANALYTICS_MAXIMUM_CONCURRENCY",
    "EXECUTION_EDGE_ANALYTICS_MAXIMUM_QUEUE",
    "EXECUTION_EDGE_ANALYTICS_QUEUE_TIMEOUT_MS",
    "EXECUTION_EDGE_CURRENT_SOURCE_REQUEST_TIMEOUT_MS",
    "EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES",
    "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_CONCURRENCY",
    "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_QUEUE",
    "EXECUTION_EDGE_CURRENT_SOURCE_QUEUE_TIMEOUT_MS",
    "EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND",
    "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS",
    "EXECUTION_EDGE_CURRENT_SOURCE_CACHE_TTL_MS",
    "EXECUTION_EDGE_CURRENT_SOURCE_COALESCE_WAIT_MS",
    "EXECUTION_EDGE_CURRENT_SOURCE_LEASE_TTL_MS",
    "EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID",
    "EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS",
    "EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS",
    "EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS",
    "EXECUTION_LOCAL_PROJECTION_JOURNAL_RETENTION_SECONDS",
    "EXECUTION_LOCAL_PROJECTION_MAXIMUM_JOURNAL_ENTRIES",
)


class TakeoverError(ValueError):
    """The established stable runtime cannot safely be adopted."""


def fail(message: str) -> None:
    raise TakeoverError(message)


def docker_json(arguments: list[str]) -> Any:
    command = ["sudo", "-n", "docker", *arguments]
    try:
        output = subprocess.check_output(command, text=True, stderr=subprocess.PIPE)
    except (OSError, subprocess.CalledProcessError) as error:
        fail("stable runtime metadata is unavailable through passwordless sudo docker")
    try:
        return json.loads(output)
    except json.JSONDecodeError as error:
        fail("Docker returned malformed runtime metadata")


def environment(container: dict[str, Any]) -> dict[str, str]:
    values: dict[str, str] = {}
    for item in container.get("Config", {}).get("Env", []):
        if not isinstance(item, str) or "=" not in item:
            fail("container has malformed environment metadata")
        key, value = item.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in values:
            fail("container has unsafe or duplicate environment metadata")
        if "\n" in value or "\r" in value:
            fail("container environment contains a multiline value")
        values[key] = value
    return values


def labels(container: dict[str, Any]) -> dict[str, str]:
    result = container.get("Config", {}).get("Labels", {})
    if not isinstance(result, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in result.items()):
        fail("container has malformed label metadata")
    return result


def required_value(values: dict[str, str], key: str) -> str:
    value = values.get(key)
    if value is None or value == "":
        fail(f"stable runtime is missing required setting: {key}")
    return value


def optional_value(values: dict[str, str], key: str, output: dict[str, str]) -> None:
    value = values.get(key)
    if value is not None and value != "":
        output[key] = value


def copy_signing_material(
    values: dict[str, str],
    output: dict[str, str],
    *,
    json_source: str,
    file_source: str,
    json_destination: str,
    file_destination: str,
    active_key_destination: str,
) -> str:
    json_value = values.get(json_source, "")
    file_value = values.get(file_source, "")
    if file_value:
        if not file_value.startswith("/run/secrets/control-api/"):
            fail(f"stable runtime {file_source} is outside the mounted Control API secret directory")
        output[file_destination] = file_value
        # Older stable images can retain a JSON fallback alongside the mounted
        # keyring file.  The current config correctly rejects both, so the
        # takeover chooses the root-owned file and intentionally omits JSON.
        return "ROOT_OWNED_FILE"
    if json_value:
        output[json_destination] = json_value
        return "RUNTIME_JSON"
    # The legacy container exposes no signing material at all.  Query cursors
    # and governance plans are bounded, ephemeral artifacts; a fresh keyring
    # is safer than retaining an implicit image default.  This does not alter
    # identities, passwords, database rows, execution credentials or sessions.
    active_key_id = output.get(active_key_destination)
    if not active_key_id:
        fail(f"stable runtime is missing required signing key id: {active_key_destination}")
    # The old stable image may not have a persisted keyring at all.  The
    # fallback must still be a JSON object keyed by the active id; a bare
    # token would pass dotenv serialization but fail the Control API config
    # parser during bootstrap.
    output[json_destination] = json.dumps(
        {active_key_id: secrets.token_hex(32)},
        separators=(",", ":"),
    )
    return "FRESH_EPHEMERAL_KEYRING"


def mount_source(container: dict[str, Any], destination: str, *, bind_only: bool = True) -> str:
    matches = [
        item for item in container.get("Mounts", [])
        if isinstance(item, dict) and item.get("Destination") == destination
    ]
    if len(matches) != 1:
        fail(f"stable runtime requires exactly one mount at {destination}")
    mount = matches[0]
    source = mount.get("Source")
    if bind_only and mount.get("Type") != "bind":
        fail(f"stable runtime mount at {destination} must remain a bind mount")
    if not isinstance(source, str) or not source.startswith("/"):
        fail(f"stable runtime mount at {destination} has no safe absolute source")
    if destination == "/data" and mount.get("RW") is not False:
        fail("historical data mount must remain read-only")
    return source


def named_volume(container: dict[str, Any], destination: str, expected_name: str) -> str:
    matches = [
        item for item in container.get("Mounts", [])
        if isinstance(item, dict) and item.get("Destination") == destination
    ]
    if len(matches) != 1:
        fail(f"stable runtime requires exactly one volume at {destination}")
    mount = matches[0]
    if mount.get("Type") != "volume" or mount.get("Name") != expected_name:
        fail(f"stable volume identity drifted at {destination}")
    return expected_name


def numeric_group(container: dict[str, Any], label: str) -> str:
    groups = container.get("HostConfig", {}).get("GroupAdd", [])
    if not isinstance(groups, list):
        fail(f"stable {label} group metadata is malformed")
    numeric = [str(value) for value in groups if re.fullmatch(r"[0-9]{1,10}", str(value))]
    if len(numeric) != 1:
        fail(f"stable {label} needs exactly one numeric supplemental group")
    return numeric[0]


def container_name(container: dict[str, Any], service: str) -> str:
    name = container.get("Name")
    if not isinstance(name, str) or not name.startswith("/"):
        fail(f"stable {service} container name is malformed")
    return name[1:]


def real_containers(project: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for service in REQUIRED_SERVICES:
        raw = subprocess.check_output(
            [
                "sudo", "-n", "docker", "ps", "-aq",
                "--filter", f"label=com.docker.compose.project={project}",
                "--filter", f"label=com.docker.compose.service={service}",
            ],
            text=True,
            stderr=subprocess.PIPE,
        ).splitlines()
        if len(raw) != 1:
            fail(f"expected exactly one stable {service} container")
        inspected = docker_json(["inspect", raw[0]])
        if not isinstance(inspected, list) or len(inspected) != 1 or not isinstance(inspected[0], dict):
            fail(f"stable {service} inspect payload is invalid")
        result[service] = inspected[0]
    return result


def fixture_containers(path: pathlib.Path) -> dict[str, dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail("fixture input is unreadable")
    containers = payload.get("containers") if isinstance(payload, dict) else None
    if not isinstance(containers, dict) or set(containers) != set(REQUIRED_SERVICES):
        fail("fixture does not contain the exact stable service set")
    if not all(isinstance(value, dict) for value in containers.values()):
        fail("fixture container metadata is malformed")
    return containers


def assert_identity(
    containers: dict[str, dict[str, Any]],
    project: str,
    port: int,
    *,
    allow_partial_resume: bool = False,
) -> tuple[dict[str, str], dict[str, str]]:
    source_names: dict[str, str] = {}
    for service, container in containers.items():
        container_labels = labels(container)
        if container_labels.get("com.docker.compose.project") != project:
            fail(f"stable {service} is not owned by the expected Compose project")
        if container_labels.get("com.docker.compose.service") != service:
            fail(f"stable {service} label drifted")
        running = container.get("State", {}).get("Running") is True
        if not running:
            if allow_partial_resume and service in DURABLE_SERVICES:
                fail(f"stable durable service {service} must remain running for partial resume")
            status = container.get("State", {}).get("Status")
            if not allow_partial_resume or service not in PARTIAL_RESUME_SERVICES or status not in {"created", "exited"}:
                fail(f"stable {service} is not running")
        source_names[service] = container_name(container, service)

    if allow_partial_resume:
        for service in DURABLE_SERVICES:
            if containers[service].get("State", {}).get("Running") is not True:
                fail(f"stable durable service {service} must remain running for partial resume")

    config_files = labels(containers["control-api"]).get("com.docker.compose.project.config_files", "").split(",")
    # Compose records absolute config paths.  The legacy stack used
    # `deploy/...`, while an immutable release records the same files under
    # `/srv/portal/releases/<commit>/compose/`.  Authority is the exact
    # basename, never a substring or a caller-provided path; this preserves
    # the four active overlays across the stable transition without binding
    # the gate to one release directory layout.
    observed_overlay_names = {
        pathlib.PurePosixPath(item.strip()).name
        for item in config_files
        if item.strip()
    }
    expected_overlay_names = {
        pathlib.PurePosixPath(item).name for item in REQUIRED_EXECUTION_OVERLAYS
    }
    if not expected_overlay_names.issubset(observed_overlay_names):
        fail("stable execution overlay graph is incomplete; refusing to drop an active overlay")

    network_ports = containers["portal-web"].get("NetworkSettings", {}).get("Ports", {})
    bindings = network_ports.get("80/tcp") if isinstance(network_ports, dict) else None
    # Docker omits NetworkSettings.Ports for an exited container even though
    # the declared HostConfig binding remains immutable.  Recovery may use
    # that declaration only for a stopped portal-web; normal mode still
    # requires the live network binding.
    if (
        allow_partial_resume
        and containers["portal-web"].get("State", {}).get("Running") is not True
        and not bindings
    ):
        host_ports = containers["portal-web"].get("HostConfig", {}).get("PortBindings", {})
        bindings = host_ports.get("80/tcp") if isinstance(host_ports, dict) else None
    expected_binding = {"HostIp": "127.0.0.1", "HostPort": str(port)}
    if not isinstance(bindings, list) or expected_binding not in bindings:
        fail("stable portal-web is not bound to the expected loopback port")

    volumes = {
        "portal_postgres": named_volume(
            containers["portal-postgres"],
            "/var/lib/postgresql/data",
            f"{project}_portal-postgres-data",
        ),
        "roadmap_task_board": named_volume(
            containers["roadmap-task-board-api"],
            "/var/lib/roadmap-task-board",
            f"{project}_roadmap-task-board-data",
        ),
        "portal_artifacts": named_volume(
            containers["portal-api"],
            "/var/lib/portal/artifacts",
            f"{project}_portal-artifacts",
        ),
        "portal_nats": named_volume(
            containers["portal-nats"],
            "/var/lib/nats",
            f"{project}_portal-nats-data",
        ),
        "portal_minio": named_volume(
            containers["portal-minio"],
            "/data",
            f"{project}_portal-minio-data",
        ),
    }
    return source_names, volumes


def build_environment(containers: dict[str, dict[str, Any]], project: str, port: int) -> tuple[dict[str, str], dict[str, bool], dict[str, str]]:
    control = environment(containers["control-api"])
    roadmap = environment(containers["roadmap-task-board-api"])
    portal_api = environment(containers["portal-api"])
    worker = environment(containers["quant-worker-py"])
    postgres = environment(containers["portal-postgres"])
    minio = environment(containers["portal-minio"])
    web = environment(containers["portal-web"])

    if control.get("FEATURE_EXECUTION_COMMAND_RELAY") != "false":
        fail("command relay is not eligible for stable read-plane takeover")

    output: dict[str, str] = {
        "PORTAL_STACK_NAME": project,
        "PORTAL_HTTP_PORT": str(port),
        "PORTAL_CONTROL_DB_USER": required_value(postgres, "POSTGRES_USER"),
        "PORTAL_CONTROL_DB_PASSWORD": required_value(postgres, "POSTGRES_PASSWORD"),
        "PORTAL_CONTROL_DB_NAME": required_value(postgres, "POSTGRES_DB"),
        "PORTAL_HISTORICAL_DATA_DIR": mount_source(containers["portal-api"], "/data"),
        "PORTAL_HMD_READER_GID": numeric_group(containers["portal-api"], "Portal API"),
        "PORTAL_RUNTIME_GID": numeric_group(containers["control-api"], "Control API"),
        "CONTROL_API_SECRETS_DIR": mount_source(containers["control-api"], "/run/secrets/control-api"),
        "CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY": mount_source(containers["control-api"], "/run/secrets/execution-edge"),
        "PORTAL_MINIO_ROOT_USER": required_value(minio, "MINIO_ROOT_USER"),
        "PORTAL_MINIO_ROOT_PASSWORD": required_value(minio, "MINIO_ROOT_PASSWORD"),
        "PORTAL_WEB_UPSTREAM": required_value(web, "PORTAL_WEB_UPSTREAM"),
        "PORTAL_WORKER_HISTORICAL_DATA_MODE": required_value(worker, "PORTAL_HISTORICAL_DATA_MODE"),
        "PORTAL_WORKER_LEASE_SECONDS": required_value(worker, "PORTAL_WORKER_LEASE_SECONDS"),
        "PORTAL_WORKER_GRACE_SECONDS": required_value(worker, "PORTAL_WORKER_GRACE_SECONDS"),
    }
    for source, destination in CONTROL_DIRECT.items():
        output[destination] = required_value(control, source)
    cursor_keyring = copy_signing_material(
        control,
        output,
        json_source="QUERY_CURSOR_KEYS_JSON",
        file_source="QUERY_CURSOR_KEYS_FILE",
        json_destination="CONTROL_API_QUERY_CURSOR_KEYS_JSON",
        file_destination="CONTROL_API_QUERY_CURSOR_KEYS_FILE",
        active_key_destination="CONTROL_API_QUERY_CURSOR_ACTIVE_KEY_ID",
    )
    governance_keyring = copy_signing_material(
        control,
        output,
        json_source="GOVERNANCE_APPLY_KEYS_JSON",
        file_source="GOVERNANCE_APPLY_KEYS_FILE",
        json_destination="CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON",
        file_destination="CONTROL_API_GOVERNANCE_APPLY_KEYS_FILE",
        active_key_destination="CONTROL_API_GOVERNANCE_APPLY_ACTIVE_KEY_ID",
    )
    for key in CONTROL_SAME_NAME:
        optional_value(control, key, output)
    for source, destination in FEATURE_MAPPING.items():
        value = control.get(source, "false")
        if value not in {"true", "false"}:
            fail(f"stable runtime feature value is invalid: {source}")
        # A setting absent from an older stable image is semantically its
        # documented secure default, false.  We make that default explicit in
        # the new immutable environment instead of inventing an activation.
        output[destination] = value

    # Hard-coded in the production Compose authority.  Persisting an alternate
    # value in host state would imply a command activation that this transition
    # expressly does not authorize.
    output["CONTROL_API_FEATURE_EXECUTION_COMMAND_RELAY"] = "false"

    for source in (
        "PORTAL_HISTORICAL_DATA_MODE",
        "PORTAL_CRYPTO_RESAMPLE_ENGINE",
        "PORTAL_SUMMARY_DEADLINE_MS",
        "PORTAL_ENVIRONMENT",
        "PORTAL_PLANNING_SUMMARY_MODE",
        "PORTAL_PLANNING_SUMMARY_TIMEOUT_MS",
        "PORTAL_PLANNING_SUMMARY_MAX_BYTES",
    ):
        output[source] = required_value(portal_api, source)
    for source, destination in (
        ("PORTAL_PUBLIC_URL", "ROADMAP_TASK_BOARD_PUBLIC_URL"),
        ("PORTAL_DEFAULT_ACTOR", "ROADMAP_TASK_BOARD_DEFAULT_ACTOR"),
        ("PORTAL_LOG_LEVEL", "ROADMAP_TASK_BOARD_LOG_LEVEL"),
    ):
        output[destination] = required_value(roadmap, source)
    optional_cors = roadmap.get("PORTAL_CORS_ORIGINS", "")
    if optional_cors:
        output["ROADMAP_TASK_BOARD_CORS_ORIGINS"] = optional_cors
    for key in (
        "DISCORD_WEBHOOK_URL",
        "LARK_WEBHOOK_URL",
        "LARK_WEBHOOK_SIGN_SECRET",
        "LARK_APP_ID",
        "LARK_APP_SECRET",
        "LARK_ORG_USER_ID_MAP",
        "LARK_MESSAGE_FORMAT",
        "PORTAL_NOTIFY_CHANNELS",
    ):
        optional_value(roadmap, key, output)

    feature_state = {
        source.removeprefix("FEATURE_").lower(): output[destination] == "true"
        for source, destination in FEATURE_MAPPING.items()
    }
    return output, feature_state, {
        "query_cursor": cursor_keyring,
        "governance_apply": governance_keyring,
    }


def quote_env(value: str) -> str:
    if "\n" in value or "\r" in value:
        fail("refusing to serialize multiline environment value")
    # Single-quoted Compose dotenv values do not interpolate `$`; escape only
    # the one character that can end the literal.
    return "'" + value.replace("'", "\\'") + "'"


def read_dotenv_scalar(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("\\'", "'")
        values[key] = value
    return values


def write_private(path: pathlib.Path, contents: str) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = pathlib.Path(temporary_name)
    try:
        os.fchmod(descriptor, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def valid_keyring_json(value: str, active_key_id: str) -> bool:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return False
    return (
        isinstance(parsed, dict)
        and not isinstance(parsed, list)
        and isinstance(parsed.get(active_key_id), str)
        and len(parsed[active_key_id].encode("utf-8")) >= 32
    )


def repair_existing_keyrings(
    path: pathlib.Path,
    existing: dict[str, str],
    runtime_env: dict[str, str],
) -> list[str]:
    """Repair only malformed JSON fallback keyrings in the generated env.

    A previous failed transition could have serialized the ephemeral fallback
    as a bare hex token.  Preserve a valid JSON keyring or root-owned key file;
    rewrite only the malformed/missing JSON fields needed for bootstrap.
    """

    replacements: dict[str, str] = {}
    for json_key, active_key in (
        ("CONTROL_API_QUERY_CURSOR_KEYS_JSON", "CONTROL_API_QUERY_CURSOR_ACTIVE_KEY_ID"),
        ("CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON", "CONTROL_API_GOVERNANCE_APPLY_ACTIVE_KEY_ID"),
    ):
        if existing.get(json_key) and valid_keyring_json(existing[json_key], existing.get(active_key, "")):
            continue
        file_key = json_key.replace("_JSON", "_FILE")
        if existing.get(file_key):
            # The mounted file is authoritative; Compose intentionally leaves
            # the JSON field empty in this mode.
            continue
        candidate = runtime_env.get(json_key)
        if not candidate or not valid_keyring_json(candidate, existing.get(active_key, "")):
            fail(f"generated fallback keyring is invalid: {json_key}")
        replacements[json_key] = candidate

    if not replacements:
        return []

    raw_lines = path.read_text(encoding="utf-8").splitlines()
    seen: set[str] = set()
    rewritten: list[str] = []
    for line in raw_lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key in replacements:
            rewritten.append(f"{key}={quote_env(replacements[key])}")
            seen.add(key)
        else:
            rewritten.append(line)
    for key, value in replacements.items():
        if key not in seen:
            rewritten.append(f"{key}={quote_env(value)}")
    write_private(path, "\n".join(rewritten) + "\n")
    return sorted(replacements)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deployment-path", type=pathlib.Path, required=True)
    parser.add_argument("--legacy-project", default=DEFAULT_PROJECT)
    parser.add_argument("--expected-port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--fixture", type=pathlib.Path, help="test-only sanitized Docker inspect fixture")
    parser.add_argument("--check", action="store_true", help="validate only; do not create or change files")
    parser.add_argument(
        "--resume-partial-runtime",
        action="store_true",
        help="allow only stopped application/one-shot containers while durable data services remain running",
    )
    args = parser.parse_args()
    try:
        if args.legacy_project != DEFAULT_PROJECT:
            fail("legacy project is fixed by the signed stable transition contract")
        if args.expected_port != DEFAULT_PORT:
            fail("loopback port is fixed by the signed stable transition contract")
        deployment = args.deployment_path.resolve(strict=False)
        if not deployment.is_absolute() or deployment.name != "portal":
            fail("deployment path must be the canonical /srv/portal directory")
        if deployment.exists() and deployment.is_symlink():
            fail("deployment directory must not be a symlink")
        if not deployment.exists():
            if args.check:
                fail("deployment directory is absent")
            deployment.mkdir(parents=True, mode=0o750)
        if not deployment.is_dir():
            fail("deployment path is not a directory")

        containers = fixture_containers(args.fixture) if args.fixture else real_containers(args.legacy_project)
        names, volumes = assert_identity(
            containers,
            args.legacy_project,
            args.expected_port,
            allow_partial_resume=args.resume_partial_runtime,
        )
        runtime_env, features, keyring_sources = build_environment(containers, args.legacy_project, args.expected_port)

        env_path = deployment / ".env.production"
        repaired_keyrings: list[str] = []
        if env_path.exists():
            if env_path.is_symlink() or not env_path.is_file():
                fail("existing production environment file is unsafe")
            existing = read_dotenv_scalar(env_path)
            if existing.get("PORTAL_STACK_NAME") != args.legacy_project or existing.get("PORTAL_HTTP_PORT") != str(args.expected_port):
                fail("existing production environment does not target the verified stable project and port")
            repaired_keyrings = repair_existing_keyrings(env_path, existing, runtime_env)
            mode = "EXISTING_ENV_VALIDATED_WITH_KEYRING_REPAIR" if repaired_keyrings else "EXISTING_ENV_VALIDATED"
        elif args.check:
            mode = "ENV_WOULD_BE_CREATED"
        else:
            lines = [
                "# Generated by scripts/prepare-stable-release-takeover.py.",
                "# Host-only secret material; mode 0600. Do not commit or copy to dev.",
            ]
            lines.extend(f"{key}={quote_env(runtime_env[key])}" for key in sorted(runtime_env))
            write_private(env_path, "\n".join(lines) + "\n")
            mode = "ENV_CREATED_FROM_VERIFIED_STABLE_RUNTIME"

        state = {
            "schema_version": "portal.stable-release-takeover-state.v1",
            "decision": (
                "STABLE_RELEASE_TAKEOVER_PARTIAL_RESUME_PREFLIGHT_PASSED"
                if args.resume_partial_runtime
                else "STABLE_RELEASE_TAKEOVER_PREFLIGHT_PASSED"
            ),
            "mode": mode,
            "prepared_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "project": args.legacy_project,
            "loopback_port": args.expected_port,
            "containers": names,
            "mutable_volumes": volumes,
            "execution_overlays": list(REQUIRED_EXECUTION_OVERLAYS),
            "execution_features": features,
            "keyring_sources": keyring_sources,
            "repaired_keyrings": repaired_keyrings,
            "command_relay": False,
        }
        if not args.check:
            transition = deployment / "transition"
            transition.mkdir(mode=0o700, exist_ok=True)
            if transition.is_symlink() or not transition.is_dir():
                fail("transition evidence directory is unsafe")
            write_private(transition / "stable-takeover-state.json", json.dumps(state, indent=2, sort_keys=True) + "\n")
            state_env = "\n".join((
                "# Non-secret runtime identities for the deployment backup step.",
                f"TAKEOVER_PROJECT={args.legacy_project}",
                f"TAKEOVER_POSTGRES_CONTAINER={names['portal-postgres']}",
                f"TAKEOVER_ROADMAP_CONTAINER={names['roadmap-task-board-api']}",
                f"TAKEOVER_PORTAL_WEB_CONTAINER={names['portal-web']}",
                f"TAKEOVER_LOOPBACK_PORT={args.expected_port}",
                "TAKEOVER_COMMAND_RELAY=false",
                "",
            ))
            write_private(transition / "stable-takeover.env", state_env)
        print(json.dumps({
            "decision": state["decision"],
            "mode": mode,
            "project": args.legacy_project,
            "loopback_port": args.expected_port,
            "service_count": len(names),
            "execution_overlay_count": len(REQUIRED_EXECUTION_OVERLAYS),
            "command_relay": False,
        }, sort_keys=True))
        return 0
    except (TakeoverError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({"decision": "NO_GO", "reason": str(error)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
