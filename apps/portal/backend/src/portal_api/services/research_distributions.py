"""Bounded all-time OOS presentation facts, computed at seal/backfill only.

Equity and daily returns are source outputs; this is not PnL reconstruction.
No source request, strategy, optimizer or wall-clock value is introduced here.
"""
from __future__ import annotations

from decimal import Decimal, localcontext
from bisect import bisect_right
from typing import Any

from portal_api.services.research_evidence_metrics import decimal_text


def all_time_distributions(*, equity: Any, daily_returns: Any, digest: str,
                           scope_locator: str) -> dict[str, Any]:
    import numpy as np
    import pandas as pd

    if not 2 <= len(equity) <= 2_000_000 or equity.index.tz is None \
            or not equity.index.is_unique or not equity.index.is_monotonic_increasing \
            or not np.isfinite(equity.to_numpy(dtype=float)).all() \
            or np.any(equity.to_numpy(dtype=float) <= 0):
        raise ValueError("all-time distributions require bounded chronological positive OOS equity")
    index = equity.index.tz_convert("UTC").as_unit("ns")
    monthly_values: list[dict[str, Any]] = []
    prior_close: Decimal | None = None
    prior_at: int | None = None
    omitted_leading = 0
    # Missing calendar months are not filled. A previous observed close is
    # disclosed as such, not invented as a missing calendar-boundary price.
    grouped = equity.copy()
    grouped.index = index
    groups = list(grouped.groupby([index.year, index.month], sort=True))
    step_ns = int(np.min(np.diff(index.asi8)))
    with localcontext() as context:
        context.prec = 48
        for ordinal, ((year, month), sample) in enumerate(groups):
            start = pd.Timestamp(year=int(year), month=int(month), day=1, tz="UTC")
            end = start + pd.offsets.MonthBegin(1)
            first_at = int(sample.index[0].value // 1_000_000)
            close_at = int(sample.index[-1].value // 1_000_000)
            close = Decimal(str(sample.iloc[-1]))
            base = Decimal(str(sample.iloc[0])) if prior_close is None else prior_close
            base_at = first_at if prior_at is None else prior_at
            basis = "FIRST_OOS_CLOSE" if prior_close is None else "PREVIOUS_OBSERVED_MONTH_CLOSE"
            partial = (ordinal == 0 or sample.index[0] > start
                       or sample.index[-1].value + step_ns < end.value
                       or (len(sample) > 1 and bool(np.any(np.diff(sample.index.asi8) > step_ns))))
            if ordinal == 0 and len(sample) < 2:
                omitted_leading += 1
            else:
                monthly_values.append({
                    "month_start_utc_ms": int(start.value // 1_000_000),
                    "return_fraction": decimal_text(close / base - Decimal(1)),
                    "partial": partial, "observation_count": len(sample),
                    "basis": basis, "base_at_utc_ms": base_at, "close_at_utc_ms": close_at,
                })
            prior_close, prior_at = close, close_at
    emitted = monthly_values[-32:]
    monthly = {
        "state": "AVAILABLE" if emitted else "NOT_APPLICABLE",
        "reason_code": None if emitted else "PORTAL_MONTHLY_TOO_FEW_OOS_OBSERVATIONS",
        "source_observation_count": len(equity), "emitted_point_count": len(emitted),
        "total_period_count": len(monthly_values), "omitted_leading_period_count": omitted_leading,
        "omitted_transport_period_count": len(monthly_values) - len(emitted),
        "sampling": "FULL" if len(emitted) == len(monthly_values) else "TAIL_WINDOW_V1",
        "values": emitted,
    }
    raw = daily_returns.dropna()
    if raw.index.tz is None or not raw.index.is_unique or not raw.index.is_monotonic_increasing \
            or len(raw) > 2_000_000 or not np.isfinite(raw.to_numpy(dtype=float)).all():
        raise ValueError("daily return histogram requires finite chronological source returns")
    daily_index = raw.index.tz_convert("UTC").normalize()
    if not daily_index.is_unique or (len(raw) and
            (daily_index[0] < index[0].normalize() or daily_index[-1] > index[-1].normalize())):
        raise ValueError("daily return histogram requires one observation per OOS UTC day")
    values = [Decimal(str(value)) for value in raw.to_numpy(dtype=float)]
    distribution = {
        "state": "NOT_APPLICABLE", "reason_code": "PORTAL_DAILY_RETURN_DISTRIBUTION_TOO_FEW_OBSERVATIONS",
        "source_observation_count": len(values), "emitted_point_count": 0,
        "sampling": "NOT_APPLICABLE", "values": [],
    }
    if len(values) >= 2:
        lower, upper = min(values), max(values)
        if lower == upper:
            distribution["reason_code"] = "PORTAL_DAILY_RETURN_DISTRIBUTION_ZERO_VARIANCE"
        else:
            with localcontext() as context:
                context.prec = 48
                # Count against exactly the published edges, not a rounded
                # width quotient (which can put a boundary sample in the
                # preceding exclusive bucket). Endpoints remain exact.
                edges = [(lower * (12 - ordinal) + upper * ordinal) / Decimal(12)
                         for ordinal in range(13)]
                counts = [0] * 12
                for value in values:
                    counts[min(11, max(0, bisect_right(edges, value) - 1))] += 1
                buckets = [{
                    "lower_inclusive": decimal_text(edges[ordinal]),
                    "upper": decimal_text(edges[ordinal + 1]),
                    "upper_inclusive": "true" if ordinal == 11 else "false", "count": str(counts[ordinal]),
                } for ordinal in range(12)]
            distribution.update(state="AVAILABLE", reason_code=None, emitted_point_count=12,
                                sampling="FULL_RETURN_HISTOGRAM_V2", values=buckets)
    return {
        "schema_version": "research.all-time-distributions.v1", "origin": "PORTAL_DERIVED",
        "scope": "OOS", "scope_locator": scope_locator, "input_digest": digest,
        "oos_observation_count": len(equity),
        "monthly_definition": "OOS_MONTH_CLOSE_OVER_FIRST_OOS_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1",
        "distribution_definition": "ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1",
        "monthly_returns": monthly, "return_distribution": distribution,
    }
