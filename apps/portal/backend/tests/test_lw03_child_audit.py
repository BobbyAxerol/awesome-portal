"""LW-03: bounded source custody keeps the late OOS child without fabricating it."""

from __future__ import annotations

import json

import pandas as pd
import pytest

from portal_api.domain.requests import AdvancedWalkForwardConfig
from portal_api.services.advanced_walkforward_runner import (
    LIFECYCLE_LEDGER_MAX_ROWS,
    _config_fields,
)
from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter, CurrentSourceArtifactError


def test_admitted_wfo_passes_bounded_lifecycle_cap_to_pinned_quantbt() -> None:
    from quantbt.walkforward import WalkForwardConfig

    fields = _config_fields(AdvancedWalkForwardConfig(optuna_trials=400))
    assert fields["metadata"] == {"lifecycle_ledger_max_rows": LIFECYCLE_LEDGER_MAX_ROWS}
    assert LIFECYCLE_LEDGER_MAX_ROWS == 20_000
    assert WalkForwardConfig(**fields).metadata["lifecycle_ledger_max_rows"] == 20_000


def test_retained_fold_keeps_late_source_oos_generation_with_original_ordinal() -> None:
    adapter = CurrentSourceArtifactAdapter(source_artifacts=None, retained_artifacts=None)
    fold = {"fold_id": "1", "payload_json": "{}"}
    lifecycle = pd.DataFrame([
        {
            "fold_id": "1", "run_id": "run-lw03", "candidate_id": "a" * 24,
            "seed": 42, "context": "anti-leakage in-sample search",
            "certified_isolation": True,
        }
        for _ in range(80)
    ] + [{
        "fold_id": "1", "run_id": "run-lw03", "candidate_id": "b" * 24,
        "seed": 43, "context": "out-of-sample generation",
        "certified_isolation": True,
    }])
    summary = adapter._attach_child_audit(
        [fold], lifecycle=lifecycle, contract={"policy": "isolated_v1", "records_dropped": 0},
    )
    block = json.loads(fold["payload_json"])["child_audit"]
    assert summary["source_record_count"] == 81
    assert summary["records_dropped_by_source"] == 0
    assert block["truncated"] is True
    assert block["source_record_count"] == 81
    assert len(block["records"]) == 64
    assert [row["audit_ordinal"] for row in block["records"]] == [*range(63), 80]
    assert block["records"][-1]["context"] == "out-of-sample generation"
    assert block["records"][-1]["candidate_id"] == "b" * 24


def test_seal_byte_budget_resamples_only_candles_and_preserves_full_source_envelope() -> None:
    adapter = CurrentSourceArtifactAdapter(source_artifacts=None, retained_artifacts=None)
    observations = [{
        "at_utc_ms": 1_700_000_000_000 + ordinal * 3_600_000,
        "bar_json": json.dumps({"candle": {
            "open": "100", "close": "101", "high": str(102 + ordinal),
            "low": str(99 - ordinal), "volume": "1",
        }, "transition": ordinal % 2 == 0}),
    } for ordinal in range(600)]
    original = adapter._candle_overview(observations)
    summary = {"immutable_source_fact": "x" * 40_000, "replay": {"candle_overview": original}}
    assert len(adapter._canonical_json(summary).encode()) > 65_536
    adapter._fit_summary_budget(summary, observations)
    actual = summary["replay"]["candle_overview"]
    assert len(adapter._canonical_json(summary).encode()) <= 65_536
    assert actual["emitted_bucket_count"] < original["emitted_bucket_count"]
    assert actual["envelope"] == original["envelope"]
    assert actual["source_bar_count"] == 600
    assert actual["values"][0]["first_ordinal"] == 0
    assert actual["values"][-1]["last_ordinal"] == 599
    assert sum(int(row["volume"]) for row in actual["values"]) == 600
    assert sum(row["transitions"] for row in actual["values"]) == 300
    assert summary["immutable_source_fact"] == "x" * 40_000
    unchanged = adapter._canonical_json(summary)
    adapter._fit_summary_budget(summary, observations)
    assert adapter._canonical_json(summary) == unchanged


def test_late_generation_keeps_its_real_selection_bundle_witness() -> None:
    adapter = CurrentSourceArtifactAdapter(source_artifacts=None, retained_artifacts=None)
    fold = {"fold_id": "1", "payload_json": "{}"}
    lifecycle = pd.DataFrame([{
        "fold_id": "1", "candidate_id": "a" * 24,
        "context": "anti-leakage in-sample search", "strategy_fingerprint": "c" * 64,
    } for _ in range(80)] + [{
        "fold_id": "1", "candidate_id": "b" * 24,
        "context": "out-of-sample scoring", "strategy_fingerprint": "d" * 64,
    }, {
        "fold_id": "1", "candidate_id": "b" * 24,
        "context": "out-of-sample generation", "strategy_fingerprint": "d" * 64,
    }])
    adapter._attach_child_audit([fold], lifecycle=lifecycle, contract={"records_dropped": 0})
    block = json.loads(fold["payload_json"])["child_audit"]
    assert len(block["records"]) == 64 and block["source_record_count"] == 82
    assert [row["audit_ordinal"] for row in block["records"]] == [*range(62), 80, 81]
    assert block["records"][-2]["context"] == "out-of-sample scoring"
    assert block["records"][-2]["strategy_fingerprint"] == "d" * 64


def test_seal_byte_budget_never_drops_authority_to_fit() -> None:
    adapter = CurrentSourceArtifactAdapter(source_artifacts=None, retained_artifacts=None)
    with pytest.raises(CurrentSourceArtifactError) as failure:
        adapter._fit_summary_budget({"immutable_source_fact": "x" * 65_536}, [])
    assert failure.value.code == "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE"
