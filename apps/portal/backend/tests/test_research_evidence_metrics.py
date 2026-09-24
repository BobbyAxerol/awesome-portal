"""RF-05 / P13 OOS analytics against real QuantBT 1.1.1 results.

Each value published as ENGINE_DIRECT is compared with the engine's own
number, obtained here by an *independent* path: the OOS slice is cut by hand
(not through the module's ``scoped_result`` call) and handed to QuantBT's
public ``full_report``/``rolling_sharpe``.  Sharpe is additionally checked
against a plain numpy formula over UTC daily closes so a silent change of the
engine's sample would fail loudly.
"""

from __future__ import annotations

import json
import math
import os
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from portal_api.services import research_evidence_metrics as analytics
from portal_api.workers.research_child import _MAX_EVIDENCE_RECEIPT_BYTES, _P04_DELTA_PARAMS, _p13_evidence_source

ACCOUNT = {"initial_capital": 20_000, "leverage": 3, "alloc_per_trade": 2_000, "fee_rate": 0.0005, "use_funding": False}


def _synthetic_market(days: int, *, seed: int = 7, start: str = "2025-01-01") -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    index = pd.date_range(start, periods=days * 24, freq="h", tz="UTC")
    close = 30_000.0 * np.exp(np.cumsum(rng.normal(0.0, 0.004, len(index))))
    open_ = np.concatenate(([close[0]], close[:-1]))
    spread = np.abs(rng.normal(0.0, 0.002, len(index))) * close
    return pd.DataFrame({
        "open": open_, "high": np.maximum(open_, close) + spread, "low": np.minimum(open_, close) - spread,
        "close": close, "volume": rng.uniform(10.0, 100.0, len(index)),
    }, index=index)


def _engine_run(market: pd.DataFrame, signal: pd.Series | None = None):
    from portal_api.adapters.quantbt import QuantBTGateway
    from strategy.delta_rsi import generate_signals

    if signal is None:
        signal = generate_signals(market, dict(_P04_DELTA_PARAMS))["pos_weight"]
    endpoint = QuantBTGateway().signal_notional_endpoint(**ACCOUNT)
    return endpoint.backtest(data=market, signal=signal)


def _manual_oos(result, start_ms: int):
    """Independent OOS slice: a boolean mask, no quantbt scoping helper."""
    from quantbt.core.results import BacktestResultV2

    start = pd.Timestamp(start_ms, unit="ms", tz="UTC")
    mask = result.equity.index >= start
    return BacktestResultV2(
        equity=result.equity.loc[mask], returns=result.returns.loc[mask], positions=result.positions.loc[mask],
        closes=result.closes.loc[mask], symbols=list(result.symbols), initial_capital=float(result.initial_capital),
        leverage=float(result.leverage), liquidated=bool(result.liquidated), liquidation_bar=int(result.liquidation_bar),
    )


def _ms(text: str) -> int:
    return int(pd.Timestamp(text, tz="UTC").value // 1_000_000)


@pytest.fixture(scope="module")
def long_run():
    market = _synthetic_market(180)
    return market, _engine_run(market), _ms("2025-03-01")


def _assert_matches_engine(block: dict, oracle: dict) -> None:
    for key, (field, percent) in analytics.ENGINE_METRIC_FIELDS.items():
        metric = block["metrics"][key]
        assert metric["state"] == "AVAILABLE", key
        expected = float(oracle[field]) / (100.0 if percent else 1.0)
        assert math.isclose(float(metric["value"]), expected, rel_tol=1e-15, abs_tol=0.0), key
        assert metric["locator"] == f"full_report.{field}" + ("/100" if percent else "")
        if not percent:
            # Not merely close: the exact engine float, text round-trips.
            assert float(metric["value"]) == float(oracle[field])


def test_every_engine_metric_equals_quantbt_full_report_over_the_oos_scope(long_run) -> None:
    from quantbt.metrics import full_report

    market, result, start_ms = long_run
    block = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=0, byte_budget=24 * 1024)
    oracle = full_report(_manual_oos(result, start_ms), trading_days=365)

    assert block["state"] == "AVAILABLE"
    assert block["scope_locator"] == analytics.ENGINE_SCOPE_LOCATOR
    _assert_matches_engine(block, oracle)
    # The OOS numbers are not the full-tape numbers the child already reports.
    assert float(block["metrics"]["sharpe"]["value"]) != float(result.full_report()["sharpe"])
    assert block["metrics"]["sharpe_decay"] == {
        "state": "NOT_PUBLISHED", "reason_code": "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT", "value": None, "locator": None,
    }
    assert block["rolling_beta_63"]["state"] == "NOT_PUBLISHED"
    assert block["rolling_beta_63"]["reason_code"] == "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK"


