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
    _MAX_CANDLE_OVERVIEW_BUCKETS,
    _MAX_EVIDENCE_RECEIPT_BYTES,
    _candle_overview,
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


# --------------------------------------------------------------- E16-R1

def _ohlc_frame(bars: int, *, volume: bool = True):
    """A deterministic tape whose extremes are known independently here.

    The high spikes on every 7th bar and the low dips on every 11th, so a
    bucketing that quietly averaged -- or that read the bucket's first/last
    bar instead of its extremes -- would land on a different number.
    """

    index = pd.date_range("2026-04-01", periods=bars, freq="h", tz="UTC")
    close = [1_000.0 + (position % 37) for position in range(bars)]
    frame = pd.DataFrame(
        {
            "open": [value - 1.0 for value in close],
            "high": [value + (50.0 if position % 7 == 0 else 2.0) for position, value in enumerate(close)],
            "low": [value - (40.0 if position % 11 == 0 else 2.0) for position, value in enumerate(close)],
            "close": close,
            "volume": [10.0 + position for position in range(bars)],
        },
        index=index,
    )
    return frame if volume else frame.drop(columns=["volume"])


def test_candle_overview_keeps_the_true_extreme_of_every_bucket() -> None:
    frame = _ohlc_frame(600)

    block = _candle_overview(frame, frame.index, receipt_bytes=0, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES)

    assert block["state"] == "AVAILABLE"
    assert block["scope"] == "OOS_EQUITY_WINDOW"
    assert block["sampling"] == "OHLC_BUCKET_V1"
    assert block["emitted_bucket_count"] == len(block["values"])
    assert block["emitted_bucket_count"] <= _MAX_CANDLE_OVERVIEW_BUCKETS
    # Independent oracle: recompute each bucket straight from the frame.
    for bucket in block["values"]:
        window = frame.iloc[bucket["first_ordinal"]: bucket["last_ordinal"] + 1]
        assert float(bucket["high"]) == float(window["high"].max())
        assert float(bucket["low"]) == float(window["low"].min())
        assert float(bucket["open"]) == float(window["open"].iloc[0])
        assert float(bucket["close"]) == float(window["close"].iloc[-1])
        assert float(bucket["volume"]) == pytest.approx(float(window["volume"].sum()))
        # P04 publishes no execution ledger, so this is null, never zero.
        assert bucket["transitions"] is None
    # The envelope is the whole window's extreme, not the widest bucket's guess.
    assert float(block["envelope"]["max_high"]) == float(frame["high"].max())
    assert float(block["envelope"]["min_low"]) == float(frame["low"].min())
    assert block["envelope"]["max_high_at_utc_ms"] == int(frame["high"].idxmax().value // 1_000_000)
    assert block["envelope"]["min_low_at_utc_ms"] == int(frame["low"].idxmin().value // 1_000_000)


def test_candle_overview_covers_the_whole_window_without_a_gap() -> None:
    frame = _ohlc_frame(601)

    block = _candle_overview(frame, frame.index, receipt_bytes=0, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES)

    values = block["values"]
    assert block["source_bar_count"] == 601
    assert values[0]["first_ordinal"] == 0
    assert values[-1]["last_ordinal"] == 600
    for previous, current in zip(values, values[1:]):
        assert current["first_ordinal"] == previous["last_ordinal"] + 1
        assert current["open_utc_ms"] > previous["close_utc_ms"]
    # A ragged final bucket is allowed; an over-wide one is not.
    assert all(
        bucket["last_ordinal"] - bucket["first_ordinal"] + 1 <= block["bucket_bars"]
        for bucket in values
    )
    assert sum(bucket["last_ordinal"] - bucket["first_ordinal"] + 1 for bucket in values) == 601


def test_candle_overview_is_full_when_every_bar_fits() -> None:
    frame = _ohlc_frame(_MAX_CANDLE_OVERVIEW_BUCKETS)

    block = _candle_overview(frame, frame.index, receipt_bytes=0, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES)

    assert block["sampling"] == "FULL"
    assert block["bucket_bars"] == 1
    assert block["emitted_bucket_count"] == _MAX_CANDLE_OVERVIEW_BUCKETS


def test_candle_overview_shrinks_to_fit_and_then_refuses_rather_than_overrun() -> None:
    frame = _ohlc_frame(4_000)

    full = _candle_overview(frame, frame.index, receipt_bytes=0, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES)
    assert full["emitted_bucket_count"] == _MAX_CANDLE_OVERVIEW_BUCKETS

    size = len(json.dumps(full, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    # Leave room for roughly a quarter of the full block: the ladder must give
    # up buckets to fit rather than publish a receipt over its budget.
    squeezed = _candle_overview(
        frame, frame.index,
        receipt_bytes=_MAX_EVIDENCE_RECEIPT_BYTES - (size // 4),
        byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES,
    )
    assert squeezed["state"] == "AVAILABLE"
    assert squeezed["emitted_bucket_count"] < full["emitted_bucket_count"]
    # Coarser, still honest: the envelope is unchanged by the bucket count.
    assert squeezed["envelope"] == full["envelope"]

    starved = _candle_overview(
        frame, frame.index,
        receipt_bytes=_MAX_EVIDENCE_RECEIPT_BYTES - 100,
        byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES,
    )
    assert starved["state"] == "NOT_PUBLISHED"
    assert starved["reason_code"] == "P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET"
    assert starved["values"] == []
    assert starved["envelope"] is None


def test_candle_overview_without_volume_keeps_the_key_and_publishes_null() -> None:
    frame = _ohlc_frame(120, volume=False)

    block = _candle_overview(frame, frame.index, receipt_bytes=0, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES)

    assert block["state"] == "AVAILABLE"
    assert all(bucket["volume"] is None for bucket in block["values"])


def test_p13_receipt_carries_the_overview_of_exactly_the_oos_window(monkeypatch: pytest.MonkeyPatch) -> None:
    import portal_api.adapters.quantbt as quantbt

    monkeypatch.setattr(quantbt, "QuantBTGateway", lambda: SimpleNamespace(version=lambda: "1.1.1"))
    market = _ohlc_frame(500)
    index = market.index
    equity = pd.Series([100.0 + position * 0.1 for position in range(len(index))], index=index)
    result = SimpleNamespace(equity=equity, returns=equity.pct_change().fillna(0.0))
    oos_start = int(index[100].value // 1_000_000)

    receipt = _p13_evidence_source(
        market=market, result=result,
        report={"final_equity": float(equity.iloc[-1]), "num_trades": 3},
        oos_start_utc_ms=oos_start,
    )

    block = receipt["candle_overview"]
    assert block["state"] == "AVAILABLE"
    # The overview counts the OOS bars the receipt already declares, not the
    # full 500-bar child tape it was sliced from.
    assert block["source_bar_count"] == receipt["source"]["oos_observation_count"] == 400
    assert block["values"][0]["open_utc_ms"] == receipt["equity_points"][0]["at_utc_ms"]
    assert block["values"][-1]["close_utc_ms"] == receipt["equity_points"][-1]["at_utc_ms"]
    assert float(block["envelope"]["max_high"]) == float(market["high"].iloc[100:].max())
    # Whatever it costs, the finished receipt is still inside the child budget.
    encoded = len(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    assert encoded <= _MAX_EVIDENCE_RECEIPT_BYTES


def test_candle_overview_refuses_a_tape_whose_own_bar_breaks_ohlc() -> None:
    # A bucket whose high does not bracket its own open would be refused by
    # the ingress contract, and that refusal would reject the whole evidence
    # receipt -- equity series included. The producer must fail here instead.
    frame = _ohlc_frame(40)
    frame.iloc[0, frame.columns.get_loc("high")] = frame["open"].iloc[0] - 10.0

    with pytest.raises(ValueError, match="bucket range is invalid"):
        _candle_overview(frame, frame.index, receipt_bytes=0, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES)


def test_p13_receipt_names_a_tape_without_ohlc_instead_of_failing(monkeypatch: pytest.MonkeyPatch) -> None:
    import portal_api.adapters.quantbt as quantbt

    monkeypatch.setattr(quantbt, "QuantBTGateway", lambda: SimpleNamespace(version=lambda: "1.1.1"))
    index = pd.date_range("2026-04-01", periods=5, freq="D", tz="UTC")
    market = pd.DataFrame({"close": [1.0] * 5}, index=index)
    result = SimpleNamespace(
        equity=pd.Series([80.0, 90.0, 100.0, 110.0, 121.0], index=index),
        returns=pd.Series([0.0, 0.0, 0.0, 0.1, 0.1], index=index),
    )

    receipt = _p13_evidence_source(
        market=market, result=result,
        report={"final_equity": 121.0, "num_trades": 7},
        oos_start_utc_ms=int(index[2].value // 1_000_000),
    )

    assert receipt["candle_overview"] == {
        "state": "NOT_PUBLISHED",
        "reason_code": "P04_TAPE_DID_NOT_PUBLISH_OHLC_COLUMNS",
        "scope": "OOS_EQUITY_WINDOW",
        "source_bar_count": None,
        "emitted_bucket_count": 0,
        "bucket_bars": None,
        "sampling": None,
        "envelope": None,
        "values": [],
    }
