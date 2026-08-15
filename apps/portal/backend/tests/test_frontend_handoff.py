from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from portal_api.domain.responses import PortalErrorResponse
from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository, canonical_digest


@pytest.fixture
def anyio_backend():
    return "asyncio"


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
SCHEMA_ROOT = REGISTRY_ROOT / "schemas"
FIXTURE_ROOT = REGISTRY_ROOT / "fixtures"
OPENAPI_PATH = REGISTRY_ROOT / "openapi" / "portal-api.openapi.json"
HANDOFF_DOC_PATH = REGISTRY_ROOT / "FRONTEND_HANDOFF.md"
EXPORT_SCRIPT = PORTAL_ROOT / "scripts" / "export_handoff_contract.py"

FIXTURE_NAMES = (
    "registry.public.json",
    "links.public.json",
    "summary.healthy.json",
    "summary.empty.json",
    "summary.partial.json",
    "summary.stale.json",
    "summary.denied.json",
    "summary.unavailable.json",
)


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _fixture(name: str) -> dict[str, object]:
    return _load_json(FIXTURE_ROOT / name)


def _schema_registry() -> Registry:
    schemas = [
        _load_json(SCHEMA_ROOT / "portal-registry-source.v1.schema.json"),
        _load_json(SCHEMA_ROOT / "portal-registry.v1.schema.json"),
        _load_json(SCHEMA_ROOT / "portal-summary.v1.schema.json"),
        _load_json(SCHEMA_ROOT / "portal-links.v1.schema.json"),
    ]
    return Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas
    )


def _validate_schema(schema_id: str, document: dict[str, object]) -> None:
    validator = Draft202012Validator(
        {"$schema": "https://json-schema.org/draft/2020-12/schema", "$ref": schema_id},
        registry=_schema_registry(),
        format_checker=FormatChecker(),
    )
    errors = list(validator.iter_errors(document))
    assert not errors, "\n".join(error.message for error in errors)


REGISTRY_SCHEMA_ID = (
    "https://schemas.primusspark.com/portal/portal-registry.v1.schema.json"
)
SUMMARY_SCHEMA_ID = (
    "https://schemas.primusspark.com/portal/portal-summary.v1.schema.json"
)
LINKS_SCHEMA_ID = (
    "https://schemas.primusspark.com/portal/portal-links.v1.schema.json"
)


# ---------------------------------------------------------------- fixtures


def test_every_committed_fixture_is_schema_valid() -> None:
    schema_ids = {
        "registry.public.json": REGISTRY_SCHEMA_ID,
        "links.public.json": LINKS_SCHEMA_ID,
    }
    for name in FIXTURE_NAMES:
        document = _fixture(name)
        schema_id = schema_ids.get(name, SUMMARY_SCHEMA_ID)
        _validate_schema(schema_id, document)


def test_registry_fixture_is_the_public_document_with_computed_digest() -> None:
    document = _fixture("registry.public.json")

    without_digest = {
        key: value for key, value in document.items() if key != "content_digest"
    }
    assert document["content_digest"] == canonical_digest(without_digest)
    assert document["schema_version"] == "portal.registry.v1"
    assert all(
        feature["maturity"] != "HIDDEN" for feature in document["features"]
    )


def test_summary_fixtures_share_the_registry_fixture_digest() -> None:
    digest = _fixture("registry.public.json")["content_digest"]
    for name in FIXTURE_NAMES:
        if not name.startswith("summary."):
            continue
        document = _fixture(name)
        assert document["registry_digest"] == digest
        assert document["schema_version"] == "portal.summary.v1"
        assert document["environment"] == "research"
        size = len(json.dumps(document).encode("utf-8"))
        assert size < 50 * 1024


def test_healthy_and_empty_fixtures_are_available_with_exact_values() -> None:
    healthy = _fixture("summary.healthy.json")
    assert healthy["overall_availability"]["state"] == "available"
    healthy_sections = {section["source_id"]: section for section in healthy["sections"]}
    assert healthy_sections["quantbt_current"]["availability"]["state"] == "available"
    assert healthy_sections["planning_current"]["availability"]["state"] == "available"
    assert healthy_sections["quantbt_current"]["metrics"]["total_runs"]["value"] == 3
    assert healthy_sections["planning_current"]["metrics"]["total_tasks"]["value"] == 19
    assert healthy_sections["planning_current"]["metrics"]["tasks_done"]["value"] == 9

    empty = _fixture("summary.empty.json")
    assert empty["overall_availability"]["state"] == "available"
    empty_sections = {section["source_id"]: section for section in empty["sections"]}
    assert empty_sections["quantbt_current"]["metrics"]["total_runs"]["value"] == 0
    assert empty_sections["planning_current"]["metrics"]["total_tasks"]["value"] == 0