def test_sharpe_matches_an_independent_daily_close_formula(long_run) -> None:
    market, result, start_ms = long_run
    block = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=0, byte_budget=24 * 1024)
    oos = result.equity.loc[result.equity.index >= pd.Timestamp(start_ms, unit="ms", tz="UTC")]
    daily = oos.groupby(oos.index.floor("D")).last().to_numpy()
    returns = np.diff(daily) / daily[:-1]
    expected = returns.mean() / returns.std(ddof=1) * math.sqrt(365)
    assert math.isclose(float(block["metrics"]["sharpe"]["value"]), expected, rel_tol=1e-9)
    assert block["return_sample"] == {
        "kind": "DAILY_UTC_EQUITY", "observation_count": len(returns), "annualization_periods": "365",
    }
    net = daily[-1] / daily[0]
    years = (oos.index[-1] - oos.index[0]).total_seconds() / 86_400 / 365.25
    assert math.isclose(float(block["metrics"]["cagr_fraction"]["value"]), float(np.expm1(np.log(net) / years)), rel_tol=1e-9)


def test_rolling_sharpe_points_are_quantbt_values_with_endpoints_and_extrema(long_run) -> None:
    from quantbt.metrics.performance import rolling_sharpe

    market, result, start_ms = long_run
    rolling = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=0, byte_budget=24 * 1024)["rolling_sharpe_63"]
    oracle = rolling_sharpe(_manual_oos(result, start_ms), window=63, trading_days=365).dropna()
    oracle = oracle[np.isfinite(oracle)]

    assert rolling["state"] == "AVAILABLE"
    assert rolling["source_observation_count"] == len(oracle)
    assert rolling["emitted_point_count"] == len(rolling["points"]) <= analytics.MAX_ROLLING_SHARPE_POINTS
    assert rolling["sampling"] == ("FULL" if len(oracle) <= analytics.MAX_ROLLING_SHARPE_POINTS else "EXTREMA_BUCKET_V1")
    by_ms = {int(stamp.value // 1_000_000): float(value) for stamp, value in oracle.items()}
    for point in rolling["points"]:
        assert float(point["sharpe"]) == by_ms[point["at_utc_ms"]]
    stamps = [point["at_utc_ms"] for point in rolling["points"]]
    assert stamps == sorted(stamps) and len(set(stamps)) == len(stamps)
    assert stamps[0] == min(by_ms) and stamps[-1] == max(by_ms)
    emitted = {float(point["sharpe"]) for point in rolling["points"]}
    assert max(by_ms.values()) in emitted and min(by_ms.values()) in emitted


def test_short_oos_rolling_window_is_typed_not_a_short_window(long_run) -> None:
    market, result, _ = long_run
    block = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=_ms("2025-06-01"), receipt_bytes=0, byte_budget=24 * 1024)
    rolling = block["rolling_sharpe_63"]
    assert rolling["state"] == "NOT_APPLICABLE"
    assert rolling["reason_code"] == "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW"
    assert rolling["points"] == [] and rolling["daily_return_count"] < 63


def test_engine_sentinels_become_typed_absences_never_zero() -> None:
    market = _synthetic_market(40, seed=11)
    flat = _engine_run(market, pd.Series(0.0, index=market.index))
    start_ms = _ms("2025-01-20")
    block = analytics.oos_analytics(result=flat, market=market, oos_start_utc_ms=start_ms, receipt_bytes=0, byte_budget=24 * 1024)
    engine = flat.full_report(scope="full")
    # QuantBT itself reports 0.0 / inf here; those are sentinels, not facts.
    assert engine["sharpe"] == 0.0
    metrics = block["metrics"]
    assert metrics["sharpe"]["reason_code"] == "P13_OOS_RETURN_ZERO_VARIANCE"
    assert metrics["sortino"]["reason_code"] == "P13_OOS_HAS_NO_DOWNSIDE_RETURNS"
    assert metrics["profit_factor"]["reason_code"] == "P13_OOS_HAS_NO_LOSING_RETURNS"
    assert metrics["long_hit_rate_fraction"]["reason_code"] == "P13_OOS_HAS_NO_LONG_EXPOSURE_BARS"
    assert metrics["short_hit_rate_fraction"]["reason_code"] == "P13_OOS_HAS_NO_SHORT_EXPOSURE_BARS"
    for key in ["sharpe", "sortino", "profit_factor", "long_hit_rate_fraction", "short_hit_rate_fraction"]:
        assert metrics[key]["state"] == "NOT_APPLICABLE" and metrics[key]["value"] is None
    # A flat equity still has a real (zero) CAGR over > 1 day: QuantBT's number.
    assert metrics["cagr_fraction"] == {"state": "AVAILABLE", "reason_code": None, "value": "0", "locator": "full_report.cagr_pct/100"}


def test_long_only_signal_keeps_short_hit_rate_typed() -> None:
    market = _synthetic_market(40, seed=5)
    result = _engine_run(market, pd.Series(1.0, index=market.index))
    block = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=_ms("2025-01-20"), receipt_bytes=0, byte_budget=24 * 1024)
    assert block["metrics"]["long_hit_rate_fraction"]["state"] == "AVAILABLE"
    assert block["metrics"]["short_hit_rate_fraction"]["reason_code"] == "P13_OOS_HAS_NO_SHORT_EXPOSURE_BARS"


