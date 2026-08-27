#!/usr/bin/env python3
"""N14A immutable Portal release-pack generator and fail-closed verifier."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil
import stat
import subprocess
import sys
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST_DIR = ROOT / "deploy/manifests"
ZERO_DIGEST = "sha256:" + "0" * 64
ZERO_COMMIT = "0" * 40
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
IMAGE = re.compile(r"[a-z0-9][a-z0-9._/-]*@(?P<digest>sha256:[0-9a-f]{64})")
MAX_JSON_BYTES = 16 * 1024 * 1024
SERVICES = {
    "portal-api": "SGP_RESEARCH",
    "portal-web": "SGP_RESEARCH",
    "control-api": "SGP_RESEARCH",
    "roadmap-task-board-api": "SGP_RESEARCH",
    "execution-edge": "AWS_HK_EXECUTION",
    "source-proxy": "AWS_HK_EXECUTION",
}
GATES = {
    "contracts", "control_api", "research_backend", "planning_backend",
    "frontend", "migration_restore", "channel_isolation", "rollback_forward_fix",
}
AUTHORITY = {
    "portal_release": True,
    "trading_system_release": False,
    "source_activation": False,
    "query_activation": False,
    "sse_activation": False,
    "command_activation": False,
    "database_copy_between_channels": False,
}
SENSITIVE_KEYS = {
    "password", "secret", "token", "api_key", "private_key", "credential",
    "cookie", "authorization", "database_url", "dsn", "redis_url", "broker_key",
}


class ReleaseError(ValueError):
    """Stable fail-closed N14A rejection."""


def _duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ReleaseError("JSON contains a duplicate object key")
        result[key] = value
    return result


def read_json(path: pathlib.Path, maximum: int = MAX_JSON_BYTES) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ReleaseError(f"required release artifact is missing: {path.name}") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise ReleaseError("release artifacts must be regular non-symlinks")
    if metadata.st_size <= 0 or metadata.st_size > maximum:
        raise ReleaseError("release artifact size is outside the declared bound")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_duplicates)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ReleaseError(f"invalid JSON release artifact: {path.name}") from exc
    if not isinstance(payload, dict):
        raise ReleaseError(f"release artifact must be an object: {path.name}")
    reject_sensitive(payload)
    return payload


def reject_sensitive(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = key.lower().replace("-", "_")
            if normalized in SENSITIVE_KEYS and child not in (False, None, "", "REDACTED"):
                raise ReleaseError("release pack contains secret-shaped material")
            reject_sensitive(child)
    elif isinstance(value, list):
        for child in value:
            reject_sensitive(child)


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def exact(payload: dict[str, Any], keys: set[str], label: str) -> None:
    if set(payload) != keys:
        raise ReleaseError(f"{label} schema keys are not exact")


def valid_digest(value: Any, allow_zero: bool = False) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None and (allow_zero or value != ZERO_DIGEST)


def safe_pack_path(pack: pathlib.Path, relative: str) -> pathlib.Path:
    item = pathlib.PurePosixPath(relative)
    if item.is_absolute() or ".." in item.parts or not item.parts:
        raise ReleaseError("release artifact path is unsafe")
    return pack.joinpath(*item.parts)


def migration_chain() -> tuple[int, str]:
    directory = ROOT / "apps/control-api/migrations"
    files = sorted(directory.glob("*.sql"))
    if not files:
        raise ReleaseError("Portal migration chain is empty")
    hasher = hashlib.sha256()
    for path in files:
        hasher.update(path.name.encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(bytes.fromhex(digest(path).split(":", 1)[1]))
        hasher.update(b"\n")
    return len(files), "sha256:" + hasher.hexdigest()


def read_env(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def validate_profiles(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    exact(payload, {"schema_version", "profiles"}, "deployment profiles")
    if payload["schema_version"] != "portal.deployment-profiles.v1":
        raise ReleaseError("deployment profile revision mismatch")
    rows = payload["profiles"]
    if not isinstance(rows, list) or len(rows) != 2:
        raise ReleaseError("exactly two deployment profiles are required")
    required = {
        "profile_id", "cell", "source_branch", "compose_file", "project_name",
        "loopback_port", "public_origin", "database_namespace", "mutable_volumes",
        "services", "execution_source_enabled", "query_enabled", "sse_enabled", "command_enabled",
    }
    profiles: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ReleaseError("deployment profile row must be an object")
        exact(row, required, "deployment profile")
        identifier = row["profile_id"]
        if identifier in profiles or identifier not in {"research_sgp_stable", "execution_aws_hk_dark"}:
            raise ReleaseError("deployment profile identity is invalid")
        if any(row[key] is not False for key in ("execution_source_enabled", "query_enabled", "sse_enabled", "command_enabled")):
            raise ReleaseError("N14A deployment profiles must remain source-dark")
        compose = ROOT / row["compose_file"]
        if not compose.is_file() or compose.is_symlink():
            raise ReleaseError("deployment profile compose authority is missing")
        if set(row["services"]) != {name for name, cell in SERVICES.items() if cell == row["cell"]}:
            raise ReleaseError("deployment profile service ownership drifted")
        profiles[identifier] = row
    research = profiles["research_sgp_stable"]
    execution = profiles["execution_aws_hk_dark"]
    if research["source_branch"] != "main" or research["project_name"] != "portal-stable" or research["loopback_port"] != 18081 or research["public_origin"] != "https://portal.primusspark.com":
        raise ReleaseError("stable SGP profile identity drifted")
    if execution["source_branch"] != "IMAGE_ONLY" or execution["project_name"] != "portal-execution-edge" or execution["loopback_port"] is not None or execution["public_origin"] is not None:
        raise ReleaseError("AWS-HK profile is not image-only/private")
    if research["project_name"] == execution["project_name"] or research["database_namespace"] == execution["database_namespace"]:
        raise ReleaseError("deployment profiles share a project or database namespace")
    if set(research["mutable_volumes"]).intersection(execution["mutable_volumes"]):
        raise ReleaseError("deployment profiles share a mutable volume")

    dev = read_env(ROOT / "deploy/.env.development.example")
    stable = read_env(ROOT / "deploy/.env.production.example")
    expected_dev = {
        "PORTAL_STACK_NAME": "portal", "PORTAL_HTTP_PORT": "8080",
        "PORTAL_IMAGE_TAG": "dev", "PORTAL_PUBLIC_ORIGIN": "https://dev-portal.primusspark.com",
    }
    expected_stable = {
        "PORTAL_STACK_NAME": "portal-stable", "PORTAL_HTTP_PORT": "18081",
        "PORTAL_PUBLIC_ORIGIN": "https://portal.primusspark.com",
    }
    if any(dev.get(key) != value for key, value in expected_dev.items()):
        raise ReleaseError("development release-channel defaults drifted")
    if any(stable.get(key) != value for key, value in expected_stable.items()):
        raise ReleaseError("stable release-channel defaults drifted")
    if not re.fullmatch(r"sha-[A-Z0-9_-]+", stable.get("PORTAL_IMAGE_TAG", "")):
        raise ReleaseError("stable release-channel image placeholder is not immutable-shaped")
    if dev["PORTAL_STACK_NAME"] == stable["PORTAL_STACK_NAME"] or dev["PORTAL_HTTP_PORT"] == stable["PORTAL_HTTP_PORT"] or dev["PORTAL_PUBLIC_ORIGIN"] == stable["PORTAL_PUBLIC_ORIGIN"]:
        raise ReleaseError("development and stable channels are not isolated")
    return profiles


def validate_compatibility(payload: dict[str, Any]) -> None:
    exact(payload, {"schema_version", "delivery_profile", "portal_contracts", "services", "trading_system", "activation"}, "compatibility matrix")
    if payload["schema_version"] != "portal.release-compatibility-matrix.v1" or payload["delivery_profile"] != "source-dark":
        raise ReleaseError("compatibility matrix identity mismatch")
    if {row.get("service_id") for row in payload["services"] if isinstance(row, dict)} != set(SERVICES):
        raise ReleaseError("compatibility service matrix is incomplete")
    trading = payload["trading_system"]
    if trading != {
        "owner_campaign_revision": "portal.execution.trading-system-owner-request.v2",
        "owner_return_status": "PENDING_N14B",
        "source_contract": "UNBOUND", "source_image_digest": "UNBOUND", "gateway_image_digest": "UNBOUND",
    }:
        raise ReleaseError("N14A cannot bind or accept Trading System release authority")
    if any(value is not False for value in payload["activation"].values()):
        raise ReleaseError("compatibility matrix activated a runtime capability")


def validate_evidence(pack: pathlib.Path, payload: dict[str, Any], mode: str, source_commit: str) -> dict[str, dict[str, Any]]:
    exact(payload, {"schema_version", "source_commit", "synthetic", "images", "quality_gates", "source_traffic_observed", "trading_system_contacted", "stable_state_mutated"}, "candidate evidence")
    if payload["schema_version"] != "portal.release-candidate-evidence.v1" or payload["source_commit"] != source_commit:
        raise ReleaseError("candidate evidence identity mismatch")
    if any(payload[key] is not False for key in ("source_traffic_observed", "trading_system_contacted", "stable_state_mutated")):
        raise ReleaseError("N14A evidence crossed a forbidden runtime boundary")
    rows = payload["images"]
    if not isinstance(rows, list) or len(rows) != len(SERVICES):
        raise ReleaseError("candidate image evidence is incomplete")
    images: dict[str, dict[str, Any]] = {}
    image_keys = {"service_id", "image_digest", "signature", "sbom", "provenance", "vulnerability"}
    file_keys = {"verified", "file", "sha256"}
    vulnerability_keys = {"scanner", "file", "sha256", "critical", "high", "disposition"}
    for row in rows:
        if not isinstance(row, dict):
            raise ReleaseError("image evidence row must be an object")
        exact(row, image_keys, "image evidence")
        service = row["service_id"]
        if service not in SERVICES or service in images:
            raise ReleaseError("candidate image evidence service is invalid")
        allow_zero = mode == "template"
        if not valid_digest(row["image_digest"], allow_zero):
            raise ReleaseError("candidate image digest is invalid")
        for kind in ("signature", "sbom", "provenance"):
            item = row[kind]
            exact(item, file_keys, f"{kind} evidence")
            if mode == "template":
                if item["verified"] is not False or item["sha256"] != ZERO_DIGEST:
                    raise ReleaseError("template image evidence became authoritative")
            else:
                if item["verified"] is not True:
                    raise ReleaseError(f"{kind} evidence is not verified")
                path = safe_pack_path(pack, item["file"])
                read_json(path)
                if digest(path) != item["sha256"]:
                    raise ReleaseError(f"{kind} evidence digest mismatch")
        vulnerability = row["vulnerability"]
        exact(vulnerability, vulnerability_keys, "vulnerability evidence")
        if vulnerability["scanner"] != "trivy" or type(vulnerability["critical"]) is not int or type(vulnerability["high"]) is not int:
            raise ReleaseError("vulnerability evidence shape is invalid")
        if vulnerability["critical"] != 0:
            raise ReleaseError("critical image vulnerability is release-blocking")
        if mode == "template":
            if vulnerability["sha256"] != ZERO_DIGEST or vulnerability["disposition"] != "PENDING":
                raise ReleaseError("template vulnerability evidence became authoritative")
        else:
            path = safe_pack_path(pack, vulnerability["file"])
            read_json(path)
            if digest(path) != vulnerability["sha256"]:
                raise ReleaseError("vulnerability evidence digest mismatch")
            expected = "NO_FINDINGS" if vulnerability["high"] == 0 else "OWNER_REVIEW_REQUIRED"
            if vulnerability["disposition"] != expected:
                raise ReleaseError("high-vulnerability disposition is dishonest")
        images[service] = row
    if set(images) != set(SERVICES):
        raise ReleaseError("candidate image evidence service set is incomplete")
    gates = payload["quality_gates"]
    if not isinstance(gates, list) or {item.get("gate") for item in gates if isinstance(item, dict)} != GATES or len(gates) != len(GATES):
        raise ReleaseError("release quality gate coverage is incomplete")
    for gate in gates:
        exact(gate, {"gate", "passed", "evidence_sha256"}, "release quality gate")
        if mode == "template":
            if gate["passed"] is not False or gate["evidence_sha256"] != ZERO_DIGEST:
                raise ReleaseError("template gate became authoritative")
        elif gate["passed"] is not True or not valid_digest(gate["evidence_sha256"]):
            raise ReleaseError("required release quality gate did not pass")
    if (mode == "template") != (payload["synthetic"] is True):
        raise ReleaseError("candidate evidence synthetic classification is invalid")
    return images


def validate_manifest(pack: pathlib.Path, payload: dict[str, Any], mode: str) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    required = {"schema_version", "release_id", "source_commit", "source_ref", "image_tag", "delivery_profile", "created_at", "authority", "services", "profile_bindings", "compatibility_matrix", "migration_chain", "candidate_evidence", "rollback"}
    exact(payload, required, "release manifest")
    if payload["schema_version"] != "portal.release-manifest.v1" or payload["delivery_profile"] != "source-dark" or payload["authority"] != AUTHORITY:
        raise ReleaseError("release manifest authority widened or identity drifted")
    commit = payload["source_commit"]
    if not isinstance(commit, str) or COMMIT.fullmatch(commit) is None:
        raise ReleaseError("release source commit is invalid")
    if payload["source_ref"] != "refs/heads/main" or payload["image_tag"] != f"sha-{commit}":
        raise ReleaseError("release source must be an immutable main commit")
    allow_zero = mode == "template"
    if not allow_zero and commit == ZERO_COMMIT:
        raise ReleaseError("candidate release uses a zero source commit")
    services = payload["services"]
    if not isinstance(services, list) or len(services) != len(SERVICES):
        raise ReleaseError("release manifest service set is incomplete")
    service_map: dict[str, dict[str, Any]] = {}
    for row in services:
        exact(row, {"service_id", "cell", "image", "image_digest", "source_enabled", "command_enabled"}, "release service")
        service = row["service_id"]
        if service not in SERVICES or service in service_map or row["cell"] != SERVICES[service]:
            raise ReleaseError("release service ownership is invalid")
        match = IMAGE.fullmatch(row["image"]) if isinstance(row["image"], str) else None
        if match is None or match.group("digest") != row["image_digest"] or not valid_digest(row["image_digest"], allow_zero):
            raise ReleaseError("release service image is not digest-pinned")
        if row["source_enabled"] is not False or row["command_enabled"] is not False:
            raise ReleaseError("release service activated a forbidden capability")
        service_map[service] = row
    profiles_path = MANIFEST_DIR / "deployment-profiles.source-dark.json"
    profiles = validate_profiles(read_json(profiles_path))
    bindings = payload["profile_bindings"]
    if not isinstance(bindings, list) or len(bindings) != 2:
        raise ReleaseError("release profile bindings are incomplete")
    for binding in bindings:
        exact(binding, {"profile_id", "compose_file", "compose_sha256", "project_name", "database_namespace"}, "profile binding")
        profile = profiles.get(binding["profile_id"])
        if not profile or any(binding[key] != profile[key] for key in ("compose_file", "project_name", "database_namespace")):
            raise ReleaseError("release profile binding drifted")
        actual = digest(ROOT / binding["compose_file"])
        if mode == "template":
            if binding["compose_sha256"] != ZERO_DIGEST:
                raise ReleaseError("template compose digest became authoritative")
        elif binding["compose_sha256"] != actual:
            raise ReleaseError("release compose digest mismatch")

    matrix_ref = payload["compatibility_matrix"]
    exact(matrix_ref, {"file", "sha256"}, "compatibility reference")
    evidence_ref = payload["candidate_evidence"]
    exact(evidence_ref, {"file", "sha256"}, "candidate evidence reference")
    if mode == "template":
        matrix = read_json(MANIFEST_DIR / "compatibility-matrix.source-dark.json")
        evidence = read_json(MANIFEST_DIR / "release-candidate-evidence.template.json")
        if matrix_ref["sha256"] != ZERO_DIGEST or evidence_ref["sha256"] != ZERO_DIGEST:
            raise ReleaseError("template release references became authoritative")
    else:
        matrix_path = safe_pack_path(pack, matrix_ref["file"])
        evidence_path = safe_pack_path(pack, evidence_ref["file"])
        matrix = read_json(matrix_path)
        evidence = read_json(evidence_path)
        if digest(matrix_path) != matrix_ref["sha256"] or digest(evidence_path) != evidence_ref["sha256"]:
            raise ReleaseError("release manifest referenced artifact digest mismatch")
    validate_compatibility(matrix)
    images = validate_evidence(pack, evidence, mode, commit)
    if mode != "template" and any(service_map[key]["image_digest"] != images[key]["image_digest"] for key in SERVICES):
        raise ReleaseError("release manifest and image evidence digests differ")

    chain = payload["migration_chain"]
    exact(chain, {"directory", "file_count", "sha256", "policy"}, "migration chain")
    actual_count, actual_digest = migration_chain()
    if chain["directory"] != "apps/control-api/migrations" or chain["policy"] != "FORWARD_ONLY_WITH_PROVEN_RESTORE_AND_FORWARD_FIX":
        raise ReleaseError("migration policy drifted")
    if mode == "template":
        if chain["file_count"] != 0 or chain["sha256"] != ZERO_DIGEST:
            raise ReleaseError("template migration evidence became authoritative")
    elif chain["file_count"] != actual_count or chain["sha256"] != actual_digest:
        raise ReleaseError("migration chain digest mismatch")
    rollback = payload["rollback"]
    exact(rollback, {"previous_release_manifest_sha256", "strategy", "runbook", "runbook_sha256"}, "rollback contract")
    if rollback["strategy"] != "PER_CELL_SIGNED_IMAGE_ROLLBACK_FORWARD_FIX_DB" or rollback["runbook"] != "deploy/runbooks/portal-n14a-source-dark-release-and-rollback.md":
        raise ReleaseError("release rollback contract drifted")
    if mode == "template":
        if rollback["runbook_sha256"] != ZERO_DIGEST:
            raise ReleaseError("template rollback evidence became authoritative")
    elif rollback["runbook_sha256"] != digest(ROOT / rollback["runbook"]):
        raise ReleaseError("release rollback runbook digest mismatch")
    return service_map, evidence


def validate_decision(path: pathlib.Path, manifest_path: pathlib.Path, evidence_path: pathlib.Path) -> dict[str, Any]:
    payload = read_json(path)
    required = {"schema_version", "decision_id", "release_manifest_sha256", "candidate_evidence_sha256", "decision", "decided_by", "decided_at", "rationale", "scope", "vulnerability_evidence_accepted", "deployment_authorized", "source_activation_authorized", "query_activation_authorized", "sse_activation_authorized", "command_activation_authorized", "trading_system_release_accepted"}
    exact(payload, required, "release owner decision")
    if payload["schema_version"] != "portal.release-owner-decision.v1" or payload["release_manifest_sha256"] != digest(manifest_path) or payload["candidate_evidence_sha256"] != digest(evidence_path):
        raise ReleaseError("owner decision is not bound to the exact release")
    if payload["decision"] != "ACCEPT_SOURCE_DARK" or not isinstance(payload["decided_by"], str) or len(payload["decided_by"]) < 3 or not isinstance(payload["decided_at"], str):
        raise ReleaseError("source-dark release is not owner-accepted")
    if payload["scope"] != "PORTAL_SOURCE_DARK_ONLY" or payload["vulnerability_evidence_accepted"] is not True or payload["deployment_authorized"] is not True:
        raise ReleaseError("owner decision scope or vulnerability acceptance is incomplete")
    for key in ("source_activation_authorized", "query_activation_authorized", "sse_activation_authorized", "command_activation_authorized", "trading_system_release_accepted"):
        if payload[key] is not False:
            raise ReleaseError("N14A owner decision widened external/runtime authority")
    if not isinstance(payload["rationale"], str) or not 8 <= len(payload["rationale"].strip()) <= 2000:
        raise ReleaseError("owner decision rationale is invalid")
    return payload


def verify_blob(kind: str, payload: pathlib.Path, signature: pathlib.Path, args: argparse.Namespace) -> None:
    if kind == "openssl":
        if args.public_key is None:
            raise ReleaseError("OpenSSL verification requires --public-key")
        command = ["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", str(args.public_key), "-rawin", "-in", str(payload), "-sigfile", str(signature)]
    elif kind == "cosign":
        if not args.certificate_identity or not args.certificate_issuer:
            raise ReleaseError("Cosign verification requires certificate identity and issuer")
        command = ["cosign", "verify-blob", "--bundle", str(signature), "--certificate-identity", args.certificate_identity, "--certificate-oidc-issuer", args.certificate_issuer, str(payload)]
    else:
        raise ReleaseError("accepted release requires a supported signature kind")
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        raise ReleaseError("release signature verification failed")


def trivy_counts(payload: dict[str, Any]) -> tuple[int, int]:
    critical = high = 0
    results = payload.get("Results", [])
    if not isinstance(results, list):
        raise ReleaseError("Trivy evidence Results must be an array")
    for result in results:
        if not isinstance(result, dict):
            continue
        vulnerabilities = result.get("Vulnerabilities") or []
        if not isinstance(vulnerabilities, list):
            raise ReleaseError("Trivy vulnerabilities must be an array")
        for finding in vulnerabilities:
            severity = finding.get("Severity") if isinstance(finding, dict) else None
            critical += severity == "CRITICAL"
            high += severity == "HIGH"
    return critical, high


def generate(args: argparse.Namespace) -> dict[str, Any]:
    if args.source_ref != "refs/heads/main" or COMMIT.fullmatch(args.source_commit or "") is None or args.source_commit == ZERO_COMMIT:
        raise ReleaseError("generation requires an exact nonzero main commit")
    output = args.output_dir.resolve()
    if output.exists() and any(output.iterdir()):
        raise ReleaseError("release output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)
    image_args: dict[str, str] = {}
    for raw in args.image:
        service, separator, image = raw.partition("=")
        if not separator or service not in SERVICES or service in image_args or IMAGE.fullmatch(image) is None:
            raise ReleaseError("--image must provide each known service once as service=image@digest")
        image_args[service] = image
    if set(image_args) != set(SERVICES):
        raise ReleaseError("generation requires all six service images")
    gate_args: dict[str, pathlib.Path] = {}
    for raw in args.gate_evidence:
        gate, separator, value = raw.partition("=")
        path = pathlib.Path(value)
        if not separator or gate not in GATES or gate in gate_args or not path.is_file() or path.is_symlink():
            raise ReleaseError("--gate-evidence must provide each required gate as gate=file")
        gate_args[gate] = path
    if set(gate_args) != GATES:
        raise ReleaseError("generation requires all release quality gates")

    shutil.copyfile(MANIFEST_DIR / "compatibility-matrix.source-dark.json", output / "compatibility-matrix.json")
    shutil.copyfile(MANIFEST_DIR / "deployment-profiles.source-dark.json", output / "deployment-profiles.json")
    evidence_dir = output / "evidence"
    evidence_dir.mkdir()
    image_rows = []
    for service in SERVICES:
        image = image_args[service]
        image_digest = IMAGE.fullmatch(image).group("digest")  # type: ignore[union-attr]
        row: dict[str, Any] = {"service_id": service, "image_digest": image_digest}
        for kind in ("signature", "sbom", "provenance", "trivy"):
            source = args.evidence_dir / f"{service}-{kind}.json"
            read_json(source)
            target = evidence_dir / source.name
            shutil.copyfile(source, target)
            if kind != "trivy":
                row[kind] = {"verified": True, "file": f"evidence/{target.name}", "sha256": digest(target)}
        trivy_path = evidence_dir / f"{service}-trivy.json"
        critical, high = trivy_counts(read_json(trivy_path))
        if critical:
            raise ReleaseError("critical image vulnerability is release-blocking")
        row["vulnerability"] = {
            "scanner": "trivy", "file": f"evidence/{trivy_path.name}", "sha256": digest(trivy_path),
            "critical": critical, "high": high,
            "disposition": "NO_FINDINGS" if high == 0 else "OWNER_REVIEW_REQUIRED",
        }
        image_rows.append(row)
    gate_rows = []
    gates_dir = output / "gates"
    gates_dir.mkdir()
    for gate in sorted(GATES):
        source = gate_args[gate]
        target = gates_dir / f"{gate}.txt"
        shutil.copyfile(source, target)
        gate_rows.append({"gate": gate, "passed": True, "evidence_sha256": digest(target)})
    evidence = {
        "schema_version": "portal.release-candidate-evidence.v1",
        "source_commit": args.source_commit, "synthetic": False,
        "images": image_rows, "quality_gates": gate_rows,
        "source_traffic_observed": False, "trading_system_contacted": False, "stable_state_mutated": False,
    }
    evidence_path = output / "release-candidate-evidence.json"
    write_json(evidence_path, evidence)
    profiles = validate_profiles(read_json(MANIFEST_DIR / "deployment-profiles.source-dark.json"))
    service_rows = []
    for service, cell in SERVICES.items():
        match = IMAGE.fullmatch(image_args[service])
        service_rows.append({"service_id": service, "cell": cell, "image": image_args[service], "image_digest": match.group("digest"), "source_enabled": False, "command_enabled": False})  # type: ignore[union-attr]
    bindings = []
    for profile in profiles.values():
        bindings.append({
            "profile_id": profile["profile_id"], "compose_file": profile["compose_file"],
            "compose_sha256": digest(ROOT / profile["compose_file"]), "project_name": profile["project_name"],
            "database_namespace": profile["database_namespace"],
        })
    count, chain = migration_chain()
    runbook = ROOT / "deploy/runbooks/portal-n14a-source-dark-release-and-rollback.md"
    if not runbook.is_file():
        raise ReleaseError("N14A rollback runbook is missing")
    release_id = "rel_" + args.source_commit[:26].upper()
    manifest = {
        "schema_version": "portal.release-manifest.v1", "release_id": release_id,
        "source_commit": args.source_commit, "source_ref": args.source_ref,
        "image_tag": f"sha-{args.source_commit}", "delivery_profile": "source-dark",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "authority": AUTHORITY, "services": service_rows, "profile_bindings": bindings,
        "compatibility_matrix": {"file": "compatibility-matrix.json", "sha256": digest(output / "compatibility-matrix.json")},
        "migration_chain": {"directory": "apps/control-api/migrations", "file_count": count, "sha256": chain, "policy": "FORWARD_ONLY_WITH_PROVEN_RESTORE_AND_FORWARD_FIX"},
        "candidate_evidence": {"file": "release-candidate-evidence.json", "sha256": digest(evidence_path)},
        "rollback": {
            "previous_release_manifest_sha256": args.previous_manifest_sha256,
            "strategy": "PER_CELL_SIGNED_IMAGE_ROLLBACK_FORWARD_FIX_DB",
            "runbook": "deploy/runbooks/portal-n14a-source-dark-release-and-rollback.md",
            "runbook_sha256": digest(runbook),
        },
    }
    write_json(output / "release-manifest.json", manifest)
    validate_manifest(output, read_json(output / "release-manifest.json"), "candidate")
    return {"decision": "N14A_RELEASE_CANDIDATE_GENERATED", "release_id": release_id, "release_manifest_sha256": digest(output / "release-manifest.json"), "source_activation": False}


def create_decision(args: argparse.Namespace) -> dict[str, Any]:
    pack = args.pack_dir.resolve()
    manifest_path = pack / "release-manifest.json"
    manifest = read_json(manifest_path)
    _, evidence = validate_manifest(pack, manifest, "candidate")
    evidence_path = pack / manifest["candidate_evidence"]["file"]
    decision_id = "reldec_" + digest(manifest_path).split(":", 1)[1][:26].upper()
    payload = {
        "schema_version": "portal.release-owner-decision.v1", "decision_id": decision_id,
        "release_manifest_sha256": digest(manifest_path), "candidate_evidence_sha256": digest(evidence_path),
        "decision": "ACCEPT_SOURCE_DARK", "decided_by": args.decided_by,
        "decided_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "rationale": args.rationale, "scope": "PORTAL_SOURCE_DARK_ONLY",
        "vulnerability_evidence_accepted": True, "deployment_authorized": True,
        "source_activation_authorized": False, "query_activation_authorized": False,
        "sse_activation_authorized": False, "command_activation_authorized": False,
        "trading_system_release_accepted": False,
    }
    write_json(args.output, payload)
    validate_decision(args.output, manifest_path, evidence_path)
    return {"decision": "N14A_SOURCE_DARK_OWNER_DECISION_RECORDED", "decision_id": decision_id, "deployment_authorized": True, "source_activation": False, "high_findings": sum(row["vulnerability"]["high"] for row in evidence["images"])}


def validate_template() -> dict[str, Any]:
    validate_profiles(read_json(MANIFEST_DIR / "deployment-profiles.source-dark.json"))
    validate_compatibility(read_json(MANIFEST_DIR / "compatibility-matrix.source-dark.json"))
    validate_manifest(MANIFEST_DIR, read_json(MANIFEST_DIR / "release-manifest.template.json"), "template")
    decision = read_json(MANIFEST_DIR / "release-owner-decision.template.json")
    if decision["decision"] != "PENDING" or decision["deployment_authorized"] is not False:
        raise ReleaseError("template owner decision became authoritative")
    return {"decision": "N14A_SOURCE_DARK_TEMPLATE_VALID", "service_count": len(SERVICES), "deployment_authorized": False, "source_activation": False}


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--mode", choices=("template", "candidate", "acceptance"), required=True)
    verify.add_argument("--pack-dir", type=pathlib.Path)
    verify.add_argument("--decision", type=pathlib.Path)
    verify.add_argument("--signature-kind", choices=("openssl", "cosign"))
    verify.add_argument("--manifest-signature", type=pathlib.Path)
    verify.add_argument("--decision-signature", type=pathlib.Path)
    verify.add_argument("--public-key", type=pathlib.Path)
    verify.add_argument("--certificate-identity")
    verify.add_argument("--certificate-issuer")
    generate_parser = sub.add_parser("generate")
    generate_parser.add_argument("--output-dir", type=pathlib.Path, required=True)
    generate_parser.add_argument("--source-commit", required=True)
    generate_parser.add_argument("--source-ref", default="refs/heads/main")
    generate_parser.add_argument("--image", action="append", default=[])
    generate_parser.add_argument("--evidence-dir", type=pathlib.Path, required=True)
    generate_parser.add_argument("--gate-evidence", action="append", default=[])
    generate_parser.add_argument("--previous-manifest-sha256", default=ZERO_DIGEST)
    decision_parser = sub.add_parser("decision")
    decision_parser.add_argument("--pack-dir", type=pathlib.Path, required=True)
    decision_parser.add_argument("--output", type=pathlib.Path, required=True)
    decision_parser.add_argument("--decided-by", required=True)
    decision_parser.add_argument("--rationale", required=True)
    args = parser.parse_args()
    try:
        if args.command == "generate":
            result = generate(args)
        elif args.command == "decision":
            result = create_decision(args)
        elif args.mode == "template":
            if any(value is not None for value in (args.pack_dir, args.decision, args.signature_kind, args.manifest_signature, args.decision_signature, args.public_key)):
                raise ReleaseError("template verification accepts no release-pack or signature input")
            result = validate_template()
        else:
            if args.pack_dir is None:
                raise ReleaseError("candidate/acceptance verification requires --pack-dir")
            pack = args.pack_dir.resolve()
            manifest_path = pack / "release-manifest.json"
            manifest = read_json(manifest_path)
            _, evidence = validate_manifest(pack, manifest, "candidate")
            if args.mode == "candidate":
                result = {"decision": "N14A_RELEASE_CANDIDATE_VALID", "release_id": manifest["release_id"], "source_activation": False}
            else:
                if not all((args.decision, args.signature_kind, args.manifest_signature, args.decision_signature)):
                    raise ReleaseError("acceptance requires decision plus manifest and decision signatures")
                evidence_path = pack / manifest["candidate_evidence"]["file"]
                validate_decision(args.decision, manifest_path, evidence_path)
                verify_blob(args.signature_kind, manifest_path, args.manifest_signature, args)
                verify_blob(args.signature_kind, args.decision, args.decision_signature, args)
                result = {
                    "decision": "N14A_SOURCE_DARK_RELEASE_ACCEPTED", "release_id": manifest["release_id"],
                    "deployment_authorized": True, "source_activation": False,
                    "high_findings": sum(row["vulnerability"]["high"] for row in evidence["images"]),
                }
    except (ReleaseError, OSError) as exc:
        print(json.dumps({"decision": "NO_GO", "reason": str(exc)}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
