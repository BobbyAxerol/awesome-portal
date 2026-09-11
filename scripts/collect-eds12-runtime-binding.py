#!/usr/bin/env python3
"""Collect a sanitized EDS-12 runtime-binding marker from Docker metadata.

This is deliberately a post-deployment evidence collector, not a deployer.
It reads only a verified release manifest, Docker labels/health/image digests
and a small non-secret SGP deployment-state file.  It never reads mounted
secrets, application payloads, Trading System data, source-proxy traffic or
browser data; it never starts, restarts or removes a container.
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
import tempfile
from dataclasses import dataclass
from typing import Any


SHA256 = re.compile(r"sha256:[a-f0-9]{64}\Z")
COMMIT = re.compile(r"[a-f0-9]{40}\Z")
IMAGE = re.compile(r"[^@\s]+@(sha256:[a-f0-9]{64})\Z")
ENV_KEY = re.compile(r"[A-Z][A-Z0-9_]*\Z")
MAX_FILE_BYTES = 16 * 1024 * 1024

SGP_SERVICES = {
    "portal-api": "PORTAL_API_IMAGE",
    "portal-web": "PORTAL_WEB_IMAGE",
    "control-api": "PORTAL_CONTROL_API_IMAGE",
    "roadmap-task-board-api": "PORTAL_ROADMAP_API_IMAGE",
}
AWS_SERVICES = ("execution-edge", "source-proxy")
ALL_SERVICES = set(SGP_SERVICES) | set(AWS_SERVICES)
AWS_PROJECT_SUFFIXES = (
    ("paper", ""),
    ("sandbox", "-sandbox"),
    ("live", "-live"),
)
SENSITIVE_PARTS = {
    "password", "secret", "token", "private_key", "credential", "cookie",
    "authorization", "database_url", "dsn", "redis_url", "broker_key",
}
DIRECT_SOURCE_ENV = re.compile(
    r"(?:DIRECT.*(?:DATABASE|DB|REDIS|BROKER)|TRADING_SYSTEM.*(?:DATABASE|DB|REDIS|BROKER))"
)


class CollectionError(ValueError):
    """Fail-closed collection error whose message never includes secret values."""


@dataclass(frozen=True)
class ReleaseContext:
    source_commit: str
    image_tag: str
    manifest_sha256: str
    compose_bundle_sha256: str
    images: dict[str, str]
    sgp_project: str
    aws_project: str


class DockerMetadata:
    """Narrow Docker CLI adapter used solely for metadata inspection."""

    def __init__(self, binary: str = "docker") -> None:
        self.binary = binary

    def text(self, *arguments: str) -> str:
        try:
            result = subprocess.run(
                [self.binary, *arguments],
                check=False,
                capture_output=True,
                text=True,
                timeout=20,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise CollectionError("Docker metadata query is unavailable") from error
        if result.returncode != 0:
            raise CollectionError("Docker metadata query was rejected")
        return result.stdout

    def one_container(self, project: str, service: str) -> dict[str, Any]:
        identifiers = [
            value for value in self.text(
                "ps", "--quiet",
                "--filter", f"label=com.docker.compose.project={project}",
                "--filter", f"label=com.docker.compose.service={service}",
            ).splitlines() if value
        ]
        if len(identifiers) != 1:
            raise CollectionError("runtime service identity is absent or ambiguous")
        return self.inspect_container(identifiers[0])

    def inspect_container(self, identifier: str) -> dict[str, Any]:
        return self._one_json("inspect", identifier)

    def inspect_image(self, identifier: str) -> dict[str, Any]:
        return self._one_json("image", "inspect", identifier)

    def _one_json(self, *arguments: str) -> dict[str, Any]:
        try:
            payload = json.loads(self.text(*arguments))
        except json.JSONDecodeError as error:
            raise CollectionError("Docker metadata response is malformed") from error
        if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
            raise CollectionError("Docker metadata response is not singular")
        return payload[0]


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def exact(value: dict[str, Any], keys: set[str], label: str) -> None:
    if set(value) != keys:
        raise CollectionError(f"{label} key set drifted")


def regular_file(path: pathlib.Path, label: str) -> None:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise CollectionError(f"required {label} is missing") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise CollectionError(f"required {label} is not a regular file")
    if metadata.st_size <= 0 or metadata.st_size > MAX_FILE_BYTES:
        raise CollectionError(f"required {label} size is invalid")


def reject_sensitive(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = key.lower().replace("-", "_")
            if any(part in normalized for part in SENSITIVE_PARTS) and child not in (False, None, "", "REDACTED"):
                raise CollectionError("collector input contains secret-shaped material")
            reject_sensitive(child)
    elif isinstance(value, list):
        for child in value:
            reject_sensitive(child)


def duplicate_rejecting_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CollectionError("collector JSON has duplicate keys")
        result[key] = value
    return result


def read_json(path: pathlib.Path, label: str) -> dict[str, Any]:
    regular_file(path, label)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=duplicate_rejecting_pairs)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CollectionError(f"required {label} is malformed") from error
    if not isinstance(payload, dict):
        raise CollectionError(f"required {label} is not an object")
    reject_sensitive(payload)
    return payload


def read_env(path: pathlib.Path, label: str) -> dict[str, str]:
    regular_file(path, label)
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as error:
        raise CollectionError(f"required {label} is unreadable") from error
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise CollectionError(f"required {label} has malformed entry")
        key, value = line.split("=", 1)
        if ENV_KEY.fullmatch(key) is None or key in values:
            raise CollectionError(f"required {label} has unsafe entry")
        if any(part in key.lower() for part in SENSITIVE_PARTS) and value not in ("", "REDACTED"):
            raise CollectionError("collector state contains secret-shaped material")
        values[key] = value
    return values


def release_context(manifest_path: pathlib.Path) -> ReleaseContext:
    manifest = read_json(manifest_path, "release manifest")
    required = {
        "schema_version", "source_commit", "source_ref", "image_tag", "authority",
        "services", "profile_bindings", "deployment_compose_bundle",
    }
    if not required.issubset(manifest):
        raise CollectionError("release manifest is incomplete")
    if manifest["schema_version"] != "portal.release-manifest.v1" or manifest["source_ref"] != "refs/heads/main":
        raise CollectionError("release manifest is not protected-main")
    commit = manifest["source_commit"]
    if not isinstance(commit, str) or COMMIT.fullmatch(commit) is None or manifest["image_tag"] != f"sha-{commit}":
        raise CollectionError("release manifest identity is invalid")
    authority = manifest["authority"]
    if not isinstance(authority, dict) or any(
        authority.get(key) is not False for key in (
            "trading_system_release", "source_activation", "query_activation",
            "sse_activation", "command_activation", "database_copy_between_channels",
        )
    ):
        raise CollectionError("release manifest authority is widened")
    bundle = manifest["deployment_compose_bundle"]
    if not isinstance(bundle, dict) or not isinstance(bundle.get("sha256"), str) or SHA256.fullmatch(bundle["sha256"]) is None:
        raise CollectionError("release manifest Compose binding is invalid")

    images: dict[str, str] = {}
    services = manifest["services"]
    if not isinstance(services, list) or len(services) != len(ALL_SERVICES):
        raise CollectionError("release manifest service set is incomplete")
    for row in services:
        if not isinstance(row, dict):
            raise CollectionError("release manifest service is malformed")
        service = row.get("service_id")
        image = row.get("image")
        image_digest = row.get("image_digest")
        match = IMAGE.fullmatch(image) if isinstance(image, str) else None
        if service not in ALL_SERVICES or service in images or match is None or image_digest != match.group(1):
            raise CollectionError("release manifest service image is invalid")
        if row.get("command_enabled") is not False:
            raise CollectionError("release manifest service command authority is enabled")
        images[service] = image
    if set(images) != ALL_SERVICES:
        raise CollectionError("release manifest service coverage drifted")

    projects: dict[str, str] = {}
    bindings = manifest["profile_bindings"]
    if not isinstance(bindings, list):
        raise CollectionError("release manifest profile bindings are malformed")
    for row in bindings:
        if not isinstance(row, dict):
            raise CollectionError("release manifest profile binding is malformed")
        profile = row.get("profile_id")
        project = row.get("project_name")
        if profile in projects or not isinstance(project, str) or not project:
            raise CollectionError("release manifest profile identity is invalid")
        projects[profile] = project
    if projects.get("research_sgp_stable") != "portal-stable-v1-0-1" or projects.get("execution_aws_hk_dark") != "portal-execution-edge":
        raise CollectionError("release manifest project identity drifted")
    return ReleaseContext(
        source_commit=commit,
        image_tag=manifest["image_tag"],
        manifest_sha256=digest(manifest_path),
        compose_bundle_sha256=bundle["sha256"],
        images=images,
        sgp_project=projects["research_sgp_stable"],
        aws_project=projects["execution_aws_hk_dark"],
    )


def env_values(container: dict[str, Any]) -> dict[str, str]:
    config = container.get("Config")
    rows = config.get("Env") if isinstance(config, dict) else None
    if not isinstance(rows, list):
        raise CollectionError("runtime environment metadata is malformed")
    values: dict[str, str] = {}
    for entry in rows:
        if not isinstance(entry, str) or "=" not in entry:
            raise CollectionError("runtime environment metadata is malformed")
        key, value = entry.split("=", 1)
        if ENV_KEY.fullmatch(key) is None or key in values:
            raise CollectionError("runtime environment metadata is unsafe")
        values[key] = value
    return values


def inspect_service(
    docker: DockerMetadata,
    *,
    project: str,
    service: str,
    expected_image: str,
    source_commit: str,
) -> dict[str, str]:
    container = docker.one_container(project, service)
    config = container.get("Config")
    state = container.get("State")
    labels = config.get("Labels") if isinstance(config, dict) else None
    if not isinstance(labels, dict) or not isinstance(state, dict):
        raise CollectionError("runtime service metadata is malformed")
    if labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") != service:
        raise CollectionError("runtime service Compose identity drifted")
    if labels.get("org.opencontainers.image.revision") != source_commit:
        raise CollectionError("runtime service source revision does not match release")
    health = state.get("Health")
    if state.get("Running") is not True or not isinstance(health, dict) or health.get("Status") != "healthy":
        raise CollectionError("runtime service health is not healthy")
    image_id = container.get("Image")
    if not isinstance(image_id, str) or not image_id:
        raise CollectionError("runtime service image identity is malformed")
    image = docker.inspect_image(image_id)
    repo_digests = image.get("RepoDigests")
    if not isinstance(repo_digests, list) or expected_image not in repo_digests:
        raise CollectionError("runtime service image does not match release digest")
    return env_values(container)


def assert_no_direct_source_env(values: dict[str, str]) -> None:
    if any(DIRECT_SOURCE_ENV.search(key) for key in values):
        raise CollectionError("runtime exposes prohibited direct-source environment")


def validate_deployment_state(values: dict[str, str], release: ReleaseContext) -> None:
    expected = {
        "SOURCE_BRANCH": "main",
        "SOURCE_COMMIT": release.source_commit,
        "IMAGE_TAG": release.image_tag,
        "RELEASE_MANIFEST_SHA256": release.manifest_sha256,
        "DEPLOYMENT_COMPOSE_BUNDLE_SHA256": release.compose_bundle_sha256,
    }
    expected.update({env_key: release.images[service] for service, env_key in SGP_SERVICES.items()})
    if any(values.get(key) != value for key, value in expected.items()):
        raise CollectionError("SGP deployment state does not match release")


def collect_sgp(release: ReleaseContext, deployment_state: pathlib.Path, docker: DockerMetadata) -> dict[str, str]:
    validate_deployment_state(read_env(deployment_state, "SGP deployment state"), release)
    observed: dict[str, dict[str, str]] = {}
    for service in SGP_SERVICES:
        observed[service] = inspect_service(
            docker,
            project=release.sgp_project,
            service=service,
            expected_image=release.images[service],
            source_commit=release.source_commit,
        )
    control = observed["control-api"]
    if control.get("FEATURE_EXECUTION_COMMAND_RELAY") != "false":
        raise CollectionError("SGP command relay is enabled")
    for key in ("FEATURE_EXECUTION_LIVE_MUTATION", "FEATURE_EXECUTION_DIRECT_SOURCE_ACCESS"):
        if key in control and control[key] != "false":
            raise CollectionError("SGP authority is widened")
    for values in observed.values():
        assert_no_direct_source_env(values)
    return {
        "SCHEMA_VERSION": "portal.sgp-runtime-binding.v1",
        "SOURCE_COMMIT": release.source_commit,
        "IMAGE_TAG": release.image_tag,
        "RELEASE_MANIFEST_SHA256": release.manifest_sha256,
        "DEPLOYMENT_COMPOSE_BUNDLE_SHA256": release.compose_bundle_sha256,
        **{env_key: release.images[service] for service, env_key in SGP_SERVICES.items()},
        "COMMANDS_ENABLED": "false",
        "LIVE_MUTATION_ENABLED": "false",
        "DIRECT_SOURCE_ACCESS": "false",
        "HEALTH": "HEALTHY",
    }


def collect_aws_hk(release: ReleaseContext, docker: DockerMetadata) -> dict[str, Any]:
    observed: dict[str, list[dict[str, str]]] = {service: [] for service in AWS_SERVICES}
    for _profile, suffix in AWS_PROJECT_SUFFIXES:
        project = release.aws_project + suffix
        for service in AWS_SERVICES:
            values = inspect_service(
                docker,
                project=project,
                service=service,
                expected_image=release.images[service],
                source_commit=release.source_commit,
            )
            assert_no_direct_source_env(values)
            if service == "execution-edge":
                if values.get("EDGE_COMMAND_RELAY_ENABLED") != "false":
                    raise CollectionError("AWS-HK command relay is enabled")
                for key in ("EDGE_LIVE_MUTATION_ENABLED", "EDGE_DIRECT_SOURCE_ACCESS"):
                    if key in values and values[key] != "false":
                        raise CollectionError("AWS-HK authority is widened")
            observed[service].append(values)
    if any(len(values) != len(AWS_PROJECT_SUFFIXES) for values in observed.values()):
        raise CollectionError("AWS-HK profile coverage is incomplete")
    return {
        "schema_version": "portal.execution-edge-runtime-binding.v1",
        "source_commit": release.source_commit,
        "image_tag": release.image_tag,
        "release_manifest_sha256": release.manifest_sha256,
        "deployment_compose_bundle_sha256": release.compose_bundle_sha256,
        "services": [
            {
                "service_id": service,
                "image_digest": IMAGE.fullmatch(release.images[service]).group(1),  # type: ignore[union-attr]
                "health": "HEALTHY",
            }
            for service in AWS_SERVICES
        ],
        "command_relay_enabled": False,
        "live_mutation_enabled": False,
        "direct_source_access": False,
        "health": "HEALTHY",
    }


def safe_write(path: pathlib.Path, content: str, replace: bool) -> None:
    parent = path.parent
    try:
        parent_metadata = parent.lstat()
    except OSError as error:
        raise CollectionError("runtime marker output directory is missing") from error
    if stat.S_ISLNK(parent_metadata.st_mode) or not stat.S_ISDIR(parent_metadata.st_mode):
        raise CollectionError("runtime marker output directory is unsafe")
    try:
        existing = path.lstat()
    except FileNotFoundError:
        existing = None
    except OSError as error:
        raise CollectionError("runtime marker output is inaccessible") from error
    if existing is not None:
        if stat.S_ISLNK(existing.st_mode) or not stat.S_ISREG(existing.st_mode):
            raise CollectionError("runtime marker output is unsafe")
        if not replace:
            raise CollectionError("runtime marker already exists; use --replace after a new verified release")
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    except OSError as error:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise CollectionError("runtime marker could not be written atomically") from error


def write_sgp_marker(values: dict[str, str], output: pathlib.Path, replace: bool) -> None:
    ordered = [
        "SCHEMA_VERSION", "SOURCE_COMMIT", "IMAGE_TAG", "RELEASE_MANIFEST_SHA256",
        "DEPLOYMENT_COMPOSE_BUNDLE_SHA256", *SGP_SERVICES.values(),
        "COMMANDS_ENABLED", "LIVE_MUTATION_ENABLED", "DIRECT_SOURCE_ACCESS", "HEALTH",
    ]
    if set(values) != set(ordered):
        raise CollectionError("SGP runtime marker has an unsafe key set")
    safe_write(output, "".join(f"{key}={values[key]}\n" for key in ordered), replace)


def write_aws_marker(values: dict[str, Any], output: pathlib.Path, replace: bool) -> None:
    exact(values, {
        "schema_version", "source_commit", "image_tag", "release_manifest_sha256",
        "deployment_compose_bundle_sha256", "services", "command_relay_enabled",
        "live_mutation_enabled", "direct_source_access", "health",
    }, "AWS-HK runtime marker")
    safe_write(output, json.dumps(values, indent=2, sort_keys=True) + "\n", replace)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="cell", required=True)
    for name in ("sgp", "aws-hk"):
        command = commands.add_parser(name)
        command.add_argument("--release-manifest", type=pathlib.Path, required=True)
        command.add_argument("--output", type=pathlib.Path, required=True)
        command.add_argument("--docker-bin", default="docker")
        command.add_argument("--replace", action="store_true")
        if name == "sgp":
            command.add_argument("--deployment-state", type=pathlib.Path, required=True)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        release = release_context(args.release_manifest)
        docker = DockerMetadata(args.docker_bin)
        if args.cell == "sgp":
            marker = collect_sgp(release, args.deployment_state, docker)
            write_sgp_marker(marker, args.output, args.replace)
        else:
            marker = collect_aws_hk(release, docker)
            write_aws_marker(marker, args.output, args.replace)
        print(json.dumps({
            "decision": "EDS12_RUNTIME_BINDING_MARKER_COLLECTED",
            "cell": args.cell,
            "source_commit": release.source_commit,
            "release_manifest_sha256": release.manifest_sha256,
            "output_sha256": digest(args.output),
            "runtime_effect": "NONE",
        }, sort_keys=True))
        return 0
    except CollectionError as error:
        print(json.dumps({"decision": "NO_GO", "reason": str(error), "runtime_effect": "NONE"}, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