def test_sub_day_oos_cagr_is_not_quantbts_total_return_substitute() -> None:
    market = _synthetic_market(10, seed=3)
    result = _engine_run(market)
    start_ms = int(market.index[-12].value // 1_000_000)
    block = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=0, byte_budget=24 * 1024)
    assert block["metrics"]["cagr_fraction"]["reason_code"] == "P13_OOS_SPAN_BELOW_ONE_DAY"
    assert block["return_sample"]["kind"] in {"BAR", "DAILY_UTC_EQUITY"}


def test_monthly_leading_boundary_uses_previous_calendar_close_only_at_a_month_edge() -> None:
    index = pd.to_datetime(["2025-01-31T22:00Z", "2025-01-31T23:00Z", "2025-02-01T00:00Z", "2025-02-28T23:00Z", "2025-03-01T00:00Z"])
    equity = pd.Series([90.0, 100.0, 101.0, 110.0, 111.0], index=index)
    edge = analytics.monthly_leading_boundary(equity, oos_start_utc_ms=_ms("2025-02-01"))
    assert edge == {
        "state": "AVAILABLE", "reason_code": None, "base_at_utc_ms": _ms("2025-01-31T23:00"),
        "point": {"month_start_utc_ms": _ms("2025-02-01"), "return_fraction": "0.1"},
    }
    mid = analytics.monthly_leading_boundary(equity, oos_start_utc_ms=_ms("2025-01-31T23:00"))
    assert mid["state"] == "NOT_APPLICABLE" and mid["reason_code"] == "P13_OOS_STARTS_MID_CALENDAR_MONTH"
    first = analytics.monthly_leading_boundary(equity, oos_start_utc_ms=_ms("2025-01-01"))
    assert first["reason_code"] == "P13_NO_PRE_OOS_CLOSE_IN_CHILD_TAPE"


def test_non_engine_result_is_typed_not_published() -> None:
    index = pd.date_range("2025-01-01", periods=5, freq="D", tz="UTC")
    stub = SimpleNamespace(equity=pd.Series([1.0] * 5, index=index), returns=pd.Series([0.0] * 5, index=index))
    block = analytics.oos_analytics(result=stub, market=pd.DataFrame(index=index), oos_start_utc_ms=_ms("2025-01-03"), receipt_bytes=0, byte_budget=24 * 1024)
    assert block["state"] == "NOT_PUBLISHED"
    assert all(item["value"] is None and item["state"] == "NOT_PUBLISHED" for item in block["metrics"].values())


def test_byte_budget_withdraws_rolling_points_before_it_overflows(long_run) -> None:
    market, result, start_ms = long_run
    full = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=0, byte_budget=24 * 1024)
    size = len(json.dumps(full, separators=(",", ":")))
    tight = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=24 * 1024 - size, byte_budget=24 * 1024)
    assert tight["rolling_sharpe_63"]["state"] == "NOT_PUBLISHED"
    assert tight["rolling_sharpe_63"]["reason_code"] == "P13_RECEIPT_BYTE_BUDGET_EXHAUSTED"
    assert tight["rolling_sharpe_63"]["points"] == [] and tight["metrics"] == full["metrics"]
    with pytest.raises(ValueError, match="byte budget"):
        analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=start_ms, receipt_bytes=24 * 1024, byte_budget=24 * 1024)