def test_partial_denied_and_stale_fixtures_are_truthful() -> None:
    partial = _fixture("summary.partial.json")
    partial_sections = {section["source_id"]: section for section in partial["sections"]}
    assert partial["overall_availability"]["state"] == "degraded"
    planning = partial_sections["planning_current"]
    assert planning["availability"]["reason_code"] == "LOCAL_ONLY_STATE"
    assert all(
        metric["value"] is None for metric in planning["metrics"].values()
    )
    assert partial_sections["quantbt_current"]["metrics"]["total_runs"]["value"] == 3

    denied = _fixture("summary.denied.json")
    denied_sections = {section["source_id"]: section for section in denied["sections"]}
    assert denied_sections["planning_current"]["availability"]["state"] == "denied"
    assert (
        denied_sections["planning_current"]["availability"]["reason_code"]
        == "PERMISSION_DENIED"
    )
    assert denied["overall_availability"]["state"] == "degraded"

    stale = _fixture("summary.stale.json")
    stale_sections = {section["source_id"]: section for section in stale["sections"]}
    quantbt = stale_sections["quantbt_current"]
    assert quantbt["availability"]["state"] == "stale"
    assert quantbt["availability"]["reason_code"] == "STALE_OBSERVATION"
    assert quantbt["availability"]["stale_after_seconds"] == 3600
    assert quantbt["metrics"]["total_runs"]["value"] == 3
    assert stale["overall_availability"]["state"] == "degraded"


def test_unavailable_fixture_keeps_null_not_zero() -> None:
    document = _fixture("summary.unavailable.json")

    assert document["overall_availability"]["state"] == "unavailable"
    assert document["overall_availability"]["reason_code"] == "UPSTREAM_UNAVAILABLE"
    for section in document["sections"]:
        assert section["availability"]["state"] == "unavailable"
        assert all(metric["value"] is None for metric in section["metrics"].values())


def test_fixture_priorities_are_authorized_and_deep_dive_ordered() -> None:
    healthy = _fixture("summary.healthy.json")
    types = [item["type"] for item in healthy["priority_items"]]
    assert types == ["REGISTRY_BLOCKING_CONCERN"] * 5
    allowed = {
        "RUN_FAILED",
        "HISTORICAL_DATA_UNAVAILABLE",
        "REGISTRY_BLOCKING_CONCERN",
    }
    order = {
        "RUN_FAILED": 0,
        "HISTORICAL_DATA_UNAVAILABLE": 1,
        "REGISTRY_BLOCKING_CONCERN": 2,
    }
    for name in FIXTURE_NAMES:
        if not name.startswith("summary."):
            continue
        priorities = _fixture(name)["priority_items"]
        assert {item["type"] for item in priorities} <= allowed
        ranks = [order[item["type"]] for item in priorities]
        assert ranks == sorted(ranks)
        assert len(priorities) <= 50


def test_fixtures_never_emit_forbidden_metrics_or_private_detail() -> None:
    forbidden = {
        "pnl",
        "equity",
        "sharpe",
        "drawdown",
        "profit",
        "eta",
        "incident",
        "deployment",
        "account",
        "return",
    }
    for name in FIXTURE_NAMES:
        if not name.startswith("summary."):
            continue
        document = _fixture(name)
        metric_keys = {
            key for section in document["sections"] for key in section["metrics"]
        }
        assert not any(token in key for key in metric_keys for token in forbidden)
        encoded = json.dumps(document)
        assert "/srv/" not in encoded
        assert "/home/" not in encoded
        assert "token=" not in encoded


# ----------------------------------------------------------------- openapi


def _openapi() -> dict[str, object]:
    return _load_json(OPENAPI_PATH)


def test_committed_openapi_documents_both_handoff_endpoints() -> None:
    document = _openapi()
    paths = document["paths"]

    registry = paths["/api/v1/portal/registry"]["get"]
    assert set(paths["/api/v1/portal/registry"]) == {"get"}
    assert "304" in registry["responses"]
    assert all(
        parameter["in"] != "query" for parameter in registry.get("parameters", [])
    )

    summary = paths["/api/v1/portal/summary"]["get"]
    assert set(paths["/api/v1/portal/summary"]) == {"get"}
    assert all(parameter["in"] != "query" for parameter in summary.get("parameters", []))
    ok_schema = summary["responses"]["200"]["content"]["application/json"]["schema"]
    assert ok_schema == {"$ref": "#/components/schemas/PortalSummaryV1"}
    error_schema = summary["responses"]["500"]["content"]["application/json"]["schema"]
    assert error_schema == {"$ref": "#/components/schemas/PortalErrorResponse"}

    registry_ok = registry["responses"]["200"]["content"]["application/json"]["schema"]
    assert registry_ok == {"$ref": "#/components/schemas/PortalRegistryDocument"}


def test_committed_openapi_matches_regenerated_document() -> None:
    import portal_api.main  # noqa: F401

    app = create_app()
    try:
        regenerated = app.openapi()
    finally:
        app.state.run_manager.shutdown()
    assert regenerated == _openapi()


