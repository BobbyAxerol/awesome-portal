"""LW-03: bounded source custody keeps the late OOS child without fabricating it."""

from __future__ import annotations

import json

import pandas as pd

from portal_api.domain.requests import AdvancedWalkForwardConfig
from portal_api.services.advanced_walkforward_runner import (
    LIFECYCLE_LEDGER_MAX_ROWS,
    _config_fields,
)
from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter


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