def test_maximal_analytics_without_rolling_points_fits_beside_the_maximal_receipt() -> None:
    # 21_626 bytes is the maximal legal R2 receipt measured by
    # test_document_budget_has_headroom_for_maximum_normalized_receipt_shape.
    maximal_receipt = 21_626
    value = "-" + "9" * 95
    metric = {"state": "AVAILABLE", "reason_code": None, "value": value, "locator": "full_report.long_hitrate_pct/100"}
    block = {
        "schema_version": analytics.SCHEMA_VERSION, "state": "AVAILABLE", "reason_code": None,
        "scope_locator": analytics.ENGINE_SCOPE_LOCATOR, "report_locator": analytics.ENGINE_REPORT_LOCATOR,
        "return_sample": {"kind": "DAILY_UTC_EQUITY", "observation_count": 2_000_000, "annualization_periods": "9" * 24},
        "metrics": {key: metric for key in [*analytics.ENGINE_METRIC_FIELDS, "sharpe_decay"]},
        "rolling_sharpe_63": {
            "window_days": 63, "daily_return_count": 2_000_000, "locator": analytics.ENGINE_ROLLING_LOCATOR,
            "state": "NOT_PUBLISHED", "reason_code": "P13_RECEIPT_BYTE_BUDGET_EXHAUSTED", "source_observation_count": 2_000_000,
            "omitted_non_finite_count": 2_000_000, "emitted_point_count": 0, "sampling": None, "points": [],
        },
        "rolling_beta_63": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK", "window_days": 63},
        "monthly_leading": {"state": "AVAILABLE", "reason_code": None, "base_at_utc_ms": 1_725_000_000_000, "point": {"month_start_utc_ms": 1_725_000_000_000, "return_fraction": value}},
    }
    assert maximal_receipt + len('"oos_analytics":,') + len(json.dumps(block, separators=(",", ":"))) < _MAX_EVIDENCE_RECEIPT_BYTES


def test_child_receipt_carries_the_block_and_stays_inside_its_budget(long_run, monkeypatch: pytest.MonkeyPatch) -> None:
    market, result, start_ms = long_run
    receipt = _p13_evidence_source(market=market, result=result, report=result.full_report(), oos_start_utc_ms=start_ms)
    assert receipt["oos_analytics"]["state"] == "AVAILABLE"
    assert receipt["oos_analytics"]["rolling_sharpe_63"]["state"] == "AVAILABLE"
    assert len(json.dumps(receipt, separators=(",", ":")).encode("utf-8")) <= _MAX_EVIDENCE_RECEIPT_BYTES
    # March 2025 starts at a calendar edge: its return is measured from the
    # last February close, so the heat map is no longer empty for it.
    leading = receipt["oos_analytics"]["monthly_leading"]
    assert leading["point"]["month_start_utc_ms"] == start_ms
    assert receipt["derived"]["monthly_returns"][0]["month_start_utc_ms"] > start_ms


def _hand_result(equity: list[float], positions: dict[str, list[float]]):
    """A real QuantBT result over a hand-built daily tape (engine math, our inputs)."""
    from quantbt.core.results import BacktestResultV2

    index = pd.date_range("2025-01-01", periods=len(equity), freq="D", tz="UTC")
    series = pd.Series(equity, index=index)
    symbols = list(positions)
    return BacktestResultV2(
        equity=series, returns=series.pct_change().fillna(0.0),
        positions=pd.DataFrame({f"Position_{name}": values for name, values in positions.items()}, index=index),
        closes=pd.DataFrame({name: [1.0] * len(equity) for name in symbols}, index=index),
        symbols=symbols, initial_capital=float(equity[0]), leverage=1.0, liquidated=False, liquidation_bar=-1,
    )


