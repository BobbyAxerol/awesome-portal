"""IS source-time capture: no strategy execution and no retained-sample upgrade."""
from __future__ import annotations

import copy
import dataclasses
import json
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest
from quantbt.core.results import BacktestResultV2
from quantbt.metrics.performance import full_report

from portal_api.services.research_enrich_analysis import enrich_analysis, enrich_fixed_passport, digest_rows
from portal_api.services.research_evidence_metrics import declared_is_scoped_result

RUN = "rrun_" + "a" * 32


def source():
    index = pd.date_range("2026-01-01", periods=80, freq="D", tz="UTC")
    capital = pd.Series(1000 + np.arange(80) * 2 + np.sin(np.arange(80)) * 30, index=index)
    returns = capital.pct_change().fillna(0)
    close = pd.Series(200 + np.arange(80) + np.cos(np.arange(80)) * 2, index=index)
    result = BacktestResultV2(equity=capital, returns=returns,
        positions=pd.DataFrame({"Position_BTCUSDT": [1.0 if i % 3 else -1.0 for i in range(80)]}, index=index),
        closes=pd.DataFrame({"BTCUSDT": close}, index=index), symbols=["BTCUSDT"], initial_capital=500)
    ms = lambda at: int(index[at].value // 1_000_000)
    bounds = {kind: {"start_ms": start, "end_ms": end, "source_locator": f"P10.immutable_requested_spec.windows.{kind}"}
        for kind, start, end in [("is", ms(5), ms(40)), ("oos", ms(40), ms(79) + 86_400_000),
            ("holdout", ms(79) + 86_400_000, ms(79) + 172_800_000)]}
    return result, close, bounds


def enrich(result=None, close=None, bounds=None, **kw):
    r, c, b = source()
    result = r if result is None else result
    close = c if close is None else close
    bounds = b if bounds is None else bounds
    oos = result.equity.index[result.equity.index >= pd.Timestamp(bounds["oos"]["start_ms"], unit="ms", tz="UTC")]
    rows = [[int(at.value // 1_000_000), repr(float(result.equity.loc[at])), repr(float(result.returns.loc[at])),
        [repr(float(v)) for v in result.positions.loc[at]], repr(float(close.reindex(oos).loc[at]))] for at in oos]
    return enrich_analysis(run_id=RUN, result=result, mode="FIXED", market_close=close,
        benchmark_locator="P08.verified_tape:test:close:OOS", is_start_utc_ms=bounds["is"]["start_ms"],
        oos_start_utc_ms=bounds["oos"]["start_ms"], source_windows=bounds,
        source_tables=[{"name": "OBSERVATION", "row_count": len(rows), "digest": digest_rows(rows)}], **kw)


def test_exact_declared_is_engine_metric_and_independent_endpoint_drawdown_oracles():
    result, close, bounds = source()
    before = copy.deepcopy(result)
    block = enrich(result, close, bounds)
    value = block["by_window"]["is"]
    actual = declared_is_scoped_result(result, start_utc_ms=bounds["is"]["start_ms"],
        end_exclusive_utc_ms=bounds["is"]["end_ms"])
    report = full_report(actual, trading_days=365)
    assert actual.equity.equals(result.equity.iloc[5:40]) and actual.initial_capital == 500
    facts = value["facts"]["metrics"]
    assert float(facts["sharpe"]["value"]) == report["sharpe"]
    expected = Decimal(str(actual.equity.iloc[-1])) / Decimal(str(actual.equity.iloc[0])) - 1
    assert abs(Decimal(facts["return_fraction"]["value"]) - expected) < Decimal("1e-25")
    assert float(facts["return_fraction"]["value"]) != report["total_return_pct"] / 100
    dd = actual.equity / actual.equity.cummax() - 1
    assert float(facts["max_drawdown_fraction"]["value"]) == pytest.approx(float(dd.min()), abs=1e-15)
    assert all(fact["scope"] == "IS" and fact["input_digest"] == block["input_digest"] for fact in facts.values())
    assert value["scope"]["observation_count"] == 35 and block["scope"]["observation_count"] == 40
    assert block["windows"]["is"]["state"] == "AVAILABLE" and block["windows"]["holdout"]["state"] == "NOT_PUBLISHED"
    assert result.equity.equals(before.equity) and result.metadata == before.metadata
    assert all(curve[0]["at_utc_ms"] == int(actual.equity.index[0].value // 1_000_000)
        and curve[-1]["at_utc_ms"] == int(actual.equity.index[-1].value // 1_000_000)
        for key, curve in value["curves"].items() if key != "sampling")


def test_complete_is_daily_histogram_quantiles_and_benchmark_use_actual_source():
    result, close, bounds = source()
    value = enrich(result, close, bounds)["by_window"]["is"]
    daily = result.equity.iloc[5:40].resample("1D").last().pct_change().dropna().to_numpy()
    histogram = value["return_distribution"]
    assert histogram["observation_count"] == sum(row["count"] for row in histogram["buckets"]) == len(daily)
    assert float(histogram["mean"]["value"]) == pytest.approx(np.mean(daily), abs=1e-15)
    assert float(histogram["median"]["value"]) == pytest.approx(np.quantile(daily, .5), abs=1e-15)
    var = np.quantile(-daily, .95)
    assert float(histogram["var_95"]["value"]) == pytest.approx(var, abs=1e-15)
    assert float(histogram["cvar_95"]["value"]) == pytest.approx(np.mean(-daily[-daily >= var]), abs=1e-15)
    assert value["benchmark"]["state"] == "AVAILABLE" and value["benchmark"]["source_locator"].endswith(":IS")
    for row in value["curves"]["benchmark_rebased_100"]:
        at = pd.Timestamp(row["at_utc_ms"], unit="ms", tz="UTC")
        assert float(row["value"]) == close.loc[at] / close.iloc[5] * 100


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), 0, -1])
def test_missing_invalid_is_benchmark_never_publishes_substitute_prices(invalid):
    result, close, bounds = source()
    close.iloc[10] = invalid
    value = enrich(result, close, bounds)["by_window"]["is"]
    assert value["benchmark"]["state"] == "NOT_PUBLISHED" and value["curves"]["benchmark_rebased_100"] == []
    assert value["facts"]["metrics"]["sharpe"]["state"] == "AVAILABLE"


def test_full_is_source_rows_and_definitions_change_identity_without_mutating_oos_values():
    result, close, bounds = source()
    original = enrich(result, close, bounds)
    for field in ("equity", "returns", "positions", "close"):
        r, c = copy.deepcopy(result), close.copy()
        array = c if field == "close" else getattr(r, field)
        if isinstance(array, pd.DataFrame):
            array.iloc[10, 0] += .25
        else:
            array.iloc[10] += .25
        changed = enrich(r, c, bounds)
        assert changed["input_digest"] != original["input_digest"]
        assert changed["source_tables"][1]["digest"] != original["source_tables"][1]["digest"]
        assert changed["library_summary"]["return_fraction"] == original["library_summary"]["return_fraction"]
    assert enrich(result, close, bounds) == original
    assert len(json.dumps(original, separators=(",", ":")).encode()) <= 65_536


def test_old_sampled_passport_and_wfo_do_not_gain_is_payload():
    result, close, bounds = source()
    passport = {"source": {"oos_observation_count": 40}, "equity_points": [
        {"at_utc_ms": int(at.value // 1_000_000), "equity": str(capital)}
        for at, capital in result.equity.iloc[40::4].items()]}
    fixed = enrich_fixed_passport(run_id=RUN, passport=passport, source_windows=bounds)
    assert "by_window" not in fixed and fixed["windows"]["is"]["state"] == "NOT_PUBLISHED"
    wf = dataclasses.replace(result, metadata={"walk_forward": {"fold_table": pd.DataFrame([
        {"test_start": result.equity.index[40], "test_end": result.equity.index[-1]}])}})
    block = enrich_analysis(run_id=RUN, result=wf, mode="WFO", market_close=close,
        benchmark_locator="test:close", source_windows=bounds,
        source_tables=[{"name": "OBSERVATION", "row_count": 40, "digest": digest_rows(passport)}])
    assert "by_window" not in block and all(row["name"] != "OBSERVATION_IS" for row in block["source_tables"])


def test_is_flat_sample_absence_bounds_array_alignment_and_input_validation():
    result, close, bounds = source()
    result.equity.iloc[5:40] = 1000
    result.returns.iloc[5:40] = 0
    value = enrich(result, close, bounds)["by_window"]["is"]
    assert value["facts"]["metrics"]["sharpe"]["reason_code"] == "P13_IS_RETURN_ZERO_VARIANCE"
    assert value["facts"]["metrics"]["max_drawdown_fraction"]["value"] == "0"
    assert value["return_distribution"]["buckets"] == []
    with pytest.raises(ValueError, match="bounds disagree"):
        bad = copy.deepcopy(bounds); bad["is"]["end_ms"] -= 1
        enrich(result, close, bad)
    with pytest.raises(ValueError, match="aligned"):
        declared_is_scoped_result(dataclasses.replace(result, returns=result.returns.rename(
            index={result.returns.index[0]: result.returns.index[0] - pd.Timedelta(days=1)})),
            start_utc_ms=bounds["is"]["start_ms"], end_exclusive_utc_ms=bounds["is"]["end_ms"])
    with pytest.raises(ValueError, match="admitted"):
        declared_is_scoped_result(object(), start_utc_ms=0, end_exclusive_utc_ms=1)


def test_composite_is_budget_coarsens_only_display_samples_not_facts(monkeypatch):
    from portal_api.services import research_enrich_analysis as service

    original = enrich()
    budget = len(json.dumps(original, separators=(",", ":")).encode()) - 300
    monkeypatch.setattr(service, "MAX_BYTES", budget)
    fitted = enrich()
    assert len(json.dumps(fitted, separators=(",", ":")).encode()) <= budget
    assert fitted["by_window"]["is"]["curves"]["sampling"]["emitted_point_count"] < 24
    for key in ("facts", "return_basis", "return_distribution", "scope", "benchmark"):
        assert fitted["by_window"]["is"][key] == original["by_window"]["is"][key]
    for key in original.keys() - {"by_window"}:
        assert fitted[key] == original[key]
    monkeypatch.setattr(service, "MAX_BYTES", 1)
    with pytest.raises(ValueError, match="byte budget"):
        enrich()


@pytest.mark.parametrize("adapter", ["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"])
def test_fixed_and_imported_source_capture_preserves_existing_core_and_independent_budgets(adapter):
    from portal_api.workers.research_child import _p13_evidence_source

    result, close, bounds = source()
    market = pd.DataFrame({"close": close}, index=close.index)
    args = dict(market=market, result=result, report=result.full_report(), execution_adapter_id=adapter,
        oos_start_utc_ms=bounds["oos"]["start_ms"], is_start_utc_ms=bounds["is"]["start_ms"], source_windows=bounds)
    original = _p13_evidence_source(**args)
    captured = _p13_evidence_source(**args, run_id=RUN)
    enriched = captured.pop("enriched_analysis")
    assert captured == original
    assert len(json.dumps(captured, separators=(",", ":")).encode()) <= 24 * 1024
    assert len(json.dumps(enriched, separators=(",", ":")).encode()) <= 65_536
    assert enriched["by_window"]["is"]["scope"]["observation_count"] == 35
    assert enriched["scope"]["observation_count"] == 40


def test_is_source_gap_remains_a_gap_and_nonfinite_or_duplicate_account_is_refused():
    result, close, bounds = source()
    removed = result.equity.index[10]
    gapped = dataclasses.replace(result, **{key: getattr(result, key).drop(removed)
        for key in ("equity", "returns", "positions", "closes")})
    value = enrich(gapped, close.drop(removed), bounds)["by_window"]["is"]
    assert value["scope"]["observation_count"] == 34
    assert int(removed.value // 1_000_000) not in [p["at_utc_ms"] for p in value["curves"]["strategy_rebased_100"]]
    result.equity.iloc[10] = float("nan")
    with pytest.raises(ValueError, match="non-finite"):
        declared_is_scoped_result(result, start_utc_ms=bounds["is"]["start_ms"], end_exclusive_utc_ms=bounds["is"]["end_ms"])
    result, _, _ = source()
    result.equity.index = result.equity.index.where(np.arange(80) != 10, result.equity.index[9])
    with pytest.raises(ValueError, match="chronological"):
        declared_is_scoped_result(result, start_utc_ms=bounds["is"]["start_ms"], end_exclusive_utc_ms=bounds["is"]["end_ms"])
