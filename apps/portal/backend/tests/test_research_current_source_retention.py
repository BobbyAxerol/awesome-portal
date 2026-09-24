"""W1 row G: RS-02 retention client against a real local ``http.server``.

The WFO source is an actual QuantBT 1.1.1 signal-notional advanced WFO run
over the deterministic golden tape (3 trials, seed 42), not a fixture.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
from portal_api.services.research_current_source_retention import (
    MAX_INGEST_BODY_BYTES,
    TRANSPORT_RETRIES,
    ResearchCurrentSourceRetentionClient,
    ResearchCurrentSourceRetentionError,
    encode_ingest_body,
    retained_import_digest,
)
from test_current_source_artifacts import _market, _request as _wfo_portal_request
from wfo_test_support import FakeControlApi, wfo_request

RUN_ID = "rrun_w1_retention"
SECRET = "w1-retention-principal-secret"


@pytest.fixture(scope="module")
def wfo_source(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("wfo-source")
    AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=ArtifactRepository(root)).run(
        _wfo_portal_request(target_mode="signal_notional", optuna_trials=3),
        _market(),
        RUN_ID,
        target_mode="signal_notional",
    )
    return root


def _producer_request() -> ResearchRunProducerRequest:
    return ResearchRunProducerRequest.model_validate(wfo_request(run_id=RUN_ID))


def _client(api: FakeControlApi) -> ResearchCurrentSourceRetentionClient:
    return ResearchCurrentSourceRetentionClient(endpoint=api.origin, secret=SECRET, sleep=lambda _seconds: None)


def _retain(api: FakeControlApi, wfo_source: Path, tmp_path: Path):
    request = _producer_request()
    return _client(api).retain(
        request=request,
        source_root=wfo_source,
        artifact_root=tmp_path,
        fence_validator=lambda fence: fence.run_id == RUN_ID and fence.lease_epoch == 1,
    )


def test_w1_retention_order_and_exact_wire(wfo_source: Path, tmp_path: Path) -> None:
    with FakeControlApi() as api:
        result = _retain(api, wfo_source, tmp_path)
    operations = api.operations()
    batch_count = operations.count("current-source/batches")
    assert operations == ["reserve", "seal", *(["current-source/batches"] * batch_count), "current-source/seal"]
    assert batch_count == result.batch_count >= 5
    assert all(headers.get("x-portal-principal") for _, _, headers in api.requests)

    identity = {"workspace_id", "run_id", "job_id", "worker_attempt_id", "lease_epoch", "artifact_id"}
    reserve = api.bodies("reserve")[0]
    assert set(reserve) == identity | {"retention_class"}
    p05_seal = api.bodies("seal")[0]
    assert set(p05_seal) == identity | {"manifest_digest", "manifest_schema_version", "total_rows", "total_bytes", "parts"}
    # Control API's Zod part contract: sequence bounds are strings or null.
    assert all(part["sequence_min"] is None or isinstance(part["sequence_min"], str) for part in p05_seal["parts"])
    assert len(p05_seal["parts"]) <= 128

    batches = api.bodies("current-source/batches")
    batch_keys = identity | {
        "schema_version", "artifact_revision", "manifest_digest", "source_transform_digest",
        "table_kind", "batch_ordinal", "batch_digest", "rows",
    }
    seen: dict[str, list[int]] = {}
    for body in batches:
        assert set(body) == batch_keys
        assert body["schema_version"] == "research.current-source-batch.v1"
        assert body["manifest_digest"] == p05_seal["manifest_digest"]
        assert 1 <= len(body["rows"]) <= 200
        # The rows are exactly what iter_current_source_retention_batches()
        # yields; the Control API recomputes this digest over the same rows.
        for row in body["rows"]:
            assert set(row) == {"sourceOrdinal", "sourceId", "occurredAtUtcMs", "payload"}
        encoded = json.dumps(body["rows"], ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
        assert hashlib.sha256(encoded).hexdigest() == body["batch_digest"]
        seen.setdefault(body["table_kind"], []).append(body["batch_ordinal"])
    assert set(seen) == {"OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"}
    assert all(ordinals == list(range(len(ordinals))) for ordinals in seen.values())

    seal = api.bodies("current-source/seal")[0]
    assert set(seal) == identity | {
        "schema_version", "artifact_revision", "manifest_digest", "source_transform_digest",
        "source_adapter_id", "profile_id", "retained_import_digest", "table_rows", "total_rows", "summary",
    }
    assert seal["schema_version"] == "research.current-source-seal.v1"
    assert seal["source_adapter_id"] == "rs02.quantbt-signal-notional-wfo.v1"
    assert seal["profile_id"] == "rs02.delta-signal-notional-wfo.v1"
    assert set(seal["table_rows"]) == {"OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"}
    assert seal["table_rows"]["TRIAL"] == 3
    assert seal["table_rows"]["FOLD"] == 2
    assert seal["total_rows"] == sum(seal["table_rows"].values())
    assert seal["retained_import_digest"] == retained_import_digest([
        {**{key: body[key] for key in ("table_kind", "batch_ordinal", "batch_digest")}, "row_count": len(body["rows"])}
        for body in batches
    ])
    assert result.trial_states and len(result.trial_states) == 3
    assert all(len(raw) <= MAX_INGEST_BODY_BYTES for _, raw, _ in api.requests)


def test_w1_transport_errors_retry_with_identical_bytes(wfo_source: Path, tmp_path: Path) -> None:
    with FakeControlApi() as api:
        api.faults["current-source/batches"] = ["drop", 503, "drop"]
        api.faults["current-source/seal"] = [502]
        _retain(api, wfo_source, tmp_path)
    batch_raw = [raw for operation, raw, _ in api.requests if operation == "current-source/batches"]
    # The first batch was sent four times (3 retries) with byte-identical bodies.
    assert batch_raw[0] == batch_raw[1] == batch_raw[2] == batch_raw[3]
    assert batch_raw[4] != batch_raw[0]
    seal_raw = [raw for operation, raw, _ in api.requests if operation == "current-source/seal"]
    assert len(seal_raw) == 2 and seal_raw[0] == seal_raw[1]


def test_w1_transport_retries_are_bounded(wfo_source: Path, tmp_path: Path) -> None:
    with FakeControlApi() as api:
        api.faults["current-source/batches"] = ["drop"] * (TRANSPORT_RETRIES + 1)
        with pytest.raises(ResearchCurrentSourceRetentionError, match="unavailable after 3 retries"):
            _retain(api, wfo_source, tmp_path)
    assert api.operations().count("current-source/batches") == TRANSPORT_RETRIES + 1
    assert "current-source/seal" not in api.operations()


def test_w1_409_fails_closed_without_retry(wfo_source: Path, tmp_path: Path) -> None:
    with FakeControlApi() as api:
        api.faults["current-source/batches"] = [409]
        with pytest.raises(ResearchCurrentSourceRetentionError) as error:
            _retain(api, wfo_source, tmp_path)
    assert error.value.status == 409
    assert error.value.code == "ARTIFACT_COMMIT_FAILED"
    assert api.operations() == ["reserve", "seal", "current-source/batches"]


def test_w1_non_retryable_refusal_fails_closed(wfo_source: Path, tmp_path: Path) -> None:
    with FakeControlApi() as api:
        api.faults["reserve"] = [403]
        with pytest.raises(ResearchCurrentSourceRetentionError) as error:
            _retain(api, wfo_source, tmp_path)
    assert error.value.status == 403
    assert api.operations() == ["reserve"]
    assert not (tmp_path / "research-retained" / "artifacts").exists() or not list(
        (tmp_path / "research-retained" / "artifacts").iterdir()
    )


def test_w1_body_size_precheck_sends_nothing() -> None:
    oversized = {"rows": ["x" * 1024] * 1000}
    with pytest.raises(ResearchCurrentSourceRetentionError, match="1000000-byte cap"):
        encode_ingest_body(oversized)
    with FakeControlApi() as api:
        with pytest.raises(ResearchCurrentSourceRetentionError, match="cap"):
            _client(api)._post("current-source/batches", oversized)
    assert api.requests == []
    assert len(encode_ingest_body({"rows": ["x" * 1024] * 900})) <= MAX_INGEST_BODY_BYTES


def test_w1_stale_fence_refuses_before_p05_bytes(wfo_source: Path, tmp_path: Path) -> None:
    with FakeControlApi() as api:
        with pytest.raises(Exception, match="FENCE_REJECTED"):
            _client(api).retain(
                request=_producer_request(),
                source_root=wfo_source,
                artifact_root=tmp_path,
                fence_validator=lambda _fence: False,
            )
    assert api.operations() == ["reserve"]


def test_w1_retention_requires_explicit_private_binding(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", raising=False)
    with pytest.raises(ResearchCurrentSourceRetentionError, match="RETAINED_ARTIFACTS"):
        ResearchCurrentSourceRetentionClient.from_environment()
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "true")
    monkeypatch.delenv("CONTROL_API_INTERNAL_URL", raising=False)
    with pytest.raises(ResearchCurrentSourceRetentionError, match="binding"):
        ResearchCurrentSourceRetentionClient.from_environment()