def test_negative_cagr_clamp_is_typed_never_minus_one() -> None:
    from quantbt.metrics.performance import full_report

    # A 30% loss over 2 days: ln(0.7) / (2 / 365.25) < -50, so QuantBT clamps
    # to expm1(-50) == -1.0 and reports cagr_pct == -100.  That is the clamp,
    # not a measured total loss.
    result = _hand_result([100.0, 90.0, 70.0], {"A": [1.0, 1.0, 1.0]})
    assert full_report(result, trading_days=365)["cagr_pct"] == -100.0
    metrics, _ = analytics.engine_oos_metrics(result)
    assert metrics["cagr_fraction"] == {"state": "NOT_APPLICABLE", "reason_code": "P13_QUANTBT_CAGR_CLAMPED", "value": None, "locator": None}


def test_hit_rate_needs_exposure_in_every_column() -> None:
    from quantbt.metrics.performance import full_report

    equity = [100.0, 101.0, 100.5, 102.0]
    # Column B never holds a position: QuantBT averages A's real rate with a
    # 0.0 sentinel for B, so the published mean would be half a fact.
    partial = _hand_result(equity, {"A": [1.0, 1.0, 1.0, 1.0], "B": [0.0, 0.0, 0.0, 0.0]})
    assert full_report(partial, trading_days=365)["long_hitrate_pct"] > 0.0
    metrics, _ = analytics.engine_oos_metrics(partial)
    assert metrics["long_hit_rate_fraction"] == {
        "state": "NOT_APPLICABLE", "reason_code": "P13_OOS_LONG_EXPOSURE_NOT_IN_EVERY_SYMBOL", "value": None, "locator": None,
    }
    assert metrics["short_hit_rate_fraction"]["reason_code"] == "P13_OOS_HAS_NO_SHORT_EXPOSURE_BARS"
    # Exposure in both columns: the engine's own mean is a fact.
    both = _hand_result(equity, {"A": [1.0, 1.0, 1.0, 1.0], "B": [0.0, 1.0, 1.0, 0.0]})
    metrics, _ = analytics.engine_oos_metrics(both)
    assert metrics["long_hit_rate_fraction"]["state"] == "AVAILABLE"
    assert float(metrics["long_hit_rate_fraction"]["value"]) == pytest.approx(full_report(both, trading_days=365)["long_hitrate_pct"] / 100.0, rel=1e-15)


def test_child_publishes_typed_absence_when_analytics_fail(long_run, monkeypatch: pytest.MonkeyPatch) -> None:
    market, result, start_ms = long_run

    def broken(**_: object) -> dict:
        raise ValueError("walk-forward OOS/test scope contains no bars in result index")

    monkeypatch.setattr(analytics, "oos_analytics", broken)
    receipt = _p13_evidence_source(market=market, result=result, report=result.full_report(), oos_start_utc_ms=start_ms)
    block = receipt["oos_analytics"]
    assert block["state"] == "NOT_PUBLISHED" and block["reason_code"] == "P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS"
    assert all(item["value"] is None for item in block["metrics"].values())
    assert block["monthly_leading"]["state"] == "NOT_PUBLISHED"


@pytest.mark.skipif(os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1", reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_REAL_SMOKE=1")
def test_real_btcusdt_history_matches_quantbt_oos_report() -> None:
    """Real, read-only historical slice (the same one-month OOS shape as the preview runs)."""
    from quantbt.metrics import full_report
    from portal_api.adapters.market_data import (
        CRYPTO_BINANCE_DATASET_ID, HistoricalMarketDataProvider, MarketDataQuery, load_historical_data_runtime,
    )

    runtime = load_historical_data_runtime(os.environ["HISTORICAL_MARKET_DATA_ROOT"])
    for first, oos_start, expect_rolling in (("2026-03-01", "2026-07-01", False), ("2026-01-01", "2026-04-01", True)):
        market = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID, symbol="BTCUSDT", timeframe="1h",
            start=f"{first}T00:00:00+00:00", end_exclusive="2026-08-01T00:00:00+00:00",
        )).frame
        result = _engine_run(market)
        start_ms = _ms(oos_start)
        receipt = _p13_evidence_source(market=market, result=result, report=result.full_report(), oos_start_utc_ms=start_ms)
        block = receipt["oos_analytics"]
        _assert_matches_engine(block, full_report(_manual_oos(result, start_ms), trading_days=365))
        assert (block["rolling_sharpe_63"]["state"] == "AVAILABLE") is expect_rolling
        assert block["monthly_leading"]["state"] == "AVAILABLE"
        assert len(json.dumps(receipt, separators=(",", ":")).encode("utf-8")) <= _MAX_EVIDENCE_RECEIPT_BYTES
