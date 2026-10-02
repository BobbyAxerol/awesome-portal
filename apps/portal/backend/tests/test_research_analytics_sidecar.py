"""AN-29: only immutable retained bars/folds may feed an additive sidecar."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io
import json

import pytest

from portal_api.services.research_analytics_sidecar import derive_sidecar, main


def _rows():
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    rows = []
    for ordinal in range(90):
        at = int((start + timedelta(days=ordinal)).timestamp() * 1000)
        rows.append({
            "at_utc_ms": at, "equity": str(1000 + ordinal * 3),
            "return_fraction": "0" if ordinal == 0 else str(3 / (997 + ordinal * 3)),
            "accepted_position": "1" if ordinal % 5 else "0",
            "bar": {"candle": {"close": str(200 + ordinal)}},
        })
    folds = [
        {"test_start_utc_ms": rows[20]["at_utc_ms"], "test_end_utc_ms": rows[49]["at_utc_ms"]},
        {"test_start_utc_ms": rows[60]["at_utc_ms"], "test_end_utc_ms": rows[89]["at_utc_ms"]},
    ]
    return rows, folds


def test_old_seal_sidecar_is_derived_from_oos_and_does_not_claim_trade_ledger():
    observations, folds = _rows()
    block = derive_sidecar(observations, folds)
    assert block["schema_version"] == "research.retained-analytics.v2"
    assert block["oos_observation_count"] == 60
    assert block["metrics"]["benchmark_return_fraction"]["state"] == "AVAILABLE"
    assert block["metrics"]["sharpe"]["origin"] == "PORTAL_DERIVED"
    assert block["metrics"]["profit_factor"]["state"] == "NOT_APPLICABLE"
    assert block["metrics"]["profit_factor"]["reason_code"] == "P13_OOS_HAS_NO_LOSING_RETURNS"
    assert block["metrics"]["long_hit_rate_fraction"]["state"] == "AVAILABLE"
    assert block["metrics"]["long_hit_rate_fraction"]["origin"] == "PORTAL_DERIVED"


def test_missing_retained_candles_are_not_inferred_from_account_returns():
    observations, folds = _rows()
    for row in observations:
        row.pop("bar")
    block = derive_sidecar(observations, folds)
    assert block["metrics"]["sharpe"]["state"] == "AVAILABLE"
    assert block["metrics"]["benchmark_return_fraction"]["state"] != "AVAILABLE"
    for key in ("long_hit_rate_fraction", "short_hit_rate_fraction"):
        assert block["metrics"][key]["reason_code"] == "AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED"


def test_old_seal_sidecar_rejects_overlapping_fold_truth():
    observations, folds = _rows()
    folds[1]["test_start_utc_ms"] = folds[0]["test_end_utc_ms"]
    with pytest.raises(ValueError, match="overlap"):
        derive_sidecar(observations, folds)


def test_wfo_operator_amendment_keeps_actual_source_locator_and_normalizes_offsets(monkeypatch, capsys):
    observations, folds = _rows()
    protocol = [{"kind": "META", "expected": {"OBSERVATION": len(observations), "FOLD": len(folds)},
        "enrichment": {"run_id": "rrun_" + "a" * 32, "nominal_bar_ms": 86_400_000,
            "source_window_basis": "WFO_DECLARED_OOS_SPAN", "source_windows": {"oos": {
                "start": "2025-01-21T07:00:00+07:00", "end_exclusive": "2025-04-01T07:00:00+07:00"}}}}]
    for kind, rows in (("FOLD", folds), ("OBSERVATION", observations)):
        protocol.extend({"kind": kind, "ordinal": ordinal, "payload": row} for ordinal, row in enumerate(rows))
    monkeypatch.setattr("sys.stdin", io.StringIO("\n".join(json.dumps(row) for row in protocol)))
    main()
    result = json.loads(capsys.readouterr().out)
    assert result["windows"]["oos"]["source_locator"] == "P10.immutable_requested_spec.walk_forward:split_mode..end_exclusive"
    assert result["windows"]["oos"]["start_ms"] == observations[20]["at_utc_ms"]
    assert "start_ms" not in result["windows"]["is"]
    assert "start_ms" not in result["windows"]["holdout"]


def test_operator_amendment_refuses_unpublished_window_basis(monkeypatch):
    protocol = {"kind": "META", "expected": {"OBSERVATION": 0, "FOLD": 0},
        "enrichment": {"run_id": "rrun_" + "a" * 32, "source_window_basis": "UNPUBLISHED"}}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(protocol)))
    with pytest.raises(ValueError, match="basis is not published"):
        main()
