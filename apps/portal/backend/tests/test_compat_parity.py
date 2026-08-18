from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from portal_api.domain.requests import PortalRunRequest


REPO_ROOT = Path(__file__).resolve().parents[4]
PORTAL_ROOT = REPO_ROOT / "apps" / "portal"
REGISTRY_ROOT = PORTAL_ROOT / "registry"
SNAPSHOT_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar02" / "snapshots"
EXPORTER = PORTAL_ROOT / "scripts" / "export_compat_snapshots.py"
COMPOSE_PATH = REPO_ROOT / "compose.yaml"
NGINX_CONF = REPO_ROOT / "deploy" / "nginx" / "portal.conf"

SNAPSHOT_NAMES = (
    "portal-api.openapi.json",
    "planning-api.openapi.json",
    "run-request.schema.json",
)


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _snapshot(name: str) -> dict[str, object]:
    return _load_json(SNAPSHOT_ROOT / name)


def _manifest() -> dict[str, object]:
    return _load_json(SNAPSHOT_ROOT / "manifest.json")


def _regenerate_snapshots() -> dict[str, dict[str, object]]:
    spec = importlib.util.spec_from_file_location(
        "export_compat_snapshots", EXPORTER
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    artifacts = module.build_artifacts()
    return {name: artifacts[name] for name in (*SNAPSHOT_NAMES, "manifest.json")}


def _digest(payload: str) -> str:
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


# ------------------------------------------------------------- regeneration


def test_committed_snapshots_regenerate_identically() -> None:
    regenerated = _regenerate_snapshots()

    for name in SNAPSHOT_NAMES:
        assert regenerated[name] == _snapshot(name), f"{name} drifted"
    committed_manifest = _manifest()
    regenerated_manifest = regenerated["manifest.json"]
    assert {
        "schema_version",
        "producer",
        "run_request_component",
        "snapshots",
    } <= set(regenerated_manifest)
    assert (
        regenerated_manifest["snapshots"] == committed_manifest["snapshots"]
    )


def test_manifest_digests_verify_every_committed_snapshot() -> None:
    manifest = _manifest()
    entries = manifest["snapshots"]
    assert isinstance(entries, dict)
    assert set(entries) == set(SNAPSHOT_NAMES)
    for name in SNAPSHOT_NAMES:
        payload = _dump((SNAPSHOT_ROOT / name))
        assert entries[name]["digest"] == _digest(payload)
        assert entries[name]["bytes"] == len(payload.encode("utf-8"))


def _dump(path: Path) -> str:
    document = json.loads(path.read_text(encoding="utf-8"))
    return json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


# -------------------------------------------------------------- frozen paths


def test_portal_snapshot_freezes_run_and_handoff_contracts() -> None:
    paths = _snapshot("portal-api.openapi.json")["paths"]

    required = (
        "/api/health",
        "/api/ready",
        "/api/datasets",
        "/api/strategies",
        "/api/runs",
        "/api/runs/preflight",
        "/api/runs/{run_id}",
        "/api/runs/{run_id}/audit",
        "/api/runs/{run_id}/cancel",
        "/api/runs/{run_id}/export",
        "/api/runs/{run_id}/progress",
        "/api/runs/{run_id}/summary",
        "/api/v1/portal/registry",
        "/api/v1/portal/summary",
    )
    for route in required:
        assert route in paths, f"frozen Portal route missing: {route}"
    summary = paths["/api/v1/portal/summary"]
    assert set(summary) == {"get"}


def test_planning_snapshot_freezes_private_and_legacy_contracts() -> None:
    paths = _snapshot("planning-api.openapi.json")["paths"]

    for route in (
        "/api/health",
        "/api/ready",
        "/api/tasks",
        "/api/roadmap",
        "/api/v1/tasks",
        "/api/v1/roadmap",
        "/api/v1/roadmap/{phase_id}",
        "/api/v1/summary",
    ):
        assert route in paths, f"frozen Planning route missing: {route}"
    assert set(paths["/api/v1/summary"]) == {"get"}


def test_run_request_schema_is_self_contained_and_matches_component() -> None:
    snapshot = _snapshot("run-request.schema.json")
    component = _snapshot("portal-api.openapi.json")["components"]["schemas"][
        "PortalRunRequest"
    ]

    encoded = json.dumps(snapshot)
    assert "#/components/schemas/" not in encoded
    assert snapshot["title"] == component["title"]
    assert set(snapshot["required"]) == set(component["required"])
    assert set(snapshot["properties"]) == set(component["properties"])


def test_run_request_schema_accepts_the_canonical_run_request(run_request) -> None:
    schema = _snapshot("run-request.schema.json")
    payload = run_request.model_dump(mode="json")
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = list(validator.iter_errors(payload))
    assert not errors, "\n".join(error.message for error in errors)


# ----------------------------------------------------------- privacy freeze


def test_only_the_web_gateway_exposes_a_public_port() -> None:
    compose = COMPOSE_PATH.read_text(encoding="utf-8")

    assert compose.count("    ports:") == 1
    web_service = compose.split("portal-web:", 1)[1].split("\n\n")[0]
    assert "ports:" in web_service
    for private in ("portal-api:", "roadmap-task-board-api:"):
        section = compose.split(private, 1)[1].split("\n\n")[0]
        assert "expose:" in section
        assert "ports:" not in section
    assert "PORTAL_HTTP_PORT" in web_service


def test_gateway_keeps_compatibility_proxies() -> None:
    conf = NGINX_CONF.read_text(encoding="utf-8")

    # The /api/ upstream is a template var so the façade wire can roll back
    # in one env line; infra health, ready and SSE always stay on Python.
    assert "proxy_pass http://${PORTAL_WEB_UPSTREAM};" in conf
    assert "proxy_pass http://portal-api:8000;" in conf  # health/ready/SSE
    assert "location = /api/health" in conf
    assert "location = /api/ready" in conf
    assert re.search(r"location ~ \^/api/runs/\[\^/\]\+/events\$", conf)
    assert "proxy_pass http://roadmap-task-board-api:8000/api/" in conf
    assert re.search(r"location \^\~ /roadmap-task-board/", conf)
    assert re.search(r"location /api/", conf)


def test_registry_legacy_routes_feed_embedding_contracts() -> None:
    registry = _load_json(REGISTRY_ROOT / "registry.json")
    features = {item["id"]: item for item in registry["features"]}

    quantbt = features["QUANTBT_RESEARCH"]
    assert quantbt["canonical_route"] == "/research/quantbt"
    assert set(quantbt["legacy_routes"]) == {
        "/runs",
        "/overview",
        "/optimization",
        "/parameters",
        "/execution",
        "/audit",
    }
    planning = features["PLANNING"]
    assert planning["canonical_route"] == "/planning"
    assert planning["legacy_routes"] == ["/roadmap-task-board/"]

    all_routes: list[str] = []
    for feature in registry["features"]:
        all_routes.extend([feature["canonical_route"], *feature["legacy_routes"]])
    normalized = [route.rstrip("/") for route in all_routes if route != "/"]
    assert len(set(normalized)) == len(normalized), "legacy/canonical routes collide"
