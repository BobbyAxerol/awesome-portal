"""Independent RS-01 numerical and receipt-boundary oracles.

These expectations deliberately do not reuse the implementation's grouping or
sampling helpers: a recurrence of the old first-tick monthly calculation must
fail here even if its own helper is internally self-consistent.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.workers.research_child import (
    _MAX_EVIDENCE_RECEIPT_BYTES,
    _monthly_returns,
    _p13_evidence_source,
    _return_distribution,
    _rolling_returns,
)


def test_monthly_return_uses_previous_calendar_close_across_month_boundary() -> None:
    index = pd.to_datetime([
        "2025-01-30T00:00:00Z", "2025-01-31T00:00:00Z",
        "2025-02-01T00:00:00Z", "2025-02-02T00:00:00Z",
    ])
    oos = pd.Series([100.0, 100.0, 120.0, 132.0], index=index)

    actual, coverage = _monthly_returns(oos)

    # February closes at 132 and January closed at 100 => +32%, not the old
    # +10% result created by dividing against February's first observation.
    assert actual == [{"month_start_utc_ms": 1_738_368_000_000, "return_fraction": "0.32"}]
    assert coverage == {
        "source_observation_count": 4,
        "emitted_point_count": 1,
        "total_period_count": 1,
        "omitted_leading_period_count": 1,
        "omitted_transport_period_count": 0,
        "sampling": "FULL",
    }


def test_monthly_tail_never_claims_complete_coverage() -> None:
    index = pd.date_range("2010-01-31", periods=50, freq="ME", tz="UTC")
    oos = pd.Series([100.0 + index_ for index_ in range(len(index))], index=index)
    actual, coverage = _monthly_returns(oos)

    assert len(actual) == 32
    assert coverage["total_period_count"] == 49
    assert coverage["omitted_transport_period_count"] == 17
    assert coverage["sampling"] == "TAIL_WINDOW_V1"


def test_monthly_treats_a_naive_source_index_as_utc_and_omits_its_partial_first_period() -> None:
    index = pd.to_datetime([
        "2025-12-31T23:00:00", "2026-01-01T00:00:00", "2026-01-31T23:00:00",
    ])
    oos = pd.Series([100.0, 120.0, 132.0], index=index)

    actual, coverage = _monthly_returns(oos)

    assert actual == [{"month_start_utc_ms": 1_767_225_600_000, "return_fraction": "0.32"}]
    assert coverage["omitted_leading_period_count"] == 1


def test_distribution_keeps_zero_variance_and_non_finite_populations_typed() -> None:
    assert _return_distribution([0.0, 0.0]) == {
        "state": "NOT_APPLICABLE",
        "reason_code": "P04_RETURN_DISTRIBUTION_ZERO_VARIANCE",
        "buckets": [],
    }
    assert _return_distribution([float("nan"), float("inf")]) == {
        "state": "NOT_APPLICABLE",
        "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FINITE_RETURN_OBSERVATIONS",
        "buckets": [],
    }


def test_histogram_final_bucket_is_explicitly_inclusive_and_conserves_values() -> None:
    distribution = _return_distribution([-0.2, -0.1, 0.0, 0.1, 0.2])
    assert distribution["state"] == "AVAILABLE"
    assert distribution["buckets"][-1]["upper"] == "0.2"
    assert distribution["buckets"][-1]["upper_inclusive"] == "true"
    assert sum(int(item["count"]) for item in distribution["buckets"]) == 5


def test_rolling_metadata_is_about_the_rolling_series_not_equity_sample() -> None:
    index = pd.date_range("2025-01-01", periods=80, freq="h", tz="UTC")
    equity = [100.0 + number for number in range(80)]
    values, coverage = _rolling_returns(pd.Series(equity, index=index), equity)
    assert coverage["source_observation_count"] == 60
    assert coverage["emitted_point_count"] == len(values)
    assert coverage["emitted_point_count"] <= 16
    assert coverage["sampling"] == "EXTREMA_BUCKET_V1"


def test_document_budget_has_headroom_for_maximum_normalized_receipt_shape() -> None:
    # The actual child checks this just before returning. This independent
    # full-envelope maximum guards key-name growth as well as point caps: all
    # legal decimal/count/reason fields are made deliberately maximal here.
    positive = "9" * 96
    signed = "-" + "9" * 95
    digest = "a" * 64
    reason = "R" + "A" * 159
    receipt = {
        "schema_version": "research.p13.evidence-source.v1",
        "source": {
            "execution_adapter_id": "p04.delta-rsi.v1", "engine_version": "1.1.1",
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY", "oos_observation_count": 2_000_000,
            "emitted_equity_points": 32, "chart_sampling": "EXTREMA_BUCKET_V1", "source_transform_digest": digest,
            "evidence_transform_revision": "P13_SOURCE_R2",
            "direct_metric_scopes": {"initial_equity": "OOS_EQUITY_SERIES", "final_equity": "OOS_EQUITY_SERIES", "num_trades": "FULL_CHILD_TAPE", "bars": "FULL_CHILD_TAPE"},
            "series_metadata": {
                "equity_oos": {"source_observation_count": 2_000_000, "emitted_point_count": 32, "sampling": "EXTREMA_BUCKET_V1"},
                "monthly_returns": {"source_observation_count": 2_000_000, "emitted_point_count": 32, "total_period_count": 2_000_000, "omitted_leading_period_count": 1, "omitted_transport_period_count": 1_999_968, "sampling": "TAIL_WINDOW_V1"},
                "rolling_returns_20": {"source_observation_count": 1_999_980, "emitted_point_count": 16, "sampling": "EXTREMA_BUCKET_V1", "window_observations": 20},
                "return_distribution": {"source_observation_count": 2_000_000, "emitted_point_count": 12, "sampling": "FULL_RETURN_HISTOGRAM_V2"},
            },
        },
        "direct": {"initial_equity": positive, "final_equity": positive, "num_trades": "9" * 24, "bars": "9" * 24},
        "derived": {
            "net_return_fraction": signed, "max_drawdown_fraction": signed,
            "monthly_returns": [{"month_start_utc_ms": 1_725_000_000_000, "return_fraction": signed}] * 32,
            "rolling_returns_20_observations": [{"at_utc_ms": 1_725_000_000_000, "return_fraction": signed}] * 16,
            "return_distribution": {"state": "AVAILABLE", "reason_code": None, "buckets": [{"lower_inclusive": signed, "upper": positive, "upper_inclusive": "false", "count": "9" * 24}] * 12},
        },
        "equity_points": [{"at_utc_ms": 1_725_000_000_000, "equity": positive, "drawdown_fraction": signed}] * 32,
        "unavailable": {key: {"state": "NOT_PUBLISHED", "reason_code": reason} for key in ["benchmark", "funding", "audited_fills", "per_fold_metrics"]},
    }
    assert len(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8")) < _MAX_EVIDENCE_RECEIPT_BYTES


def test_oos_metrics_exclude_warmup_and_is_but_counters_state_child_tape_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    # A source tape contains a warmup/IS prefix. The public R2 endpoints must
    # start at the immutable OOS boundary, while the source counters remain
    # explicitly labelled as full child-tape facts rather than being recast as
    # OOS metrics.
    import portal_api.adapters.quantbt as quantbt

    monkeypatch.setattr(quantbt, "QuantBTGateway", lambda: SimpleNamespace(version=lambda: "1.1.1"))
    index = pd.date_range("2025-01-01", periods=5, freq="D", tz="UTC")
    market = pd.DataFrame({"close": [1, 1, 1, 1, 1]}, index=index)
    result = SimpleNamespace(
        equity=pd.Series([80.0, 90.0, 100.0, 110.0, 121.0], index=index),
        returns=pd.Series([0.0, 0.0, 0.0, 0.1, 0.1], index=index),
    )

    receipt = _p13_evidence_source(
        market=market,
        result=result,
        report={"final_equity": 121.0, "num_trades": 7},
        oos_start_utc_ms=int(index[2].value // 1_000_000),
    )

    assert receipt["direct"]["initial_equity"] == "100"
    assert receipt["direct"]["final_equity"] == "121"
    assert receipt["derived"]["net_return_fraction"] == "0.21"
    assert receipt["direct"] == {"initial_equity": "100", "final_equity": "121", "num_trades": "7", "bars": "5"}
    assert receipt["source"]["direct_metric_scopes"] == {
        "initial_equity": "OOS_EQUITY_SERIES",
        "final_equity": "OOS_EQUITY_SERIES",
        "num_trades": "FULL_CHILD_TAPE",
        "bars": "FULL_CHILD_TAPE",
    }
