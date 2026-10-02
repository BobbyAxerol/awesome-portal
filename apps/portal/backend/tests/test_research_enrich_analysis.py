"""Independent B6 expectations; fixtures are synthetic, never runtime receipts."""
from __future__ import annotations
import copy
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from portal_api.services.research_enrich_analysis import enrich_retained, enrich_fixed_passport, drawdown_episodes, distribution_statistics, declared_source_windows

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
    basis = value["library_summary"]["return_basis"]
    assert basis == {"definition_id": "FIRST_LAST_RETAINED_OOS_EQUITY_V1", "scope": "RETAINED_OOS_OBSERVATIONS",
        "first_at_utc_ms": rows[0]["at_utc_ms"], "last_at_utc_ms": rows[-1]["at_utc_ms"],
        "start_equity": rows[0]["equity"], "end_equity": rows[-1]["equity"], "source_locator": value["scope"]["locator"]}

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


@pytest.mark.parametrize("sample,expected", [
    ([-0.2, -0.1, 0.1, 0.2], {"mean": "0", "median": "0", "var_95": "0.185", "cvar_95": "0.2"}),
    ([0.1, 0.2, 0.3], {"mean": "0.2", "median": "0.2", "var_95": "-0.11", "cvar_95": "-0.1"}),
    ([-0.1, -0.1, 0.2, 0.2], {"mean": "0.05", "median": "0.05", "var_95": "0.1", "cvar_95": "0.1"}),
    ([0.0, 0.0], {"mean": "0", "median": "0", "var_95": "0", "cvar_95": "0"}),
])
def test_daily_statistics_independent_exact_oracle_and_signed_losses(sample, expected):
    import pandas as pd
    daily = pd.Series(sample, index=pd.date_range("2026-01-01", periods=len(sample), tz="UTC"))
    facts = distribution_statistics(daily_returns=daily, digest="a" * 64, sampled=False)
    assert {key: fact["value"] for key, fact in facts.items()} == expected
    assert all(fact["state"] == "AVAILABLE" and fact["origin"] == "PORTAL_DERIVED"
        and fact["input_digest"] == "a" * 64 and fact["scope"] == "OOS" for fact in facts.values())
    assert daily.tolist() == sample


def test_daily_statistics_insufficient_or_sampled_inputs_are_per_fact_absent():
    import pandas as pd
    for sample in ([], [0.01]):
        facts = distribution_statistics(daily_returns=pd.Series(sample, dtype=float), digest="a" * 64, sampled=False)
        assert all(fact["state"] == "NOT_APPLICABLE" and fact["value"] is None
            and fact["reason_code"] == "PORTAL_DAILY_RETURN_STATISTICS_TOO_FEW_OBSERVATIONS" for fact in facts.values())
    facts = distribution_statistics(daily_returns=None, digest="a" * 64, sampled=True)
    assert all(fact["state"] == "NOT_PUBLISHED" and fact["value"] is None
        and fact["reason_code"] == "P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER" for fact in facts.values())
    with pytest.raises(ValueError):
        distribution_statistics(daily_returns=pd.Series([0.01, float("inf")]), digest="a" * 64, sampled=False)


def test_enrichment_statistics_population_policy_and_descriptive_not_inferred_regime():
    value = block()
    histogram = value["return_distribution"]
    assert histogram["statistics_policy"] == {"quantile_method": "LINEAR_TYPE_7", "probability": "0.95",
        "risk_variable": "LOSS_FRACTION_NEGATIVE_RETURN", "risk_sign": "SIGNED_LOSS_FRACTION",
        "tail": "LOSS_GTE_VAR_INCLUSIVE", "minimum_observations": 2}
    assert histogram["mean"]["input_digest"] == value["input_digest"]
    assert histogram["mean"]["state"] == "AVAILABLE" and histogram["observation_count"] == 59
    for episode in value["drawdown_episodes"]["values"]:
        assert episode["label"].startswith("Drawdown ")
        assert ("(open)" in episode["label"]) == (episode["recovery_utc_ms"] is None)
        assert episode["regime"]["state"] == "NOT_PUBLISHED" and episode["regime"]["value"] is None
        assert episode["regime"]["input_digest"] == value["input_digest"]


def test_optional_source_window_bounds_are_digest_bound_and_never_create_accounts():
    rows, folds = raw_rows()
    bounds = {"oos": {"start_ms": rows[0]["at_utc_ms"], "end_ms": rows[-1]["at_utc_ms"] + 86_400_000,
        "source_locator": "P08.sealed_windows.OOS"},
        "holdout": {"start_ms": rows[-1]["at_utc_ms"] + 86_400_000,
            "end_ms": rows[-1]["at_utc_ms"] + 172_800_000, "source_locator": "P08.sealed_windows.HOLDOUT"}}
    before = copy.deepcopy(bounds)
    plain = enrich_retained(run_id=RUN, observations=rows, folds=folds)
    value = enrich_retained(run_id=RUN, observations=rows, folds=folds, source_windows=bounds)
    assert value["input_digest"] != plain["input_digest"] and bounds == before
    assert "start_ms" not in plain["windows"]["oos"] and "start_ms" not in value["windows"]["is"]
    assert value["windows"]["oos"]["start_ms"] == rows[0]["at_utc_ms"]
    assert value["windows"]["oos"]["bounds_semantics"] == "START_INCLUSIVE_END_EXCLUSIVE"
    assert value["windows"]["holdout"]["state"] == "NOT_PUBLISHED"
    assert set(value["curves"]) == set(plain["curves"]) and value["rolling"] is None
    for invalid in ({"oos": {**bounds["oos"], "end_ms": rows[-1]["at_utc_ms"]}},
        {"is": {"start_ms": 0, "end_ms": 1}}, {"oos": {**bounds["oos"], "start_ms": True}}):
        with pytest.raises(ValueError):
            enrich_retained(run_id=RUN, observations=rows, folds=folds, source_windows=invalid)


def test_immutable_producer_window_dates_are_utc_bounds_not_new_account_facts():
    assert declared_source_windows(None) == {}
    assert declared_source_windows({"span": {"start": "2026-01-01", "end_exclusive": "2026-02-01"}}) == {}
    result = declared_source_windows({"oos": {"start": "2026-07-01", "end_exclusive": "2026-08-01T00:00:00Z"}})
    assert result == {"oos": {"start_ms": 1782864000000, "end_ms": 1785542400000,
        "source_locator": "P10.immutable_requested_spec.windows.oos"}}
    assert declared_source_windows({"oos": {"start": "2026-07-01T07:00:00+07:00",
        "end_exclusive": "2026-08-01T07:00:00+07:00"}}) == result
    for windows in (["invalid"], {"oos": {"start": "2026-07-01"}},
        {"oos": {"start": "not-an-instant", "end_exclusive": "2026-08-01"}},
        {"oos": {"start": "2026-08-01", "end_exclusive": "2026-07-01"}}):
        with pytest.raises(ValueError):
            declared_source_windows(windows)