def test_openapi_response_schemas_validate_every_fixture() -> None:
    """Frontend types are generatable/validatable without a handwritten model."""
    from referencing.jsonschema import DRAFT202012

    document = _openapi()
    registry = Registry().with_resource(
        "openapi.json",
        Resource(contents=document, specification=DRAFT202012),
    )
    for name, component in (
        ("registry.public.json", "PortalRegistryDocument"),
        ("links.public.json", "PortalLinksDocument"),
        ("summary.healthy.json", "PortalSummaryV1"),
        ("summary.empty.json", "PortalSummaryV1"),
        ("summary.partial.json", "PortalSummaryV1"),
        ("summary.stale.json", "PortalSummaryV1"),
        ("summary.denied.json", "PortalSummaryV1"),
        ("summary.unavailable.json", "PortalSummaryV1"),
    ):
        validator = Draft202012Validator(
            {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "$ref": f"openapi.json#/components/schemas/{component}",
            },
            registry=registry,
            format_checker=FormatChecker(),
        )
        errors = list(validator.iter_errors(_fixture(name)))
        assert not errors, f"{name}: " + "; ".join(
            error.message for error in errors
        )


@pytest.mark.anyio
async def test_openapi_error_envelope_matches_runtime_failure_shape() -> None:
    class GarbageAdapter:
        source_id = "garbage_current"

        async def collect(self, context, *, deadline):
            del context, deadline
            return {"not": "a contribution"}

        def unavailable_contribution(self, *, reason_code, checked_at):
            from portal_api.domain.portal_summary import (
                AvailabilityAuthority,
                AvailabilityProvenance,
                CapabilityAvailability,
                PortalSummaryContribution,
                PortalSummarySection,
            )
            from datetime import UTC, datetime

            checked = checked_at or datetime.now(UTC)
            return PortalSummaryContribution(
                section=PortalSummarySection(
                    source_id=self.source_id,
                    feature_id="QUANTBT_RESEARCH",
                    label=self.source_id,
                    availability=CapabilityAvailability(
                        state="unavailable",
                        reason_code=reason_code,
                        detail=None,
                        retryable=True,
                        checked_at=checked,
                        as_of=None,
                        stale_after_seconds=None,
                        authority=AvailabilityAuthority(
                            service="portal-api",
                            contract="test.v1",
                            endpoint=None,
                        ),
                        provenance=AvailabilityProvenance(
                            source_revision=None, content_digest=None
                        ),
                    ),
                    metrics={},
                    recent_items=(),
                    warnings=(),
                ),
                priority_items=(),
            )

    from portal_api.services.portal_overview import (
        PortalSummaryService,
        PortalSummarySettings,
    )
    from portal_api.services.portal_registry import PortalRegistryService

    app = create_app()
    app.state.portal_summary_service = PortalSummaryService(
        registry_service=PortalRegistryService(PortalRegistryRepository(REGISTRY_ROOT)),
        adapters=(GarbageAdapter(),),
        settings=PortalSummarySettings(deadline_seconds=0.5, environment="research"),
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/summary")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 500
    PortalErrorResponse.model_validate(response.json())


# ------------------------------------------------------------- export sync


def _tmp_registry_root(tmp_path: Path) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    return root


def test_export_script_regenerates_identical_artifacts(tmp_path: Path) -> None:
    target = _tmp_registry_root(tmp_path)
    for name in FIXTURE_NAMES:
        (target / "fixtures" / name).unlink()
    (target / "openapi" / "portal-api.openapi.json").unlink()

    env = {
        "PYTHONPATH": f"{PORTAL_ROOT / 'backend' / 'src'}:{PORTAL_ROOT}",
    }
    result = subprocess.run(
        [sys.executable, str(EXPORT_SCRIPT), "--registry-root", str(target)],
        capture_output=True,
        text=True,
        env=env,
        timeout=300,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    assert _load_json(target / "openapi" / "portal-api.openapi.json") == _openapi()
    for name in FIXTURE_NAMES:
        assert _load_json(target / "fixtures" / name) == _fixture(name)


# ------------------------------------------------------------- handoff doc


def test_handoff_doc_documents_endpoints_states_and_constraints() -> None:
    document = HANDOFF_DOC_PATH.read_text(encoding="utf-8")

    for marker in (
        "/api/v1/portal/registry",
        "/api/v1/portal/summary",
        "/api/v1/portal/links",
        "If-None-Match",
        "304",
        "no-store",
        "Vary: Authorization, Cookie",
        "portal-api.openapi.json",
        "summary.healthy.json",
        "summary.partial.json",
        "summary.unavailable.json",
        "summary.stale.json",
        "summary.denied.json",
        "links.public.json",
        "FeatureMaturity",
        "AvailabilityState",
        "LOCAL_ONLY_STATE",
        "PERMISSION_DENIED",
        "RUN_FAILED",
        "HISTORICAL_DATA_UNAVAILABLE",
        "REGISTRY_BLOCKING_CONCERN",
        "portal-registry.v1.schema.json",
        "portal-summary.v1.schema.json",
        "portal-links.v1.schema.json",
        "loading",
        "partial",
        "stale",
        "denied",
        "unavailable",
        "bao giờ",
    ):
        assert marker in document, f"handoff doc must mention {marker}"


def test_registry_readme_references_the_handoff_artifacts() -> None:
    readme = (REGISTRY_ROOT / "README.md").read_text(encoding="utf-8")
    assert "FRONTEND_HANDOFF.md" in readme
    assert "portal-api.openapi.json" in readme
    assert "fixtures/" in readme
