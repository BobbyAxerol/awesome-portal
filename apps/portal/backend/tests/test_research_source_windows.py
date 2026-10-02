"""Source-time declared bounds; synthetic source data is not product acceptance."""
from __future__ import annotations

import copy
import hashlib
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.domain.research_imported_alpha_profile import (
    IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_ADAPTER_ID,
    IMPORTED_ALPHA_PROFILE_DIGEST, IMPORTED_ALPHA_PROFILE_ID,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter, default_current_source_admission
from portal_api.services.research_current_source_retention import _declared_wfo_oos_window
from portal_api.services.research_enrich_analysis import declared_source_windows, enrich_fixed_passport
from portal_api.services.research_imported_source import ImportedSource
from portal_api.services.research_run_producer import ResearchRunProducerExecutor
from portal_api.services.research_supervisor import (
    ImportedAlphaChildReceipt, ResearchChildReceipt, ResearchSupervisorError,
)
from portal_api.workers.research_child import _p13_evidence_source
from test_current_source_artifacts import _fence, _identity, exported
from test_research_evidence_metrics import _engine_run, _synthetic_market
from test_research_run_producer import _request, _snapshot

RUN = "rrun_" + "a" * 32


def windows(start="2025-01-01", oos="2025-01-08", end="2025-01-21", holdout="2025-01-28"):
    return declared_source_windows({kind: {"start": left, "end_exclusive": right}
        for kind, left, right in (("is", start, oos), ("oos", oos, end), ("holdout", end, holdout))})


@pytest.mark.parametrize("imported", [False, True])
def test_private_receipt_bounds_are_optional_bounded_and_copied(tmp_path: Path, imported: bool):
    common = dict(job_id="job", run_id=RUN, worker_attempt_id="worker", lease_epoch=1,
        market_path=tmp_path / "tape.parquet", artifact_root=tmp_path / "artifacts")
    if imported:
        receipt = ImportedAlphaChildReceipt(**common, source_path=tmp_path / "alpha.py", source_digest="a" * 64,
            entrypoint="generate_signals", parameters={}, random_seed=None, oos_start_utc_ms=1)
    else:
        receipt = ResearchChildReceipt(**common)
    assert "source_windows" not in receipt.as_payload()
    bounded = replace(receipt, source_windows=windows())
    payload = bounded.as_payload()
    assert payload["source_windows"] == windows()
    payload["source_windows"]["holdout"]["end_ms"] += 1
    assert bounded.source_windows == windows()
    assert set(payload["source_windows"]["holdout"]) == {"start_ms", "end_ms", "source_locator"}


@pytest.mark.parametrize("metadata", [
    {"unknown": {"start_ms": 1, "end_ms": 2, "source_locator": "source"}},
    {"oos": {"start_ms": True, "end_ms": 2, "source_locator": "source"}},
    {"oos": {"start_ms": 2, "end_ms": 2, "source_locator": "source"}},
    {"oos": {"start_ms": 1, "end_ms": 2, "source_locator": "x" * 257}},
    {"oos": {"start_ms": 1, "end_ms": 2, "source_locator": "source", "rows": []}},
])
def test_private_receipt_refuses_non_metadata_windows_before_launch(tmp_path: Path, metadata):
    receipt = ResearchChildReceipt(job_id="job", run_id=RUN, worker_attempt_id="worker", lease_epoch=1,
        market_path=tmp_path / "tape.parquet", artifact_root=tmp_path / "artifacts", source_windows=metadata)
    with pytest.raises(ResearchSupervisorError, match="window metadata"):
        receipt.as_payload()


def test_wfo_declares_only_oos_span_not_initial_is_union_or_holdout():
    requested = {"walk_forward": {"start": "2025-01-01", "split_mode": "2025-01-08",
        "end_exclusive": "2025-01-21T07:00:00+07:00"}}
    before = copy.deepcopy(requested)
    result = _declared_wfo_oos_window(requested)
    assert set(result) == {"oos"}
    assert result["oos"] == {"start_ms": int(pd.Timestamp("2025-01-08", tz="UTC").value // 1_000_000),
        "end_ms": int(pd.Timestamp("2025-01-21", tz="UTC").value // 1_000_000),
        "source_locator": "P10.immutable_requested_spec.walk_forward:split_mode..end_exclusive"}
    assert requested == before


def test_retained_export_wires_oos_bounds_into_the_new_seal_without_claiming_is_or_holdout(exported):
    source, retained, first = exported
    run_id = first.receipt.summary["enriched_analysis"]["run_id"]
    expected = _declared_wfo_oos_window({"walk_forward": {"split_mode": "2024-01-08", "end_exclusive": "2024-01-22"}})
    second = CurrentSourceArtifactAdapter(source_artifacts=source, retained_artifacts=retained).export_advanced_walkforward(
        run_id=run_id, identity=replace(_identity(run_id), artifact_id="b9-source-windows"), fence=_fence(run_id),
        admission=default_current_source_admission(), fence_validator=lambda fence: fence == _fence(run_id),
        source_windows=expected)
    block = second.receipt.summary["enriched_analysis"]
    assert block["windows"]["oos"] == {**expected["oos"], "bounds_semantics": "START_INCLUSIVE_END_EXCLUSIVE",
        "state": "AVAILABLE", "reason_code": None}
    for kind in ("is", "holdout"):
        assert block["windows"][kind]["state"] == "NOT_PUBLISHED"
        assert "start_ms" not in block["windows"][kind]
    assert "start_ms" not in first.receipt.summary["enriched_analysis"]["windows"]["oos"]


@pytest.mark.parametrize("imported", [False, True])
def test_fixed_producer_passes_immutable_bounds_but_not_holdout_rows(tmp_path: Path, imported: bool):
    snapshots, identity = _snapshot(tmp_path)
    payload = _request(snapshot_id=identity.snapshot_id, snapshot_content_hash=identity.content_hash, run_id=RUN)
    source_bytes = b"def generate_signals(context):\n    return {}\n"
    source_digest = hashlib.sha256(source_bytes).hexdigest()
    if imported:
        requested = payload["research"]["requested_spec"]
        requested["alpha_binding"] = {"alpha_id": "imported-alpha", "alpha_version_id": "av_imported_0_3_0"}
        requested["strategy_id"] = payload["strategy_id"] = "imported-alpha"
        payload["research"].update(alpha_id="imported-alpha", alpha_version_id="av_imported_0_3_0",
            execution_adapter_id=IMPORTED_ALPHA_ADAPTER_ID, adapter_contract_digest=IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
            execution_profile_id=IMPORTED_ALPHA_PROFILE_ID, execution_profile_digest=IMPORTED_ALPHA_PROFILE_DIGEST,
            imported_source_digest=source_digest, imported_entrypoint="generate_signals", imported_parameters={"scale": 1000})
        payload["research"].pop("p04_parameters")
    request = ResearchRunProducerRequest.model_validate(payload)
    expected = declared_source_windows(request.research.requested_spec["windows"])
    captured = []

    class RecordingSupervisor:
        def run_p04_delta_qualification(self, receipt, **kwargs):
            captured.append(receipt.as_payload())
            frame = pd.read_parquet(receipt.market_path)
            assert frame.index.max().value // 1_000_000 < expected["holdout"]["start_ms"]
            return SimpleNamespace(engine_version="1.1.1", final_equity=20000, num_trades=0, bars=len(frame),
                elapsed_seconds=0.1, peak_rss_bytes=1024, cpu_seconds=0.01,
                enforced_limits={"cpu_seconds": 45}, evidence_source={"source": {"source_transform_digest": "a" * 64}},
                imported_source_digest=source_digest if imported else None)

        run_imported_alpha_qualification = run_p04_delta_qualification

    source_client = SimpleNamespace(fetch=lambda _request: ImportedSource(source_bytes=source_bytes,
        source_digest=source_digest, entrypoint="generate_signals"))
    market_root = tmp_path / "market-scratch"
    market_root.mkdir()
    executor = ResearchRunProducerExecutor(snapshots=snapshots, supervisor=RecordingSupervisor(),
        market_root=market_root, imported_source_client=source_client)
    executor._execute_sync(request, tmp_path / "engine-output", None)
    assert len(captured) == 1 and captured[0]["source_windows"] == expected
    assert not list(market_root.rglob("*.parquet"))


def test_fixed_source_time_full_result_bounds_do_not_make_sampled_passport_complete():
    market = _synthetic_market(20)
    result = _engine_run(market)
    expected = windows()
    source = _p13_evidence_source(market=market, result=result, report=result.full_report(), run_id=RUN,
        is_start_utc_ms=expected["is"]["start_ms"], oos_start_utc_ms=expected["oos"]["start_ms"], source_windows=expected)
    full = source["enriched_analysis"]
    assert full["scope"]["coverage"] == "FULL_RETAINED_OOS"
    for kind in ("is", "oos", "holdout"):
        assert full["windows"][kind]["start_ms"] == expected[kind]["start_ms"]
        assert full["windows"][kind]["end_ms"] == expected[kind]["end_ms"]
    assert full["windows"]["holdout"]["state"] == full["windows"]["is"]["state"] == "NOT_PUBLISHED"
    sampled = enrich_fixed_passport(run_id=RUN, passport=source, nominal_bar_ms=3_600_000, source_windows=expected)
    assert sampled["scope"]["coverage"] == "SAMPLED_RETAINED_EQUITY"
    assert sampled["return_distribution"]["state"] == "NOT_PUBLISHED"
    assert sampled["return_distribution"]["mean"]["value"] is None
    assert sampled["windows"]["oos"]["end_ms"] == expected["oos"]["end_ms"]
