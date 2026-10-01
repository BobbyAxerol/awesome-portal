"""Independent monthly and daily-histogram oracles, no optimizer or market I/O."""
from __future__ import annotations

from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from portal_api.services.research_distributions import all_time_distributions


def _block(equity=None, daily=None):
    equity = equity if equity is not None else pd.Series([100, 110, 99, 108.9],
        index=pd.date_range("2026-01-30", periods=4, freq="1D", tz="UTC"))
    daily = daily if daily is not None else pd.Series(
        np.resize([0, .1, -.1, .1], len(equity)), index=equity.index)
    return all_time_distributions(equity=equity, daily_returns=daily,
        digest="a" * 64, scope_locator="synthetic:sealed_OOS_fold_union")


def test_monthly_includes_leading_scope_and_exact_prior_month_arithmetic():
    block = _block()
    monthly = block["monthly_returns"]
    assert monthly["omitted_leading_period_count"] == 0
    assert len(monthly["values"]) == 2
    january, february = monthly["values"]
    assert january["return_fraction"] == "0.1"
    assert january["partial"] is True and january["basis"] == "FIRST_OOS_CLOSE"
    assert january["observation_count"] == 2
    assert february["return_fraction"] == "-0.01"
    assert february["basis"] == "PREVIOUS_OBSERVED_MONTH_CLOSE"
    assert february["base_at_utc_ms"] == january["close_at_utc_ms"]
    # Product of the two monthly fractions equals the independent first/last
    # source-equity ratio, not a sum or sampled-equity reconstruction.
    assert (Decimal(1) + Decimal(january["return_fraction"])) * \
        (Decimal(1) + Decimal(february["return_fraction"])) == Decimal("1.089")


def test_histogram_is_daily_not_hourly_and_counts_all_observed_returns():
    equity = pd.Series(np.linspace(100, 120, 72),
        index=pd.date_range("2026-07-01", periods=72, freq="1h", tz="UTC"))
    daily = pd.Series([-.03, .01, .04], index=pd.date_range("2026-07-01", periods=3, tz="UTC"))
    histogram = _block(equity, daily)["return_distribution"]
    assert histogram["source_observation_count"] == 3  # not 72 bars
    assert sum(int(bucket["count"]) for bucket in histogram["values"]) == 3
    assert histogram["values"][0]["count"] == "1"
    assert histogram["values"][-1]["count"] == "1"
    assert histogram["values"][-1]["upper"] == "0.04"
    assert all(bucket["upper_inclusive"] == ("true" if i == 11 else "false")
               for i, bucket in enumerate(histogram["values"]))


def test_histogram_counts_internal_boundary_in_the_inclusive_lower_bucket():
    histogram = _block()["return_distribution"]
    assert histogram["values"][5]["upper"] == "0"
    assert histogram["values"][5]["count"] == "0"
    assert histogram["values"][6]["lower_inclusive"] == "0"
    assert histogram["values"][6]["count"] == "1"


def test_single_month_is_not_discarded_and_missing_months_are_not_filled():
    equity = pd.Series([100, 105], index=pd.to_datetime(["2026-07-15", "2026-07-20"], utc=True))
    monthly = _block(equity)["monthly_returns"]
    assert monthly["values"][0]["return_fraction"] == "0.05"
    assert monthly["values"][0]["partial"] is True
    equity.index = pd.to_datetime(["2026-07-15", "2026-09-20"], utc=True)
    monthly = _block(equity)["monthly_returns"]
    assert len(monthly["values"]) == 1
    assert monthly["omitted_leading_period_count"] == 1
    assert monthly["values"][0]["basis"] == "PREVIOUS_OBSERVED_MONTH_CLOSE"
    assert monthly["values"][0]["return_fraction"] == "0.05"


def test_constant_and_empty_daily_samples_are_typed_not_zero_filled():
    for daily, reason in [(pd.Series([.1, .1], index=pd.date_range("2026-01-30", periods=2, tz="UTC")), "ZERO_VARIANCE"),
                          (pd.Series([], index=pd.DatetimeIndex([], tz="UTC"), dtype=float), "TOO_FEW_OBSERVATIONS")]:
        histogram = _block(daily=daily)["return_distribution"]
        assert histogram["state"] == "NOT_APPLICABLE"
        assert histogram["reason_code"].endswith(reason)
        assert histogram["values"] == []


@pytest.mark.parametrize("values", [[100, 0], [100, float("nan")], [100, -1]])
def test_invalid_equity_cannot_be_sealed(values):
    equity = pd.Series(values, index=pd.date_range("2026-07-01", periods=2, tz="UTC"))
    with pytest.raises(ValueError):
        _block(equity)


def test_histogram_refuses_hourly_or_out_of_scope_samples():
    for dates in (["2026-01-30T00:00:00Z", "2026-01-30T01:00:00Z"],
                  ["2026-01-29T00:00:00Z", "2026-01-30T00:00:00Z"]):
        daily = pd.Series([.01, .02], index=pd.to_datetime(dates, utc=True))
        with pytest.raises(ValueError, match="one observation per OOS UTC day"):
            _block(daily=daily)


def test_long_history_discloses_transport_omission_without_rolling_the_input():
    index = pd.date_range("2022-01-01", "2026-01-01", freq="1D", tz="UTC")
    equity = pd.Series(np.linspace(100, 200, len(index)), index=index)
    daily = pd.Series(np.linspace(-.01, .01, len(index)), index=index)
    block = _block(equity, daily)
    monthly = block["monthly_returns"]
    assert monthly["emitted_point_count"] == 32
    assert monthly["sampling"] == "TAIL_WINDOW_V1"
    assert monthly["total_period_count"] == 49
    assert monthly["omitted_transport_period_count"] == 17
    assert block["return_distribution"]["source_observation_count"] == len(index)
