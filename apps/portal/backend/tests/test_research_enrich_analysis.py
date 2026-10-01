"""Independent B6 expectations; fixtures are synthetic, never runtime receipts."""
from __future__ import annotations
import copy
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from portal_api.services.research_enrich_analysis import enrich_retained, enrich_fixed_passport, drawdown_episodes

RUN = "rrun_" + "a" * 32

def raw_rows(*, candles=True):
    start = datetime(2026, 7, 10, tzinfo=timezone.utc)
    rows = []
    previous = 1000
    for i in range(60):
        value = 1000 + i * 2 + (10 if i % 5 else -10)
        row = {"at_utc_ms": int((start + timedelta(days=i)).timestamp() * 1000), "equity": str(value),
            "return_fraction": str(value / previous - 1), "accepted_position": "1" if i % 3 else "0",
            "bar": {"turnover": "2", "candle": {"close": str(200 + i)}} if candles else None}
        previous = value; rows.append(row)
    folds = [{"test_start_utc_ms": rows[0]["at_utc_ms"], "test_end_utc_ms": rows[-1]["at_utc_ms"]}]
    return rows, folds

def block(candles=True):
    rows, folds = raw_rows(candles=candles)
    return enrich_retained(run_id=RUN, observations=rows, folds=folds, nominal_bar_ms=86_400_000)

def test_deterministic_all_time_shapes_and_no_input_mutation():
    rows, folds = raw_rows(); before = copy.deepcopy(rows)
    a = enrich_retained(run_id=RUN, observations=rows, folds=folds)
    b = enrich_retained(run_id=RUN, observations=rows, folds=folds)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert a == enrich_retained(run_id=RUN, observations=rows, folds=folds, nominal_bar_ms=86_400_000)
    assert rows == before and a["rolling"] is None
    assert a["basis"] == a["library_summary"]["basis"] == "ALL_TIME"
    assert a["scope"]["observation_count"] == 60
    assert a["facts"]["behaviour"]["turnover_notional"]["value"] == "120"
    assert all(f["input_digest"] == a["input_digest"] for f in a["facts"]["metrics"].values())
    assert all(f["origin"] == "PORTAL_DERIVED" for f in a["facts"]["metrics"].values())
    assert len(json.dumps(a)) < 65_536

def test_leading_month_daily_histogram_and_full_scope_sparkline():
    value = block(); rows, _ = raw_rows()
    assert len(value["monthly_returns"]["values"]) == 3
    leading = value["monthly_returns"]["values"][0]
    assert leading["partial"] and leading["basis"] == "FIRST_OOS_CLOSE"
    assert abs(Decimal(leading["return_fraction"]) - (Decimal(rows[21]["equity"]) / Decimal(rows[0]["equity"]) - 1)) < Decimal("1e-24")
    histogram = value["return_distribution"]
    assert sum(row["count"] for row in histogram["buckets"]) == histogram["observation_count"] == 59
    assert all(isinstance(row["count"], int) for row in histogram["buckets"])
    assert value["library_summary"]["sparkline"][0]["at_utc_ms"] == rows[0]["at_utc_ms"]
    assert value["library_summary"]["sparkline"][-1]["at_utc_ms"] == rows[-1]["at_utc_ms"]

def test_no_benchmark_or_is_payload_never_claimed_available():
    value = block(False)
    for key in ("beta", "correlation", "long_hit_rate_fraction", "benchmark_return_fraction"):
        assert value["facts"]["metrics"][key]["reason_code"] == "AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED"
    assert value["windows"]["is"]["state"] == "NOT_PUBLISHED"
    assert value["facts"]["metrics"]["sharpe_decay"]["state"] != "AVAILABLE"

def test_open_episode_and_peak_recovery_truth():
    import pandas as pd
    index = pd.date_range("2026-01-01", periods=8, freq="D", tz="UTC")
    episodes, open_present, longest_open = drawdown_episodes(index, [100, 90, 95, 100, 110, 80, 85, 85])
    assert len(episodes) == 2 and open_present and longest_open
    assert episodes[0]["recovery_utc_ms"] == int(index[3].value // 1_000_000)
    assert episodes[1]["recovery_utc_ms"] is None and episodes[1]["duration_seconds"] == 3 * 86400

def test_sampled_single_month_fixed_never_claims_daily_or_positions():
    rows, _ = raw_rows()
    passport = {"source": {"oos_observation_count": 744}, "equity_points": [
        {"at_utc_ms": row["at_utc_ms"], "equity": row["equity"]} for row in rows[:20:2]]}
    value = enrich_fixed_passport(run_id=RUN, passport=passport, nominal_bar_ms=3_600_000)
    assert value["lane"] == "FIXED" and value["scope"]["coverage"] == "SAMPLED_RETAINED_EQUITY"
    assert len(value["monthly_returns"]["values"]) == 1 and value["monthly_returns"]["values"][0]["partial"]
    assert value["return_distribution"]["state"] == "NOT_PUBLISHED" and value["return_distribution"]["buckets"] == []
    assert value["facts"]["behaviour"]["turnover_notional"]["value"] is None

def test_changed_retained_diagnostic_changes_input_identity():
    rows, folds = raw_rows(); a = enrich_retained(run_id=RUN, observations=rows, folds=folds)
    rows[0]["bar"]["turnover"] = "3"
    b = enrich_retained(run_id=RUN, observations=rows, folds=folds)
    assert a["input_digest"] != b["input_digest"] and b["facts"]["behaviour"]["turnover_notional"]["value"] == "121"

def test_invalid_source_truth_fails_closed():
    rows, folds = raw_rows(); rows[1]["at_utc_ms"] = rows[0]["at_utc_ms"]
    with pytest.raises(ValueError): enrich_retained(run_id=RUN, observations=rows, folds=folds)
